// bookingcare-backend/src/controllers/financialAutomationController.js
// Điều phối API Hàng Đợi Ngoại Lệ, Chu Trình Tự Động Hóa & Sơ Đồ Dòng Tiền Trực Quan
'use strict';

const financialAutomationService = require('../services/financialAutomationService');

/**
 * GET /api/v1/admin/financial/exceptions
 * Lấy danh sách hàng đợi ngoại lệ tập trung (FEQ)
 */
async function handleGetExceptionQueue(req, res) {
  try {
    const result = await financialAutomationService.getExceptionQueue();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetExceptionQueue:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/admin/financial/automation/run-cycle
 * Kích hoạt chu trình tự động hóa tài chính theo quy tắc an toàn
 */
async function handleRunAutomationCycle(req, res) {
  try {
    const adminId = req.user?.id || 1;
    const { dryRun } = req.body || {};
    const result = await financialAutomationService.runAutomationCycle({ adminId, dryRun });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleRunAutomationCycle:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * GET /api/v1/admin/financial/master-overview
 * Lấy tổng quan ngân quỹ & điều phối dòng tiền toàn sàn cho Executive Dashboard
 */
async function handleGetMasterOverview(req, res) {
  try {
    const result = await financialAutomationService.getMasterTreasuryOverview();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetMasterOverview:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/admin/financial/master-automation-run
 * Kích hoạt chu trình tài chính tự động toàn diện (Master Automation Cycle)
 */
async function handleRunMasterAutomation(req, res) {
  try {
    const adminId = req.user?.id || 1;
    const result = await financialAutomationService.runMasterAutomationCycle({ adminId });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleRunMasterAutomation:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 1 - CASH FLOW ARCHITECTURE]
 * GET /api/v1/admin/financial/visual-cashflow
 * Tổng hợp 5 Khối Vốn Lõi, Đối soát Bất biến & 4 Biểu đồ Recharts chuẩn Ramp FinTech
 */
async function handleGetVisualCashflow(req, res) {
  try {
    const options = {
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      doctorId: req.query.doctorId,
      clinicId: req.query.clinicId,
      sort: req.query.sort,
      timeRange: req.query.timeRange,
    };
    const result = await financialAutomationService.getVisualCashflowMetrics(options);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetVisualCashflow:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 1 - CASH FLOW ARCHITECTURE]
 * POST /api/v1/admin/financial/withdraw-platform-profit
 * Admin rút / kết chuyển lợi nhuận nền tảng ra tài khoản ngân hàng
 */
async function handleWithdrawPlatformProfit(req, res) {
  try {
    const adminId = req.user?.id || 1;
    const { amount, note, bankAccountInfo } = req.body || {};
    const result = await financialAutomationService.withdrawPlatformProfit(adminId, {
      amount,
      note,
      bankAccountInfo,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleWithdrawPlatformProfit:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * [PHASE 2 - TRANSACTION LINEAGE & LIFECYCLE INSPECTOR]
 * GET /api/v1/admin/financial/transaction-lineage/:id
 * Truy vết vòng đời toàn vẹn của một giao dịch bất kỳ
 */
async function handleGetTransactionLineage(req, res) {
  try {
    const targetId = req.params.id;
    const result = await financialAutomationService.getTransactionLineage(targetId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetTransactionLineage:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

module.exports = {
  handleGetExceptionQueue,
  handleRunAutomationCycle,
  handleGetMasterOverview,
  handleRunMasterAutomation,
  handleGetVisualCashflow,
  handleWithdrawPlatformProfit,
  handleGetTransactionLineage,
};
