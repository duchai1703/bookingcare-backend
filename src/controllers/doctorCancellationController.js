// src/controllers/doctorCancellationController.js
// Thin controller for Doctor Schedule Cancellation & Compensation Engine
'use strict';

const doctorCancellationService = require('../services/doctorCancellationService');

/**
 * POST /api/v1/doctor-cancellations/preview
 * Xem trước ảnh hưởng (số slot, số booking, tổng tiền hoàn) trước khi bấm xác nhận
 */
async function handlePreviewCancellation(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    const isDoctor = user.roleId === 'R2';
    const doctorId = isDoctor ? user.id : req.body.doctorId;

    if (!doctorId) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu thông tin bác sĩ (doctorId)' });
    }

    const { clinicId, scope, date, timeType, bookingId, fromDate, toDate } = req.body;

    const result = await doctorCancellationService.previewCancellation({
      doctorId,
      clinicId,
      scope,
      date,
      timeType,
      bookingId,
      fromDate,
      toDate,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handlePreviewCancellation:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

/**
 * POST /api/v1/doctor-cancellations/execute
 * Thực thi hủy lịch khám & hoàn tiền 100% tự động về Ví Bệnh nhân
 */
async function handleExecuteCancellation(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    const isDoctor = user.roleId === 'R2';
    const doctorId = isDoctor ? user.id : req.body.doctorId;

    if (!doctorId) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu thông tin bác sĩ (doctorId)' });
    }

    const { clinicId, scope, date, timeType, bookingId, fromDate, toDate, reason } = req.body;

    const result = await doctorCancellationService.executeCancellation({
      doctorId,
      clinicId,
      scope,
      date,
      timeType,
      bookingId,
      fromDate,
      toDate,
      reason,
      cancelledBy: user.id,
      cancelledByRole: user.roleId === 'R1' ? 'ADMIN' : 'DOCTOR',
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleExecuteCancellation:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

/**
 * GET /api/v1/doctor-cancellations/history
 * Lịch sử các đợt hủy lịch (Admin & Doctor)
 */
async function handleGetCancellationHistory(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    const isDoctor = user.roleId === 'R2';
    const doctorId = isDoctor ? user.id : req.query.doctorId;
    const { clinicId, scope, page, limit } = req.query;

    const result = await doctorCancellationService.getCancellationHistory({
      doctorId,
      clinicId,
      scope,
      page,
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetCancellationHistory:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

/**
 * GET /api/v1/doctor-cancellations/:id
 * Chi tiết đối tượng bị ảnh hưởng của 1 đợt hủy lịch (Master-Detail)
 */
async function handleGetCancellationDetail(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    const { id } = req.params;
    const result = await doctorCancellationService.getCancellationDetail(id);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetCancellationDetail:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

module.exports = {
  handlePreviewCancellation,
  handleExecuteCancellation,
  handleGetCancellationHistory,
  handleGetCancellationDetail,
};
