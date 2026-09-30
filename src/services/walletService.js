// bookingcare-backend/src/services/walletService.js
// Dịch vụ Phân hệ Ví điện tử & Sổ cái bất biến (Financial Wallet & Ledger Subsystem)
'use strict';

const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const db = require('../models');
const VNPAY_ALLOWED_KEYS = require('../utils/vnpayAllowedKeys');

// VNPay Environment Variables
const VNP_TMN_CODE = process.env.VNP_TMN_CODE;
const VNP_HASH_SECRET = process.env.VNP_HASH_SECRET;
const VNP_URL = process.env.VNP_URL;
const VNP_RETURN_URL = process.env.VNP_RETURN_URL || 'http://localhost:3000/patient/wallet';

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

    const cleanOrderInfo = `Nap tien vi BookingCare ${txnRef}`.replace(/[^a-zA-Z0-9 ]/g, '');

    // Return URL dẫn về trang ví của bệnh nhân
    const returnUrl = `${VNP_RETURN_URL}?type=wallet_deposit&txnRef=${txnRef}`;

    const params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: VNP_TMN_CODE,
      vnp_Amount: Math.round(numAmount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: cleanOrderInfo,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    if (bankCode) {
      params.vnp_BankCode = bankCode;
    }

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const hash = crypto
      .createHmac('sha512', VNP_HASH_SECRET)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    const urlQuery = qs.stringify(sorted, { encode: false });
    const paymentUrl = `${VNP_URL}?${urlQuery}&vnp_SecureHash=${hash}`;

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

    const params = Object.assign(Object.create(null), vnp_Params);
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const expectedHash = crypto
      .createHmac('sha512', VNP_HASH_SECRET)
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
    const params = Object.assign(Object.create(null), vnp_Params);
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const expectedHash = crypto
      .createHmac('sha512', VNP_HASH_SECRET)
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

module.exports = {
  getOrCreateWallet,
  getWalletOverview,
  createDepositPaymentUrl,
  processVNPayDepositIPN,
  verifyVNPayDepositReturn,
  getWalletTransactions,
};
