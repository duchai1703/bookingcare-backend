// bookingcare-backend/src/controllers/doctorSettlementController.js
'use strict';

const doctorSettlementService = require('../services/doctorSettlementService');

/**
 * GET /api/v1/admin/financial/doctor-settlements
 * Bảng kê quyết toán thù lao bác sĩ theo từng ca khám dành cho Quản trị viên
 */
async function handleGetAdminSettlementItems(req, res) {
  try {
    const result = await doctorSettlementService.getDoctorSettlementItems(req.query);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminSettlementItems:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/admin/financial/doctor-settlements/payout
 * Thực hiện chi trả hàng loạt hoặc đơn lẻ các ca khám đã AVAILABLE sang ví bác sĩ
 */
async function handlePayoutDoctorSettlements(req, res) {
  try {
    const { doctorId, itemIds, payoutMethod, note } = req.body;
    if (!doctorId) {
      return res.status(400).json({ errCode: 1, errMessage: 'Thiếu mã bác sĩ thụ hưởng' });
    }

    const result = await doctorSettlementService.payoutDoctorSettlementItems({
      doctorId,
      itemIds,
      payoutMethod: payoutMethod || 'WALLET',
      note,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handlePayoutDoctorSettlements:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * GET /api/v1/doctor/financial/settlement-statement
 * Bảng kê chi tiết thù lao ca khám dành riêng cho Bác sĩ đang đăng nhập (Doctor Portal)
 */
async function handleGetDoctorSettlementStatement(req, res) {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) {
      return res.status(401).json({ errCode: -1, errMessage: 'Chưa đăng nhập' });
    }

    const queryParams = {
      ...req.query,
      doctorId, // Đảm bảo IDOR prevention: Bác sĩ chỉ xem thù lao của chính mình
    };

    const result = await doctorSettlementService.getDoctorSettlementItems(queryParams);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetDoctorSettlementStatement:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/admin/financial/doctor-settlements/release-eligible
 * Kích hoạt quét và chuyển trạng thái EARNED → AVAILABLE cho các ca khám đã vượt T+24h
 */
async function handleReleaseEligibleSettlements(req, res) {
  try {
    const { forceAll } = req.body || {};
    const result = await doctorSettlementService.releaseEligibleSettlements(null, { forceAll: Boolean(forceAll) });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleReleaseEligibleSettlements:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * POST /api/v1/admin/financial/doctor-settlements/unlock
 * Admin mở khóa sớm thù lao ca khám đơn lẻ (Bypass T+24h)
 */
async function handleUnlockSingleSettlement(req, res) {
  try {
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ errCode: 1, errMessage: 'Thiếu mã quyết toán itemId' });
    }
    const result = await doctorSettlementService.releaseEligibleSettlements(null, { itemId, force: true });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleUnlockSingleSettlement:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
}

module.exports = {
  handleGetAdminSettlementItems,
  handlePayoutDoctorSettlements,
  handleGetDoctorSettlementStatement,
  handleReleaseEligibleSettlements,
  handleUnlockSingleSettlement,
};
