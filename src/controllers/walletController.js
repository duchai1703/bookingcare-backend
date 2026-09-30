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

module.exports = {
  handleGetMyWallet,
  handleCreateDepositUrl,
  handleVNPayDepositIPN,
  handleVNPayDepositReturn,
  handleGetMyTransactions,
  // Phase 4 Admin Handlers
  handleGetAdminLiquidityMetrics,
  handleGetAdminWalletTransactions,
  handleGetAdminWalletsList,
  handleToggleWalletStatus,
};
