// bookingcare-backend/src/services/walletService.js
// Dịch vụ Phân hệ Ví điện tử & Sổ cái bất biến (Financial Wallet & Ledger Subsystem)
'use strict';

const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const db = require('../models');
const VNPAY_ALLOWED_KEYS = require('../utils/vnpayAllowedKeys');
const withdrawalPolicyService = require('./withdrawalPolicyService');
const notificationService = require('./notificationService');

// VNPay Environment Variables (dynamic lookup from process.env)
const getVnpTmnCode = () => process.env.VNP_TMN_CODE;
const getVnpHashSecret = () => process.env.VNP_HASH_SECRET;
const getVnpUrl = () => process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const getVnpReturnUrl = () => process.env.VNP_RETURN_URL || 'http://localhost:3000/patient/wallet';

function sortObject(obj) {
  const sorted = {};
  const str = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (let key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
}

/**
 * Lấy hoặc khởi tạo ví cho người dùng
 */
async function getOrCreateWallet(userId, walletType = 'PATIENT', transaction = null) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const options = {
    where: { ownerId: userId, walletType },
    defaults: {
      ownerId: userId,
      walletType,
      currency: 'VND',
      availableBalance: 0.0,
      reservedBalance: 0.0,
      status: 'ACTIVE',
    },
  };

  if (transaction) {
    options.transaction = transaction;
  }

  const [wallet] = await db.Wallet.findOrCreate(options);
  return wallet;
}

/**
 * Lấy thông tin tổng quan ví bệnh nhân
 */
async function getWalletOverview(userId) {
  try {
    const wallet = await getOrCreateWallet(userId, 'PATIENT');

    // Lấy 10 giao dịch gần nhất
    const recentTransactions = await db.Wallet_Transaction.findAll({
      where: { walletId: wallet.id },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    // Lấy danh sách các khoản đang giữ tiền (Hold)
    const activeHolds = await db.Wallet_Hold.findAll({
      where: {
        walletId: wallet.id,
        status: 'HELD',
      },
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const available = Number(wallet.availableBalance) || 0;
    const reserved = Number(wallet.reservedBalance) || 0;
    const total = available + reserved;

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        walletId: wallet.id,
        ownerId: wallet.ownerId,
        walletType: wallet.walletType,
        currency: wallet.currency,
        availableBalance: available,
        reservedBalance: reserved,
        totalBalance: total,
        status: wallet.status,
        recentTransactions,
        activeHolds,
      },
    };
  } catch (error) {
    console.error('Error in getWalletOverview:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi lấy thông tin ví',
    };
  }
}

/**
 * Tạo URL nạp tiền vào ví qua cổng thanh toán VNPay
 */
async function createDepositPaymentUrl(userId, { amount, ipAddr, bankCode }) {
  try {
    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 10000) {
      return {
        errCode: 2,
        errMessage: 'Số tiền nạp tối thiểu là 10.000 VNĐ',
      };
    }

    if (numAmount > 100000000) {
      return {
        errCode: 3,
        errMessage: 'Số tiền nạp tối đa là 100.000.000 VNĐ cho mỗi giao dịch',
      };
    }

    const wallet = await getOrCreateWallet(userId, 'PATIENT');
    if (wallet.status !== 'ACTIVE') {
      return {
        errCode: 4,
        errMessage: 'Ví của bạn đang bị khóa hoặc tạm ngừng hoạt động. Vui lòng liên hệ quản trị viên.',
      };
    }

    // Sinh mã tham chiếu giao dịch độc nhất
    const txnRef = `WAL_DEP_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Lưu Payment_Transaction trạng thái PENDING
    await db.Payment_Transaction.create({
      walletId: wallet.id,
      gateway: 'VNPAY',
      paymentType: 'WALLET_DEPOSIT',
      txnRef,
      amount: numAmount,
      bankCode: bankCode || null,
      status: 'PENDING',
    });

    // Tạo params VNPay
    const createDate = moment().tz('Asia/Ho_Chi_Minh').format('YYYYMMDDHHmmss');
    const expireDate = moment().tz('Asia/Ho_Chi_Minh').add(15, 'minutes').format('YYYYMMDDHHmmss');

    // Strip IPv6 (::1, ::ffff:127.0.0.1) về IPv4 chuẩn cho VNPay
    let clientIp = ipAddr || '127.0.0.1';
    if (clientIp && clientIp.includes(':')) {
      if (clientIp.includes('::ffff:')) {
        clientIp = clientIp.split('::ffff:')[1];
      } else {
        clientIp = '127.0.0.1';
      }
    }

    const cleanOrderInfo = `Nap tien vi BookingCare ${txnRef}`.replace(/[^a-zA-Z0-9 ]/g, '');

    // Return URL dẫn về trang ví của bệnh nhân
    const walletBaseUrl = process.env.URL_REACT || 'http://localhost:3000';
    const returnUrl = `${walletBaseUrl}/patient/wallet`;

    const params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: getVnpTmnCode(),
      vnp_Amount: Math.round(numAmount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: cleanOrderInfo,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: clientIp,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    if (bankCode) {
      params.vnp_BankCode = bankCode;
    }

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const hash = crypto
      .createHmac('sha512', getVnpHashSecret())
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    const urlQuery = qs.stringify(sorted, { encode: false });
    const paymentUrl = `${getVnpUrl()}?${urlQuery}&vnp_SecureHash=${hash}`;

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        paymentUrl,
        txnRef,
        amount: numAmount,
        expiresAt: expireDate,
      },
    };
  } catch (error) {
    console.error('Error in createDepositPaymentUrl:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi tạo liên kết nạp tiền',
    };
  }
}

/**
 * Xử lý webhook IPN từ VNPay nạp tiền vào ví
 * Cơ chế: Row-level Lock (FOR UPDATE) + Idempotency Key bảo đảm không thể cộng đúp tiền
 */
async function processVNPayDepositIPN(vnp_Params) {
  try {
    if (!vnp_Params || Object.keys(vnp_Params).length === 0) {
      return { RspCode: '97', Message: 'Missing parameters' };
    }

    // Xác thực chữ ký
    const receivedHash = vnp_Params['vnp_SecureHash'];
    if (typeof receivedHash !== 'string' || !/^[a-f0-9]{128}$/i.test(receivedHash)) {
      return { RspCode: '97', Message: 'Invalid signature format' };
    }

    // Chỉ lấy các param bắt đầu bằng vnp_ (bỏ qua vnp_SecureHash và vnp_SecureHashType)
    const params = {};
    for (const key of Object.keys(vnp_Params)) {
      if (key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
        params[key] = vnp_Params[key];
      }
    }

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const expectedHash = crypto
      .createHmac('sha512', getVnpHashSecret())
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedHash, 'utf-8'),
        Buffer.from(expectedHash, 'utf-8')
      )
    ) {
      return { RspCode: '97', Message: 'Signature verification failed' };
    }

    const txnRef = vnp_Params['vnp_TxnRef'];
    const vnpAmount = parseInt(vnp_Params['vnp_Amount'], 10);
    const vnpResponseCode = vnp_Params['vnp_ResponseCode'];
    const vnpTransactionNo = vnp_Params['vnp_TransactionNo'];
    const bankCode = vnp_Params['vnp_BankCode'];

    if (!txnRef || !Number.isSafeInteger(vnpAmount)) {
      return { RspCode: '04', Message: 'Invalid amount or txnRef' };
    }

    const depositAmount = vnpAmount / 100;
    const idempotencyKey = `DEPOSIT_VNP_${txnRef}`;

    // Transaction độc lập với Row Lock
    const t = await db.sequelize.transaction();
    try {
      // 1. Lock Payment_Transaction
      const paymentTx = await db.Payment_Transaction.findOne({
        where: { txnRef },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!paymentTx) {
        await t.rollback();
        return { RspCode: '01', Message: 'Order not found' };
      }

      // 2. Chống lặp giao dịch (Idempotency Check)
      if (paymentTx.status === 'SUCCESS') {
        await t.rollback();
        // Trả RspCode 00 để báo cho VNPay không cần gửi lại IPN nữa
        return { RspCode: '00', Message: 'Order already confirmed' };
      }

      // 3. Kiểm tra số tiền
      if (Math.round(Number(paymentTx.amount)) !== Math.round(depositAmount)) {
        await t.rollback();
        return { RspCode: '04', Message: 'Amount mismatch' };
      }

      // 4. Nếu giao dịch thành công (ResponseCode = '00')
      if (vnpResponseCode === '00') {
        // Lock Wallet
        const wallet = await db.Wallet.findOne({
          where: { id: paymentTx.walletId },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (!wallet) {
          await t.rollback();
          return { RspCode: '01', Message: 'Wallet not found' };
        }

        const currentBalance = Number(wallet.availableBalance) || 0;
        const newAvailableBalance = currentBalance + depositAmount;

        // Cập nhật Wallet
        await wallet.update(
          {
            availableBalance: newAvailableBalance,
          },
          { transaction: t }
        );

        // Ghi Sổ cái Bất biến (Immutable Ledger)
        await db.Wallet_Transaction.create(
          {
            walletId: wallet.id,
            direction: 'CREDIT',
            amount: depositAmount,
            balanceAfter: newAvailableBalance,
            transactionType: 'DEPOSIT',
            referenceType: 'PAYMENT_TRANSACTION',
            referenceId: String(paymentTx.id),
            idempotencyKey,
            description: `Nạp tiền thành công qua VNPay (Mã GD: ${vnpTransactionNo || txnRef}, Ngân hàng: ${bankCode || 'VNPAY'})`,
            status: 'COMPLETED',
          },
          { transaction: t }
        );

        // Cập nhật Payment_Transaction
        await paymentTx.update(
          {
            status: 'SUCCESS',
            gatewayTransactionNo: vnpTransactionNo,
            bankCode: bankCode || paymentTx.bankCode,
            rawResponse: JSON.stringify(vnp_Params),
          },
          { transaction: t }
        );

        await t.commit();
        console.log(`[WALLET DEPOSIT SUCCESS] Wallet #${wallet.id} credited +${depositAmount} VND. New balance: ${newAvailableBalance}`);

        // Gửi thông báo realtime & persistent nạp tiền thành công cho chủ ví
        try {
          await notificationService.createAndSendNotification({
            recipientId: wallet.ownerId,
            type: 'PAYMENT_SUCCESS',
            title: 'Nạp tiền vào ví thành công',
            message: `Ví BookingCare của bạn đã được cộng +${Number(depositAmount).toLocaleString('vi-VN')} đ qua cổng VNPay.`,
            entityType: 'WALLET',
            entityId: wallet.id,
            data: {
              walletId: wallet.id,
              amount: depositAmount,
              newBalance: newAvailableBalance,
            },
          });
        } catch (notifErr) {
          console.warn('>>> [NOTIFICATION_WARNING] Không gửi được thông báo nạp tiền:', notifErr.message);
        }

        return { RspCode: '00', Message: 'Confirm Success' };
      } else {
        // Giao dịch thanh toán thất bại từ phía người dùng / VNPay
        await paymentTx.update(
          {
            status: 'FAILED',
            gatewayTransactionNo: vnpTransactionNo,
            bankCode: bankCode || paymentTx.bankCode,
            rawResponse: JSON.stringify(vnp_Params),
          },
          { transaction: t }
        );

        await t.commit();
        return { RspCode: '00', Message: 'Payment failed acknowledged' };
      }
    } catch (innerError) {
      await t.rollback();
      // Nếu đụng khóa UNIQUE của idempotencyKey, xem như đã được xử lý
      if (innerError.name === 'SequelizeUniqueConstraintError') {
        return { RspCode: '00', Message: 'Already confirmed via concurrent request' };
      }
      throw innerError;
    }
  } catch (error) {
    console.error('Error in processVNPayDepositIPN:', error);
    return { RspCode: '99', Message: 'Internal system error' };
  }
}

/**
 * Xác thực và trả kết quả sau khi VNPay redirect về trình duyệt
 */
async function verifyVNPayDepositReturn(vnp_Params) {
  try {
    if (!vnp_Params || !vnp_Params['vnp_TxnRef']) {
      return {
        errCode: 1,
        errMessage: 'Thiếu thông tin giao dịch phản hồi',
      };
    }

    const receivedHash = vnp_Params['vnp_SecureHash'];
    // Chỉ lấy các param bắt đầu bằng vnp_ (bỏ qua vnp_SecureHash và vnp_SecureHashType)
    const params = {};
    for (const key of Object.keys(vnp_Params)) {
      if (key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
        params[key] = vnp_Params[key];
      }
    }

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const expectedHash = crypto
      .createHmac('sha512', getVnpHashSecret())
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    if (receivedHash !== expectedHash) {
      return {
        errCode: 2,
        errMessage: 'Chữ ký giao dịch không hợp lệ',
      };
    }

    const txnRef = vnp_Params['vnp_TxnRef'];
    const responseCode = vnp_Params['vnp_ResponseCode'];
    const isSuccess = responseCode === '00';

    // Tìm payment transaction tương ứng
    const paymentTx = await db.Payment_Transaction.findOne({
      where: { txnRef },
    });

    // Nếu thanh toán thành công và transaction còn PENDING (do IPN chưa kịp gọi hoặc máy local không mở ngrok)
    // Tự động kích hoạt đối soát và cộng tiền an toàn với Idempotency Guard
    if (isSuccess && paymentTx && paymentTx.status === 'PENDING') {
      await processVNPayDepositIPN(vnp_Params);
    }

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        isSuccess,
        txnRef,
        amount: vnp_Params['vnp_Amount'] ? parseInt(vnp_Params['vnp_Amount'], 10) / 100 : 0,
        bankCode: vnp_Params['vnp_BankCode'],
        transactionNo: vnp_Params['vnp_TransactionNo'],
        paymentStatus: paymentTx ? paymentTx.status : (isSuccess ? 'SUCCESS' : 'FAILED'),
        message: isSuccess ? 'Nạp tiền vào ví thành công!' : 'Giao dịch nạp tiền không thành công hoặc đã bị hủy.',
      },
    };
  } catch (error) {
    console.error('Error in verifyVNPayDepositReturn:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi kiểm tra kết quả giao dịch',
    };
  }
}

/**
 * Lấy lịch sử biến động số dư (Sổ cái) có phân trang
 */
async function getWalletTransactions(userId, { page = 1, limit = 20, type = null }) {
  try {
    const wallet = await getOrCreateWallet(userId, 'PATIENT');

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const where = { walletId: wallet.id };

    if (type && type !== 'ALL') {
      where.transactionType = type;
    }

    const { count, rows } = await db.Wallet_Transaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
        transactions: rows,
      },
    };
  } catch (error) {
    console.error('Error in getWalletTransactions:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi lấy lịch sử giao dịch',
    };
  }
}

/**
 * [PHASE 4] Lấy chỉ số thanh khoản, nợ phải trả, bảo chứng quỹ và kiểm tra đối soát toàn vẹn sổ cái
 */
async function getAdminLiquidityMetrics({ reserveRatio = 40 } = {}) {
  try {
    const ratio = Math.max(10, Math.min(100, Number(reserveRatio) || 40));

    // 1. Nợ phải trả bệnh nhân (Available Liabilities)
    const patientWallets = await db.Wallet.findAll({
      where: { walletType: 'PATIENT' },
      attributes: [
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('availableBalance')), 0), 'totalAvailable'],
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('reservedBalance')), 0), 'totalReserved'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'walletCount'],
      ],
      raw: true,
    });

    const patientAvailableLiability = Number(patientWallets[0]?.totalAvailable || 0);
    const patientReservedLiability = Number(patientWallets[0]?.totalReserved || 0);
    const totalPatientWallets = parseInt(patientWallets[0]?.walletCount || 0, 10);

    // 1b. Nợ phải trả trong Ví Bác sĩ (Doctor Wallet Liabilities)
    const doctorWallets = await db.Wallet.findAll({
      where: { walletType: 'DOCTOR' },
      attributes: [
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('availableBalance')), 0), 'totalAvailable'],
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('reservedBalance')), 0), 'totalReserved'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'walletCount'],
      ],
      raw: true,
    });
    const doctorWalletLiability = Number(doctorWallets[0]?.totalAvailable || 0) + Number(doctorWallets[0]?.totalReserved || 0);
    const totalDoctorWallets = parseInt(doctorWallets[0]?.walletCount || 0, 10);

    // 2. Ký quỹ giữ chỗ ca khám đang chờ thực hiện (Active Escrow Holds)
    const activeHolds = await db.Wallet_Hold.findAll({
      where: { status: 'HELD' },
      attributes: [
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalHeld'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'holdCount'],
      ],
      raw: true,
    });
    const escrowActiveHolds = Number(activeHolds[0]?.totalHeld || 0);
    const activeHoldCount = parseInt(activeHolds[0]?.holdCount || 0, 10);

    // 3. Tiền chờ trả Bác sĩ / Cơ sở y tế (Doctor Payables)
    let doctorPayables = 0;
    try {
      if (db.Doctor_Settlement) {
        const docSettlements = await db.Doctor_Settlement.findAll({
          where: { payoutStatus: { [Op.in]: ['PENDING', 'PROCESSING'] } },
          attributes: [
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('netPayout')), 0), 'totalPayable'],
          ],
          raw: true,
        });
        doctorPayables = Number(docSettlements[0]?.totalPayable || 0);
      }
    } catch (e) {
      doctorPayables = 0;
    }

    // Tổng nghĩa vụ nợ của toàn hệ thống (Total Liabilities)
    const totalLiabilities = patientAvailableLiability + patientReservedLiability + doctorWalletLiability + doctorPayables;

    // 4. Dòng tiền thực tế nạp vào hệ thống qua cổng thanh toán (Total Inflow Cash)
    const depositTransactions = await db.Payment_Transaction.findAll({
      where: { status: 'SUCCESS' },
      attributes: [
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalDeposited'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'depositCount'],
      ],
      raw: true,
    });
    const walletDepositInflow = Number(depositTransactions[0]?.totalDeposited || 0);
    const walletDepositCount = parseInt(depositTransactions[0]?.depositCount || 0, 10);

    // 4a. Dòng tiền doanh thu đặt khám thanh toán trực tiếp qua VNPay (Direct Booking VNPay Revenue)
    let bookingRevenueInflow = 0;
    let bookingPaidCount = 0;
    try {
      const bookingStats = await db.Booking.findAll({
        where: {
          paymentStatus: 'paid',
          paymentMethod: 'VNPAY',
        },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('bookingPrice')), 0), 'totalPaid'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        ],
        raw: true,
      });
      bookingRevenueInflow = Number(bookingStats[0]?.totalPaid || 0);
      bookingPaidCount = parseInt(bookingStats[0]?.count || 0, 10);
    } catch (e) {
      bookingRevenueInflow = 0;
    }

    // 4b. Vốn đối ứng bảo chứng thanh khoản ban đầu của sàn (Platform Initial Working Capital Reserve Fund)
    // Đảm bảo khả năng thanh toán chi trả đối soát Bác sĩ và hoàn tiền tức thì cho Bệnh nhân
    const platformReserveFund = 1000000000; // 1.000.000.000 ₫ (1 tỷ VNĐ)

    const totalCashInflow = walletDepositInflow + bookingRevenueInflow + platformReserveFund;
    const totalDepositCount = walletDepositCount + bookingPaidCount;

    // 4b. Dòng tiền thực tế chi trả ra khỏi hệ thống (Total Cash Outflow)
    let totalDoctorCashPaid = 0;
    let totalDoctorPayoutCount = 0;
    try {
      const docPayoutStats = await db.Doctor_Settlement.findAll({
        where: { payoutStatus: 'paid', paymentMethod: 'bank_transfer' },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('netPayout')), 0), 'totalPaid'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'payoutCount'],
        ],
        raw: true,
      });
      totalDoctorCashPaid = Number(docPayoutStats[0]?.totalPaid || 0);
      totalDoctorPayoutCount = parseInt(docPayoutStats[0]?.payoutCount || 0, 10);
    } catch (e) {
      totalDoctorCashPaid = 0;
    }

    let totalPatientWithdrawalPaid = 0;
    let totalWithdrawalCount = 0;
    try {
      if (db.Withdrawal_Request) {
        const withdrawalStats = await db.Withdrawal_Request.findAll({
          where: { status: 'TRANSFERRED' },
          attributes: [
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalWithdrawn'],
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
          ],
          raw: true,
        });
        totalPatientWithdrawalPaid = Number(withdrawalStats[0]?.totalWithdrawn || 0);
        totalWithdrawalCount = parseInt(withdrawalStats[0]?.count || 0, 10);
      }
    } catch (e) {
      totalPatientWithdrawalPaid = 0;
    }

    const totalCashOutflow = totalDoctorCashPaid + totalPatientWithdrawalPaid;
    // Số tiền mặt thực tế còn tồn trong két tài khoản ngân hàng của Sàn
    const realNetCashInTreasury = Math.max(0, totalCashInflow - totalCashOutflow);

    // 5. Doanh thu dịch vụ khám đã hoàn tất (Captured) & Tiền đã hoàn trả vào ví (Refunded)
    const capturedHolds = await db.Wallet_Hold.findAll({
      where: { status: 'CAPTURED' },
      attributes: [
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalCaptured'],
      ],
      raw: true,
    });
    const totalCapturedRevenue = Number(capturedHolds[0]?.totalCaptured || 0);

    const refundTxs = await db.Wallet_Transaction.findAll({
      where: { transactionType: 'REFUND' },
      attributes: [
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalRefunded'],
      ],
      raw: true,
    });
    const totalRefunded = Number(refundTxs[0]?.totalRefunded || 0);

    // 6. Tính toán An toàn Thanh khoản & Khả năng Rút vốn Đầu tư
    // Dự trữ bắt buộc: khóa cứng không được rút đi đầu tư
    const mandatoryReserveCash = Math.round(totalLiabilities * (ratio / 100));

    // Số tiền chủ sàn ĐƯỢC PHÉP rút đi đầu tư mà vẫn đảm bảo 100% khả năng hoàn tiền tức thì:
    // Net Withdrawable = max(0, Real Net Cash - Mandatory Reserve - Reserved Balance)
    const netWithdrawableLiquidity = Math.max(
      0,
      realNetCashInTreasury - mandatoryReserveCash - patientReservedLiability
    );

    // Hệ số bảo chứng thanh khoản (Solvency Ratio = Real Net Cash / Total Liabilities)
    const solvencyRatio = totalLiabilities > 0
      ? parseFloat((realNetCashInTreasury / totalLiabilities).toFixed(2))
      : 2.0;

    let solvencyStatus = 'OPTIMAL';
    let solvencyLabel = 'Bảo chứng Tối ưu & An toàn Tuyệt đối';
    let solvencyColor = '#10b981';

    if (solvencyRatio >= 1.3) {
      solvencyStatus = 'OPTIMAL';
      solvencyLabel = 'Bảo chứng Tối ưu & An toàn Tuyệt đối';
      solvencyColor = '#10b981';
    } else if (solvencyRatio >= 1.1) {
      solvencyStatus = 'HEALTHY';
      solvencyLabel = 'Thanh khoản Lành mạnh';
      solvencyColor = '#0ea5e9';
    } else if (solvencyRatio >= 1.0) {
      solvencyStatus = 'WARNING';
      solvencyLabel = 'Cảnh báo: Tiệm cận Mức Dự trữ Tối thiểu';
      solvencyColor = '#f59e0b';
    } else {
      solvencyStatus = 'CRITICAL';
      solvencyLabel = 'Báo động Đỏ: Nguy cơ Thiếu hụt Thanh khoản!';
      solvencyColor = '#ef4444';
    }

    // 7. Kiểm tra Đối soát Tính toàn vẹn Sổ cái (Double-Entry Ledger Integrity Reconciliation)
    const ledgerStats = await db.Wallet_Transaction.findAll({
      attributes: [
        'direction',
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalAmount'],
      ],
      group: ['direction'],
      raw: true,
    });

    let ledgerCredits = 0;
    let ledgerDebits = 0;
    ledgerStats.forEach((st) => {
      if (st.direction === 'CREDIT') ledgerCredits = Number(st.totalAmount || 0);
      if (st.direction === 'DEBIT') ledgerDebits = Number(st.totalAmount || 0);
    });

    const netLedgerBalance = ledgerCredits - ledgerDebits;
    const sumWalletsBalance = patientAvailableLiability + patientReservedLiability + doctorWalletLiability;
    const discrepancy = Math.abs(sumWalletsBalance - netLedgerBalance);
    const isLedgerBalanced = discrepancy < 0.05;

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        summary: {
          patientAvailableLiability,
          patientReservedLiability,
          doctorWalletLiability,
          escrowActiveHolds,
          activeHoldCount,
          doctorPayables,
          totalLiabilities,
          totalCashInflow,
          totalDepositCount,
          walletDepositInflow,
          bookingRevenueInflow,
          platformReserveFund,
          totalCashOutflow,
          totalDoctorCashPaid,
          totalPatientWithdrawalPaid,
          realNetCashInTreasury,
          totalCapturedRevenue,
          totalRefunded,
          totalPatientWallets,
          totalDoctorWallets,
        },
        solvency: {
          reserveRatio: ratio,
          mandatoryReserveCash,
          netWithdrawableLiquidity,
          solvencyRatio,
          solvencyStatus,
          solvencyLabel,
          solvencyColor,
        },
        reconciliation: {
          sumWalletsBalance,
          ledgerCredits,
          ledgerDebits,
          netLedgerBalance,
          discrepancy,
          isLedgerBalanced,
          lastReconciledAt: new Date(),
        },
      },
    };
  } catch (error) {
    console.error('Error in getAdminLiquidityMetrics:', error);
    return {
      errCode: -1,
      errMessage: 'Lỗi khi tính toán chỉ số thanh khoản: ' + error.message,
    };
  }
}

/**
 * [PHASE 4] POST /api/v1/admin/financial/recalibrate-ledger
 * Tự động hiệu chuẩn và tạo bút toán đối ứng chuẩn hóa Sổ cái kép (Ledger Baseline Re-calibration)
 */
async function recalibrateLedgerBaseline() {
  const t = await db.sequelize.transaction();
  try {
    const allWallets = await db.Wallet.findAll({
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    let totalAdjusted = 0;
    let calibratedWalletsCount = 0;

    for (const wallet of allWallets) {
      const walletTotal = Number(wallet.availableBalance || 0) + Number(wallet.reservedBalance || 0);
      if (walletTotal <= 0) continue;

      const txStats = await db.Wallet_Transaction.findAll({
        where: { walletId: wallet.id },
        attributes: [
          'direction',
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalAmount'],
        ],
        group: ['direction'],
        raw: true,
        transaction: t,
      });

      let credits = 0;
      let debits = 0;
      txStats.forEach((st) => {
        if (st.direction === 'CREDIT') credits = Number(st.totalAmount || 0);
        if (st.direction === 'DEBIT') debits = Number(st.totalAmount || 0);
      });

      const netTx = credits - debits;
      const diff = walletTotal - netTx;

      if (Math.abs(diff) >= 0.05) {
        const direction = diff > 0 ? 'CREDIT' : 'DEBIT';
        const adjustmentAmount = Math.abs(diff);

        await db.Wallet_Transaction.create(
          {
            walletId: wallet.id,
            direction,
            amount: adjustmentAmount,
            balanceAfter: Number(wallet.availableBalance || 0),
            transactionType: 'INITIAL_BALANCE',
            referenceType: 'SYSTEM_CALIBRATION',
            referenceId: `CALIB_W${wallet.id}_${Date.now()}`,
            idempotencyKey: `CALIB_KEY_W${wallet.id}_${Date.now()}`,
            description: `Bút toán đối ứng hiệu chuẩn số dư đầu kỳ chuẩn hóa Sổ cái kép (Ledger Baseline Calibration)`,
            status: 'COMPLETED',
          },
          { transaction: t }
        );

        totalAdjusted += adjustmentAmount;
        calibratedWalletsCount++;
      }
    }

    await t.commit();
    return {
      errCode: 0,
      message: `Hiệu chuẩn thành công ${calibratedWalletsCount} ví với tổng bút toán đối ứng ${totalAdjusted.toLocaleString('vi-VN')} ₫. Sổ cái kép đã cân bằng!`,
      data: {
        calibratedWalletsCount,
        totalAdjusted,
      },
    };
  } catch (error) {
    await t.rollback();
    console.error('Error in recalibrateLedgerBaseline:', error);
    return { errCode: -1, errMessage: 'Lỗi khi hiệu chuẩn sổ cái: ' + error.message };
  }
}

/**
 * [PHASE 4] Lấy danh sách giao dịch Sổ cái toàn sàn (Ledger Explorer & Audit Trail)
 */
async function getAdminWalletTransactions({
  page = 1,
  limit = 20,
  type = null,
  direction = null,
  search = '',
  startDate = null,
  endDate = null,
} = {}) {
  try {
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const where = {};

    if (type && type !== 'ALL') {
      where.transactionType = type;
    }

    if (direction && direction !== 'ALL') {
      where.direction = direction;
    }

    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [moment(startDate).startOf('day').toDate(), moment(endDate).endOf('day').toDate()],
      };
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { idempotencyKey: { [Op.iLike]: q } },
        { referenceId: { [Op.iLike]: q } },
        { description: { [Op.iLike]: q } },
      ];
    }

    const { count, rows } = await db.Wallet_Transaction.findAndCountAll({
      where,
      include: [
        {
          model: db.Wallet,
          as: 'wallet',
          attributes: ['id', 'ownerId', 'walletType', 'availableBalance', 'reservedBalance'],
          include: [
            {
              model: db.User,
              as: 'owner',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
        transactions: rows,
      },
    };
  } catch (error) {
    console.error('Error in getAdminWalletTransactions:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi tra cứu sổ cái giao dịch',
    };
  }
}

/**
 * [PHASE 4] Lấy danh sách ví người dùng (User Wallets Management)
 */
async function getAdminWalletsList({
  page = 1,
  limit = 20,
  status = null,
  walletType = 'PATIENT',
  search = '',
} = {}) {
  try {
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const where = {};

    if (walletType && walletType !== 'ALL') {
      where.walletType = walletType;
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    const userWhere = {};
    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      userWhere[Op.or] = [
        { email: { [Op.iLike]: q } },
        { firstName: { [Op.iLike]: q } },
        { lastName: { [Op.iLike]: q } },
        { phoneNumber: { [Op.iLike]: q } },
      ];
    }

    const { count, rows } = await db.Wallet.findAndCountAll({
      where,
      include: [
        {
          model: db.User,
          as: 'owner',
          where: Object.keys(userWhere).length > 0 ? userWhere : undefined,
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
        wallets: rows,
      },
    };
  } catch (error) {
    console.error('Error in getAdminWalletsList:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi lấy danh sách ví người dùng',
    };
  }
}

/**
 * [PHASE 4] Khóa hoặc Mở khóa ví người dùng (Lock/Unlock Wallet)
 */
async function toggleWalletStatus(walletId, targetStatus, adminNote = '', adminId = null) {
  try {
    if (!walletId) {
      return { errCode: 1, errMessage: 'Mã ví không hợp lệ' };
    }

    const validStatuses = ['ACTIVE', 'LOCKED', 'SUSPENDED'];
    if (!validStatuses.includes(targetStatus)) {
      return { errCode: 2, errMessage: 'Trạng thái ví không hợp lệ' };
    }

    const wallet = await db.Wallet.findByPk(walletId);
    if (!wallet) {
      return { errCode: 3, errMessage: 'Không tìm thấy ví tương ứng' };
    }

    const oldStatus = wallet.status;
    wallet.status = targetStatus;
    await wallet.save();

    return {
      errCode: 0,
      errMessage: 'Cập nhật trạng thái ví thành công',
      data: {
        walletId: wallet.id,
        oldStatus,
        newStatus: wallet.status,
        adminNote,
        adminId,
        updatedAt: wallet.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error in toggleWalletStatus:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi cập nhật trạng thái ví',
    };
  }
}

/**
 * [PHASE 3] Bệnh nhân / Bác sĩ gửi yêu cầu rút tiền từ Ví về tài khoản ngân hàng
 */
async function requestWithdrawal(userId, { amount, patientBankAccountId, bankInfo, userNote, walletType = 'PATIENT' }) {
  try {
    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 50000) {
      return {
        errCode: 1,
        errMessage: 'Hạn mức rút tiền tối thiểu là 50.000 VNĐ',
      };
    }

    if (numAmount > 100000000) {
      return {
        errCode: 2,
        errMessage: 'Hạn mức rút tiền tối đa là 100.000.000 VNĐ cho mỗi giao dịch',
      };
    }

    const wallet = await getOrCreateWallet(userId, walletType);
    if (wallet.status !== 'ACTIVE') {
      return {
        errCode: 3,
        errMessage: 'Ví của bạn đang bị khóa hoặc tạm ngừng hoạt động. Vui lòng liên hệ quản trị viên.',
      };
    }

    let resolvedBankName = '';
    let resolvedAccountNumber = '';
    let resolvedAccountHolderName = '';

    if (patientBankAccountId) {
      const bankAccount = await db.PatientBankAccount.findOne({
        where: { id: patientBankAccountId, patientId: userId },
      });
      if (!bankAccount) {
        return {
          errCode: 4,
          errMessage: 'Tài khoản ngân hàng không tồn tại hoặc không thuộc quyền sở hữu của bạn',
        };
      }
      resolvedBankName = bankAccount.bankName;
      resolvedAccountNumber = bankAccount.accountNumber;
      resolvedAccountHolderName = bankAccount.accountHolderName;
    } else if (bankInfo && bankInfo.bankName && bankInfo.accountNumber && bankInfo.accountHolderName) {
      resolvedBankName = String(bankInfo.bankName).trim();
      resolvedAccountNumber = String(bankInfo.accountNumber).trim();
      resolvedAccountHolderName = String(bankInfo.accountHolderName).trim();
    } else {
      // Nếu là Bác sĩ, thử tra cứu từ Doctor_Info
      if (walletType === 'DOCTOR') {
        const docInfo = await db.Doctor_Info.findOne({ where: { doctorId: userId } });
        if (docInfo && docInfo.bankAccountNumber && docInfo.bankName) {
          resolvedBankName = docInfo.bankName;
          resolvedAccountNumber = docInfo.bankAccountNumber;
          resolvedAccountHolderName = docInfo.bankAccountName || 'BÁC SĨ';
        }
      }
      if (!resolvedBankName || !resolvedAccountNumber || !resolvedAccountHolderName) {
        return {
          errCode: 5,
          errMessage: 'Vui lòng cung cấp đầy đủ thông tin tài khoản ngân hàng thụ hưởng (Ngân hàng, Số TK, Tên chủ TK)',
        };
      }
    }

    // Bắt đầu transaction với Row Lock trên Wallet
    const t = await db.sequelize.transaction();
    try {
      const lockedWallet = await db.Wallet.findOne({
        where: { id: wallet.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const currentAvailable = Number(lockedWallet.availableBalance) || 0;
      if (currentAvailable < numAmount) {
        await t.rollback();
        return {
          errCode: 6,
          errMessage: `Số dư khả dụng không đủ (${currentAvailable.toLocaleString('vi-VN')} ₫ < ${numAmount.toLocaleString('vi-VN')} ₫)`,
        };
      }

      // Giữ tiền (Hold) cho yêu cầu rút: trừ available, cộng reserved
      const newAvailable = currentAvailable - numAmount;
      const newReserved = (Number(lockedWallet.reservedBalance) || 0) + numAmount;

      await lockedWallet.update(
        {
          availableBalance: newAvailable,
          reservedBalance: newReserved,
        },
        { transaction: t }
      );

      // Tính toán Cam kết Thời hạn Giải ngân Linh hoạt (Dynamic SLA) theo Chính sách hệ thống
      const slaCalc = await withdrawalPolicyService.calculateWithdrawalSla(numAmount, new Date());

      const withdrawalRequest = await db.Withdrawal_Request.create(
        {
          walletId: lockedWallet.id,
          patientBankAccountId: patientBankAccountId || null,
          bankName: resolvedBankName,
          accountNumber: resolvedAccountNumber,
          accountHolderName: resolvedAccountHolderName,
          amount: numAmount,
          status: 'PENDING',
          userNote: userNote ? userNote.trim() : null,
          requestedAt: new Date(),
          appliedSlaDays: slaCalc.appliedSlaDays,
          promisedPayoutDate: slaCalc.promisedPayoutDate,
          policyId: slaCalc.policyId,
          policySnapshot: slaCalc.policySnapshot,
        },
        { transaction: t }
      );

      await t.commit();

      // Gửi thông báo cho Admin về yêu cầu rút tiền mới cần duyệt
      try {
        const admins = await db.User.findAll({
          where: { roleId: 'R1' },
          attributes: ['id'],
        });
        for (const admin of admins) {
          await notificationService.createAndSendNotification({
            recipientId: admin.id,
            type: 'WITHDRAWAL_REQUESTED',
            title: 'Yêu cầu rút tiền mới',
            message: `Có yêu cầu rút ${numAmount.toLocaleString('vi-VN')} đ về tài khoản ${resolvedBankName} (${resolvedAccountNumber}) cần xử lý.`,
            entityType: 'WALLET',
            entityId: withdrawalRequest.id,
            data: {
              withdrawalId: withdrawalRequest.id,
              amount: numAmount,
              bankName: resolvedBankName,
              accountNumber: resolvedAccountNumber,
            },
          });
        }
      } catch (adminNotifErr) {
        console.warn('>>> [NOTIFICATION_WARNING] Không gửi được thông báo rút tiền cho Admin:', adminNotifErr.message);
      }

      const promisedDateStr = new Date(slaCalc.promisedPayoutDate).toLocaleDateString('vi-VN');
      return {
        errCode: 0,
        errMessage: `Yêu cầu rút tiền đã được gửi thành công. Thời gian xử lý cam kết trong ${slaCalc.appliedSlaDays} ngày (dự kiến hoàn tất trước ngày ${promisedDateStr}).`,
        data: withdrawalRequest,
      };
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }
  } catch (error) {
    console.error('Error in requestWithdrawal:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi tạo yêu cầu rút tiền',
    };
  }
}

/**
 * [PHASE 3] Lấy danh sách yêu cầu rút tiền của tôi (Bệnh nhân / Bác sĩ)
 */
async function getMyWithdrawalRequests(userId, { page = 1, limit = 10, status = null, walletType = 'PATIENT' } = {}) {
  try {
    const wallet = await getOrCreateWallet(userId, walletType);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const where = { walletId: wallet.id };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    const { count, rows } = await db.Withdrawal_Request.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
        requests: rows,
      },
    };
  } catch (error) {
    console.error('Error in getMyWithdrawalRequests:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi lấy danh sách yêu cầu rút tiền',
    };
  }
}

/**
 * [PHASE 3] Người dùng tự hủy yêu cầu rút tiền khi còn PENDING
 */
async function cancelMyWithdrawalRequest(userId, requestId, walletType = 'PATIENT') {
  try {
    const reqId = parseInt(requestId, 10);
    if (!reqId) {
      return { errCode: 1, errMessage: 'Mã yêu cầu không hợp lệ' };
    }

    const wallet = await getOrCreateWallet(userId, walletType);

    const t = await db.sequelize.transaction();
    try {
      const withdrawal = await db.Withdrawal_Request.findOne({
        where: { id: reqId, walletId: wallet.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!withdrawal) {
        await t.rollback();
        return { errCode: 2, errMessage: 'Không tìm thấy yêu cầu rút tiền tương ứng' };
      }

      if (withdrawal.status !== 'PENDING') {
        await t.rollback();
        return {
          errCode: 3,
          errMessage: 'Chỉ có thể hủy yêu cầu đang ở trạng thái Chờ xử lý (PENDING)',
        };
      }

      const lockedWallet = await db.Wallet.findOne({
        where: { id: wallet.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const amountToRelease = Number(withdrawal.amount);
      const newReserved = Math.max(0, (Number(lockedWallet.reservedBalance) || 0) - amountToRelease);
      const newAvailable = (Number(lockedWallet.availableBalance) || 0) + amountToRelease;

      await lockedWallet.update(
        {
          reservedBalance: newReserved,
          availableBalance: newAvailable,
        },
        { transaction: t }
      );

      await withdrawal.update(
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
        { transaction: t }
      );

      await t.commit();
      return {
        errCode: 0,
        errMessage: 'Hủy yêu cầu rút tiền thành công. Số tiền đã được hoàn lại vào số dư khả dụng.',
        data: withdrawal,
      };
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }
  } catch (error) {
    console.error('Error in cancelMyWithdrawalRequest:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi hủy yêu cầu rút tiền',
    };
  }
}

/**
 * [PHASE 3] Admin tra cứu danh sách yêu cầu rút tiền toàn hệ thống
 */
async function getAdminWithdrawalRequests({
  page = 1,
  limit = 15,
  status = 'ALL',
  search = '',
  startDate = null,
  endDate = null,
} = {}) {
  try {
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [moment(startDate).startOf('day').toDate(), moment(endDate).endOf('day').toDate()],
      };
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { bankName: { [Op.iLike]: q } },
        { accountNumber: { [Op.iLike]: q } },
        { accountHolderName: { [Op.iLike]: q } },
        { bankTransactionRef: { [Op.iLike]: q } },
      ];
    }

    const { count, rows } = await db.Withdrawal_Request.findAndCountAll({
      where,
      include: [
        {
          model: db.Wallet,
          as: 'wallet',
          attributes: ['id', 'ownerId', 'walletType', 'availableBalance', 'reservedBalance'],
          include: [
            {
              model: db.User,
              as: 'owner',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
            },
          ],
        },
        {
          model: db.User,
          as: 'admin',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    // Thống kê số liệu badge cho Admin
    const [stats] = await db.Withdrawal_Request.findAll({
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'totalRequests'],
        [
          db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END")),
          'pendingCount',
        ],
        [
          db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN status = 'TRANSFERRED' THEN 1 ELSE 0 END")),
          'transferredCount',
        ],
        [
          db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END")),
          'rejectedCount',
        ],
        [
          db.sequelize.fn(
            'SUM',
            db.sequelize.literal("CASE WHEN status = 'PENDING' AND \"promisedPayoutDate\" IS NOT NULL AND \"promisedPayoutDate\" < NOW() THEN 1 ELSE 0 END")
          ),
          'overdueCount',
        ],
        [
          db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN status = 'PENDING' THEN amount ELSE 0 END")), 0),
          'pendingAmount',
        ],
      ],
      raw: true,
    });

    const nowTime = new Date().getTime();
    const enrichedRequests = rows.map((req) => {
      const item = req.toJSON();
      item.isOverdue = Boolean(
        item.status === 'PENDING' &&
        item.promisedPayoutDate &&
        nowTime > new Date(item.promisedPayoutDate).getTime()
      );
      try {
        item.parsedPolicySnapshot = item.policySnapshot ? JSON.parse(item.policySnapshot) : null;
      } catch {
        item.parsedPolicySnapshot = null;
      }
      return item;
    });

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
        requests: enrichedRequests,
        stats: {
          totalRequests: parseInt(stats?.totalRequests || 0, 10),
          pendingCount: parseInt(stats?.pendingCount || 0, 10),
          transferredCount: parseInt(stats?.transferredCount || 0, 10),
          rejectedCount: parseInt(stats?.rejectedCount || 0, 10),
          overdueCount: parseInt(stats?.overdueCount || 0, 10),
          pendingAmount: Number(stats?.pendingAmount || 0),
        },
      },
    };
  } catch (error) {
    console.error('Error in getAdminWithdrawalRequests:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi tra cứu danh sách yêu cầu rút tiền',
    };
  }
}

/**
 * [PHASE 3] Admin phê duyệt chuyển khoản hoặc từ chối yêu cầu rút tiền
 */
async function adminProcessWithdrawal(adminId, { requestId, action, adminNote, bankTransactionRef, receiptImage }) {
  try {
    const reqId = parseInt(requestId, 10);
    if (!reqId) {
      return { errCode: 1, errMessage: 'Mã yêu cầu không hợp lệ' };
    }

    if (!['TRANSFER', 'REJECT'].includes(action)) {
      return { errCode: 2, errMessage: 'Hành động không hợp lệ (chỉ hỗ trợ TRANSFER hoặc REJECT)' };
    }

    if (action === 'TRANSFER' && (!bankTransactionRef || bankTransactionRef.trim().length === 0)) {
      return {
        errCode: 3,
        errMessage: 'Vui lòng cung cấp Mã giao dịch ngân hàng / Ủy nhiệm chi để xác nhận chuyển khoản',
      };
    }

    if (action === 'REJECT' && (!adminNote || adminNote.trim().length === 0)) {
      return {
        errCode: 4,
        errMessage: 'Vui lòng nhập lý do từ chối yêu cầu rút tiền',
      };
    }

    const t = await db.sequelize.transaction();
    try {
      const withdrawal = await db.Withdrawal_Request.findOne({
        where: { id: reqId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!withdrawal) {
        await t.rollback();
        return { errCode: 5, errMessage: 'Không tìm thấy yêu cầu rút tiền tương ứng' };
      }

      if (withdrawal.status !== 'PENDING') {
        await t.rollback();
        return {
          errCode: 6,
          errMessage: `Yêu cầu này đã được xử lý trước đó với trạng thái: ${withdrawal.status}`,
        };
      }

      const lockedWallet = await db.Wallet.findOne({
        where: { id: withdrawal.walletId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const amountVal = Number(withdrawal.amount);

      if (action === 'TRANSFER') {
        const currentReserved = Number(lockedWallet.reservedBalance) || 0;
        const newReserved = Math.max(0, currentReserved - amountVal);

        await lockedWallet.update(
          {
            reservedBalance: newReserved,
          },
          { transaction: t }
        );

        const idempotencyKey = `WITHDRAWAL_${withdrawal.id}`;

        // Ghi chép Sổ cái kép Bất biến (Double-entry Immutable Ledger)
        await db.Wallet_Transaction.create(
          {
            walletId: lockedWallet.id,
            direction: 'DEBIT',
            amount: amountVal,
            balanceAfter: Number(lockedWallet.availableBalance) || 0,
            transactionType: 'WITHDRAWAL',
            referenceType: 'WITHDRAWAL_REQUEST',
            referenceId: String(withdrawal.id),
            idempotencyKey,
            description: `Rút tiền về ngân hàng ${withdrawal.bankName} - STK ${withdrawal.accountNumber} (${withdrawal.accountHolderName}). Mã GD: ${bankTransactionRef.trim()}`,
            status: 'COMPLETED',
          },
          { transaction: t }
        );

        await withdrawal.update(
          {
            status: 'TRANSFERRED',
            adminId,
            adminNote: adminNote ? adminNote.trim() : 'Admin xác nhận chuyển khoản thành công',
            bankTransactionRef: bankTransactionRef.trim(),
            receiptImage: receiptImage || null,
            transferredAt: new Date(),
          },
          { transaction: t }
        );

        await t.commit();

        // Gửi thông báo chuyển khoản rút tiền thành công cho Bác sĩ
        try {
          await notificationService.createAndSendNotification({
            recipientId: lockedWallet.ownerId,
            type: 'WITHDRAWAL_PROCESSED',
            title: 'Rút tiền thành công',
            message: `Yêu cầu rút ${amountVal.toLocaleString('vi-VN')} đ về tài khoản ${withdrawal.bankName} (${withdrawal.accountNumber}) đã được chuyển khoản thành công.`,
            entityType: 'WALLET',
            entityId: lockedWallet.id,
            data: {
              withdrawalId: withdrawal.id,
              amount: amountVal,
              status: 'TRANSFERRED',
            },
          });
        } catch (notifErr) {
          console.warn('>>> [NOTIFICATION_WARNING] Không gửi được thông báo rút tiền thành công:', notifErr.message);
        }

        return {
          errCode: 0,
          errMessage: 'Xác nhận chuyển khoản và cập nhật sổ cái thành công!',
          data: withdrawal,
        };
      } else {
        // action === 'REJECT'
        const currentReserved = Number(lockedWallet.reservedBalance) || 0;
        const currentAvailable = Number(lockedWallet.availableBalance) || 0;

        const newReserved = Math.max(0, currentReserved - amountVal);
        const newAvailable = currentAvailable + amountVal;

        await lockedWallet.update(
          {
            reservedBalance: newReserved,
            availableBalance: newAvailable,
          },
          { transaction: t }
        );

        await withdrawal.update(
          {
            status: 'REJECTED',
            adminId,
            adminNote: adminNote.trim(),
            rejectedAt: new Date(),
          },
          { transaction: t }
        );

        await t.commit();

        // Gửi thông báo từ chối rút tiền cho Bác sĩ
        try {
          await notificationService.createAndSendNotification({
            recipientId: lockedWallet.ownerId,
            type: 'WITHDRAWAL_PROCESSED',
            title: 'Yêu cầu rút tiền bị từ chối',
            message: `Yêu cầu rút ${amountVal.toLocaleString('vi-VN')} đ đã bị từ chối. Lý do: ${adminNote.trim()}. Số tiền đã được hoàn lại vào số dư khả dụng.`,
            entityType: 'WALLET',
            entityId: lockedWallet.id,
            data: {
              withdrawalId: withdrawal.id,
              amount: amountVal,
              status: 'REJECTED',
            },
          });
        } catch (notifErr) {
          console.warn('>>> [NOTIFICATION_WARNING] Không gửi được thông báo từ chối rút tiền:', notifErr.message);
        }

        return {
          errCode: 0,
          errMessage: 'Từ chối yêu cầu rút tiền thành công. Số tiền đã được hoàn trả về số dư khả dụng.',
          data: withdrawal,
        };
      }
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }
  } catch (error) {
    console.error('Error in adminProcessWithdrawal:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi xử lý yêu cầu rút tiền',
    };
  }
}

/**
 * [PHASE 3] Kết nối Đối soát Bác sĩ (Doctor Settlements) với Ví Bác sĩ (DOCTOR Wallet)
 */
async function creditDoctorSettlementToWallet(settlement, externalTransaction = null) {
  try {
    if (!settlement || !settlement.doctorId || !settlement.netPayout) {
      return { errCode: 1, errMessage: 'Thông tin quyết toán không hợp lệ' };
    }

    const doctorId = settlement.doctorId;
    const payoutAmount = Number(settlement.netPayout);
    if (payoutAmount <= 0) {
      return { errCode: 2, errMessage: 'Số tiền quyết toán phải lớn hơn 0' };
    }

    const idempotencyKey = `DOCTOR_SETTLEMENT_${settlement.id}`;

    const executeLogic = async (t) => {
      const doctorWallet = await getOrCreateWallet(doctorId, 'DOCTOR', t);

      // Lock Doctor Wallet
      const lockedWallet = await db.Wallet.findOne({
        where: { id: doctorWallet.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const currentAvailable = Number(lockedWallet.availableBalance) || 0;
      const newAvailable = currentAvailable + payoutAmount;

      await lockedWallet.update(
        {
          availableBalance: newAvailable,
        },
        { transaction: t }
      );

      // Ghi Sổ cái Bất biến
      await db.Wallet_Transaction.create(
        {
          walletId: lockedWallet.id,
          direction: 'CREDIT',
          amount: payoutAmount,
          balanceAfter: newAvailable,
          transactionType: 'DOCTOR_SHARE',
          referenceType: 'DOCTOR_SETTLEMENT',
          referenceId: String(settlement.id),
          idempotencyKey,
          description: `Nhận thanh toán đối soát doanh thu khám vào Ví Bác sĩ (Kỳ đối soát: ${settlement.periodFrom ? moment(settlement.periodFrom).format('DD/MM/YYYY') : 'N/A'} - ${settlement.periodTo ? moment(settlement.periodTo).format('DD/MM/YYYY') : 'N/A'})`,
          status: 'COMPLETED',
        },
        { transaction: t }
      );

      return lockedWallet;
    };

    if (externalTransaction) {
      const updatedWallet = await executeLogic(externalTransaction);
      return { errCode: 0, errMessage: 'OK', data: updatedWallet };
    } else {
      const t = await db.sequelize.transaction();
      try {
        const updatedWallet = await executeLogic(t);
        await t.commit();
        return { errCode: 0, errMessage: 'OK', data: updatedWallet };
      } catch (innerErr) {
        await t.rollback();
        throw innerErr;
      }
    }
  } catch (error) {
    console.error('Error in creditDoctorSettlementToWallet:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi chuyển tiền đối soát vào ví bác sĩ',
    };
  }
}

module.exports = {
  getOrCreateWallet,
  getWalletOverview,
  createDepositPaymentUrl,
  processVNPayDepositIPN,
  verifyVNPayDepositReturn,
  getWalletTransactions,
  // Phase 3 Withdrawal & Doctor Wallet Services
  requestWithdrawal,
  getMyWithdrawalRequests,
  cancelMyWithdrawalRequest,
  getAdminWithdrawalRequests,
  adminProcessWithdrawal,
  creditDoctorSettlementToWallet,
  // Phase 4 Admin Services
  getAdminLiquidityMetrics,
  recalibrateLedgerBaseline,
  getAdminWalletTransactions,
  getAdminWalletsList,
  toggleWalletStatus,
};
