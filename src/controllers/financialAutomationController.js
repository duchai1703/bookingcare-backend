// bookingcare-backend/src/controllers/financialAutomationController.js
// Điều phối API Hàng Đợi Ngoại Lệ & Chu Trình Tự Động Hóa Tài Chính
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

module.exports = {
  handleGetExceptionQueue,
  handleRunAutomationCycle,
};
