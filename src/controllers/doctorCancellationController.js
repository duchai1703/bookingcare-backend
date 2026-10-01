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

    const { clinicId, scope, date, timeType, bookingId, fromDate, toDate, scheduleIds, bookingIds } = req.body;

    const result = await doctorCancellationService.previewCancellation({
      doctorId,
      clinicId,
      scope,
      date,
      timeType,
      bookingId,
      fromDate,
      toDate,
      scheduleIds,
      bookingIds,
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

    const { clinicId, scope, date, timeType, bookingId, fromDate, toDate, scheduleIds, bookingIds, reason } = req.body;

    const result = await doctorCancellationService.executeCancellation({
      doctorId,
      clinicId,
      scope,
      date,
      timeType,
      bookingId,
      fromDate,
      toDate,
      scheduleIds,
      bookingIds,
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

/**
 * POST /api/v1/doctor-cancellations/reopen-schedule
 * Khôi phục / Mở lại khung giờ khám đã từng bị báo bận (Reopen Slot)
 */
async function handleReopenSchedule(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    const { scheduleId, reason } = req.body;
    if (!scheduleId) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu mã khung giờ (scheduleId) cần mở lại!' });
    }

    const result = await doctorCancellationService.reopenSchedule({
      scheduleId: Number(scheduleId),
      doctorId: user.roleId === 'R2' ? user.id : req.body.doctorId,
      userRole: user.roleId,
      userId: user.id,
      reason,
    });

    const statusCode = result.errCode === 0 ? 200 : result.errCode === 403 ? 403 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('Error in handleReopenSchedule:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

/**
 * GET /api/v1/doctor-cancellations/doctor-reliability/:id?
 * Lấy điểm số độ tin cậy và thống kê chất lượng của bác sĩ
 */
async function handleGetDoctorReliability(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    let doctorId = req.params.id || req.query.doctorId;
    if (user.roleId === 'R2') {
      doctorId = user.id;
    }

    if (!doctorId) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu mã bác sĩ (doctorId)' });
    }

    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    const result = await doctorCancellationService.getDoctorReliabilityScore(doctorId, { days });

    const statusCode = result.errCode === 0 ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('Error in handleGetDoctorReliability:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

/**
 * GET /api/v1/doctor-cancellations/analytics
 * Báo cáo thống kê toàn diện & Quản trị độ tin cậy toàn sàn (Admin)
 */
async function handleGetCancellationAnalytics(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập' });
    }

    const { startDate, endDate, clinicId, doctorId } = req.query;
    const result = await doctorCancellationService.getCancellationAnalytics({
      startDate,
      endDate,
      clinicId,
      doctorId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetCancellationAnalytics:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ' });
  }
}

module.exports = {
  handlePreviewCancellation,
  handleExecuteCancellation,
  handleGetCancellationHistory,
  handleGetCancellationDetail,
  handleReopenSchedule,
  handleGetDoctorReliability,
  handleGetCancellationAnalytics,
};
