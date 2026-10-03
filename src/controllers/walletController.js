// bookingcare-backend/src/controllers/walletController.js
'use strict';

const walletService = require('../services/walletService');

/**
 * GET /api/v1/patient/wallet
 * Lấy thông tin tổng quan ví của bệnh nhân đang đăng nhập
 */
async function handleGetMyWallet(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const result = await walletService.getWalletOverview(userId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetMyWallet:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/patient/wallet/deposit
 * Tạo link thanh toán VNPay để nạp tiền vào ví
 */
async function handleCreateDepositUrl(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const { amount, bankCode } = req.body;
    const ipAddr =
      req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    const result = await walletService.createDepositPaymentUrl(userId, {
      amount,
      ipAddr,
      bankCode,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleCreateDepositUrl:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * GET /api/v1/payment/vnpay-wallet-ipn
 * Webhook IPN từ VNPay khi người dùng hoàn tất nạp tiền
 * Public endpoint — không yêu cầu JWT
 */
async function handleVNPayDepositIPN(req, res) {
  try {
    const vnp_Params = req.query;
    const result = await walletService.processVNPayDepositIPN(vnp_Params);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleVNPayDepositIPN:', error);
    return res.status(200).json({ RspCode: '99', Message: 'System Error' });
  }
}

/**
 * GET /api/v1/payment/vnpay-wallet-return
 * Xác thực thông tin sau khi VNPay redirect về trình duyệt
 */
async function handleVNPayDepositReturn(req, res) {
  try {
    const vnp_Params = req.query;
    const result = await walletService.verifyVNPayDepositReturn(vnp_Params);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleVNPayDepositReturn:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * GET /api/v1/patient/wallet/transactions
 * Lấy lịch sử biến động số dư của ví
 */
async function handleGetMyTransactions(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const { page, limit, type } = req.query;
    const result = await walletService.getWalletTransactions(userId, {
      page,
      limit,
      type,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetMyTransactions:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 4] GET /api/v1/admin/financial/liquidity-metrics
 * Lấy toàn bộ chỉ số giám sát thanh khoản, bảo chứng quỹ & đối soát sổ cái
 */
async function handleGetAdminLiquidityMetrics(req, res) {
  try {
    const { reserveRatio } = req.query;
    const result = await walletService.getAdminLiquidityMetrics({ reserveRatio });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminLiquidityMetrics:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 4] POST /api/v1/admin/financial/recalibrate-ledger
 * Hiệu chuẩn số dư đầu kỳ Sổ cái kép (Ledger Calibration)
 */
async function handleRecalibrateLedgerBaseline(req, res) {
  try {
    const result = await walletService.recalibrateLedgerBaseline();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleRecalibrateLedgerBaseline:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ khi hiệu chuẩn sổ cái' });
  }
}

/**
 * [PHASE 4] GET /api/v1/admin/financial/ledger-transactions
 * Lấy danh sách giao dịch Sổ cái toàn sàn (Audit Trail & Ledger Explorer)
 */
async function handleGetAdminWalletTransactions(req, res) {
  try {
    const { page, limit, type, direction, search, startDate, endDate } = req.query;
    const result = await walletService.getAdminWalletTransactions({
      page,
      limit,
      type,
      direction,
      search,
      startDate,
      endDate,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminWalletTransactions:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 4] GET /api/v1/admin/financial/wallets
 * Lấy danh sách ví người dùng trên toàn hệ thống
 */
async function handleGetAdminWalletsList(req, res) {
  try {
    const { page, limit, status, walletType, search } = req.query;
    const result = await walletService.getAdminWalletsList({
      page,
      limit,
      status,
      walletType,
      search,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminWalletsList:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 4] POST /api/v1/admin/financial/wallets/:id/toggle-status
 * Khóa hoặc Mở khóa ví người dùng
 */
async function handleToggleWalletStatus(req, res) {
  try {
    const walletId = req.params.id;
    const { targetStatus, adminNote } = req.body;
    const adminId = req.user?.id;

    const result = await walletService.toggleWalletStatus(
      walletId,
      targetStatus,
      adminNote,
      adminId
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleToggleWalletStatus:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] POST /api/v1/patient/wallet/withdrawal
 * Bệnh nhân gửi yêu cầu rút tiền từ Ví về tài khoản ngân hàng
 */
async function handleRequestWithdrawal(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const { amount, patientBankAccountId, bankInfo, userNote } = req.body;
    const result = await walletService.requestWithdrawal(userId, {
      amount,
      patientBankAccountId,
      bankInfo,
      userNote,
      walletType: 'PATIENT',
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleRequestWithdrawal:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] GET /api/v1/patient/wallet/withdrawals
 * Lấy lịch sử yêu cầu rút tiền của bệnh nhân
 */
async function handleGetMyWithdrawalRequests(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const { page, limit, status } = req.query;
    const result = await walletService.getMyWithdrawalRequests(userId, {
      page,
      limit,
      status,
      walletType: 'PATIENT',
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetMyWithdrawalRequests:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] POST /api/v1/patient/wallet/withdrawals/:id/cancel
 * Bệnh nhân hủy yêu cầu rút tiền đang chờ xử lý
 */
async function handleCancelMyWithdrawalRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const requestId = req.params.id;
    const result = await walletService.cancelMyWithdrawalRequest(userId, requestId, 'PATIENT');

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleCancelMyWithdrawalRequest:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] GET /api/v1/doctor/wallet
 * Bác sĩ xem tổng quan Ví Bác sĩ
 */
async function handleGetDoctorWallet(req, res) {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const wallet = await walletService.getOrCreateWallet(doctorId, 'DOCTOR');
    const available = Number(wallet.availableBalance) || 0;
    const reserved = Number(wallet.reservedBalance) || 0;

    const recentTx = await walletService.getWalletTransactions(doctorId, {
      page: 1,
      limit: 10,
    });

    return res.status(200).json({
      errCode: 0,
      errMessage: 'OK',
      data: {
        walletId: wallet.id,
        doctorId,
        walletType: 'DOCTOR',
        availableBalance: available,
        reservedBalance: reserved,
        totalBalance: available + reserved,
        status: wallet.status,
        recentTransactions: recentTx.data?.transactions || [],
      },
    });
  } catch (error) {
    console.error('Error in handleGetDoctorWallet:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] POST /api/v1/doctor/wallet/withdrawal
 * Bác sĩ yêu cầu rút tiền từ Ví Bác sĩ
 */
async function handleRequestDoctorWithdrawal(req, res) {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const { amount, bankInfo, userNote } = req.body;
    const result = await walletService.requestWithdrawal(doctorId, {
      amount,
      bankInfo,
      userNote,
      walletType: 'DOCTOR',
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleRequestDoctorWithdrawal:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] GET /api/v1/doctor/wallet/withdrawals
 * Bác sĩ xem danh sách yêu cầu rút tiền của mình
 */
async function handleGetDoctorWithdrawalRequests(req, res) {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const { page, limit, status } = req.query;
    const result = await walletService.getMyWithdrawalRequests(doctorId, {
      page,
      limit,
      status,
      walletType: 'DOCTOR',
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetDoctorWithdrawalRequests:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] GET /api/v1/admin/financial/withdrawals
 * Admin tra cứu danh sách yêu cầu rút tiền toàn sàn
 */
async function handleGetAdminWithdrawalRequests(req, res) {
  try {
    const { page, limit, status, search, startDate, endDate } = req.query;
    const result = await walletService.getAdminWithdrawalRequests({
      page,
      limit,
      status,
      search,
      startDate,
      endDate,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminWithdrawalRequests:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 3] POST /api/v1/admin/financial/withdrawals/:id/process
 * Admin phê duyệt chuyển khoản hoặc từ chối yêu cầu rút tiền
 */
async function handleAdminProcessWithdrawal(req, res) {
  try {
    const adminId = req.user?.id;
    const requestId = req.params.id;
    const { action, adminNote, bankTransactionRef, receiptImage } = req.body;

    const result = await walletService.adminProcessWithdrawal(adminId, {
      requestId,
      action,
      adminNote,
      bankTransactionRef,
      receiptImage,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleAdminProcessWithdrawal:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

module.exports = {
  handleGetMyWallet,
  handleCreateDepositUrl,
  handleVNPayDepositIPN,
  handleVNPayDepositReturn,
  handleGetMyTransactions,
  // Phase 3 Withdrawal Handlers
  handleRequestWithdrawal,
  handleGetMyWithdrawalRequests,
  handleCancelMyWithdrawalRequest,
  handleGetDoctorWallet,
  handleRequestDoctorWithdrawal,
  handleGetDoctorWithdrawalRequests,
  handleGetAdminWithdrawalRequests,
  handleAdminProcessWithdrawal,
  // Phase 4 Admin Handlers
  handleGetAdminLiquidityMetrics,
  handleRecalibrateLedgerBaseline,
  handleGetAdminWalletTransactions,
  handleGetAdminWalletsList,
  handleToggleWalletStatus,
};
