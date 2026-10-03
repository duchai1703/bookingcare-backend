// bookingcare-backend/src/controllers/refundGovernanceController.js
'use strict';

const refundGovernanceService = require('../services/refundGovernanceService');

/**
 * GET /api/v1/admin/financial/refund-cases
 * Danh sách hồ sơ hoàn tiền (phân trang, lọc theo trạng thái, lý do hủy, từ khóa tìm kiếm)
 */
async function handleGetAdminRefundCases(req, res) {
  try {
    const result = await refundGovernanceService.getAdminRefundCases(req.query);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminRefundCases:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * GET /api/v1/admin/financial/refund-cases/:id
 * Chi tiết hồ sơ hoàn tiền kèm calculationSnapshot chi tiết
 */
async function handleGetRefundCaseDetail(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ errCode: 1, errMessage: 'Thiếu ID hồ sơ hoàn tiền' });
    }
    const result = await refundGovernanceService.getRefundCaseDetail(id);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetRefundCaseDetail:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/admin/financial/refund-cases/:id/review
 * Admin thẩm định phê duyệt / từ chối / điều chỉnh hoàn tiền
 */
async function handleProcessAdminReviewRefund(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    if (!id) {
      return res.status(400).json({ errCode: 1, errMessage: 'Thiếu ID hồ sơ hoàn tiền' });
    }
    const { decision, adjustedRefundAmount, reviewNote } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ errCode: 2, errMessage: 'Quyết định không hợp lệ (APPROVED hoặc REJECTED)' });
    }

    const result = await refundGovernanceService.processAdminReviewRefund({
      caseId: id,
      adminId,
      decision,
      adjustedRefundAmount,
      reviewNote,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleProcessAdminReviewRefund:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * GET /api/v1/patient/refund-cases/:bookingId
 * Bệnh nhân tra cứu chi tiết công thức và lý do hoàn tiền cho ca khám của mình
 */
async function handleGetPatientRefundCaseByBooking(req, res) {
  try {
    const { bookingId } = req.params;
    const patientId = req.user?.id;
    if (!bookingId) {
      return res.status(400).json({ errCode: 1, errMessage: 'Thiếu ID ca khám' });
    }
    if (!patientId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const result = await refundGovernanceService.getPatientRefundCase(bookingId, patientId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetPatientRefundCaseByBooking:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

module.exports = {
  handleGetAdminRefundCases,
  handleGetRefundCaseDetail,
  handleProcessAdminReviewRefund,
  handleGetPatientRefundCaseByBooking,
};
