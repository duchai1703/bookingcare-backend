// src/controllers/doctorController.js
const doctorService = require('../services/doctorService');

const getTopDoctorHome = async (req, res) => {
  try {
    // FIX BE-07: parseInt an toàn, clamp 1–50
    let limit = parseInt(req.query.limit, 10) || 10;
    if (limit < 1) limit = 1;
    if (limit > 50) limit = 50;
    const result = await doctorService.getTopDoctorHome(limit);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getTopDoctorHome error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getDetailDoctorById = async (req, res) => {
  try {
    const id = req.params.id || req.query.id;
    if (!id) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    }
    const result = await doctorService.getDetailDoctorById(id);
    const httpStatus = result.errCode === 0 ? 200 : 404;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getDetailDoctorById error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const saveInfoDoctor = async (req, res) => {
  try {
    const result = await doctorService.saveInfoDoctor(req.body);
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> saveInfoDoctor error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-010 – Xóa hồ sơ bác sĩ
const deleteDoctorInfo = async (req, res) => {
  try {
    const doctorId = req.params.doctorId || req.body.doctorId;
    const result = await doctorService.deleteDoctorInfo(doctorId);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> deleteDoctorInfo error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const bulkCreateSchedule = async (req, res) => {
  try {
    // [Security Guard] Doctor (R2) chỉ được tạo lịch cho chính mình
    if (req.user && req.user.roleId === 'R2') {
      const arr = req.body.arrSchedule;
      if (Array.isArray(arr)) {
        const hasOther = arr.some(s => String(s.doctorId) !== String(req.user.id));
        if (hasOther) {
          return res.status(403).json({ errCode: -1, message: 'Forbidden: Bác sĩ chỉ được tạo lịch cho chính mình!' });
        }
      }
    }
    const result = await doctorService.bulkCreateSchedule(req.body);
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> bulkCreateSchedule error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// FIX FE-02: REQ-AM-021 — Sửa lịch khám (maxNumber)
const editSchedule = async (req, res) => {
  try {
    const id = req.params.id;
    const { maxNumber } = req.body;
    if (!id) return res.status(400).json({ errCode: 1, message: 'Thiếu id!' });
    const db = require('../models');
    const schedule = await db.Schedule.findByPk(id, { raw: false });
    if (!schedule) return res.status(404).json({ errCode: 3, message: 'Không tìm thấy lịch khám!' });
    // [Security Guard] Doctor (R2) chỉ được sửa lịch của chính mình
    if (req.user && req.user.roleId === 'R2' && String(schedule.doctorId) !== String(req.user.id)) {
      return res.status(403).json({ errCode: -1, message: 'Forbidden: Bác sĩ chỉ được sửa lịch của chính mình!' });
    }
    if (maxNumber !== undefined) {
      if (maxNumber < schedule.currentNumber) {
        return res.status(400).json({
          errCode: 2,
          message: `maxNumber không được nhỏ hơn currentNumber (${schedule.currentNumber})!`,
        });
      }
      schedule.maxNumber = maxNumber;
      await schedule.save();
    }
    return res.status(200).json({ errCode: 0, message: 'Cập nhật lịch khám thành công!', data: schedule });
  } catch (err) {
    console.error('>>> editSchedule error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-021 – Xóa lịch khám
const deleteSchedule = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id || req.body.id };
    // [Security Guard] Doctor (R2) chỉ được xóa lịch của chính mình
    if (req.user && req.user.roleId === 'R2') {
      const db = require('../models');
      const schedule = data.id ? await db.Schedule.findByPk(data.id, { raw: true }) : null;
      if (schedule && String(schedule.doctorId) !== String(req.user.id)) {
        return res.status(403).json({ errCode: -1, message: 'Forbidden: Bác sĩ chỉ được xóa lịch của chính mình!' });
      }
    }
    const result = await doctorService.deleteSchedule(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> deleteSchedule error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getScheduleByDate = async (req, res) => {
  try {
    const doctorId = req.params.doctorId || req.query.doctorId;
    const date = req.query.date;
    let includeAll = req.query.includeAll === 'true'; // FIX BUG-06: Admin sees all slots

    // [Phase 10.5 Security Hotfix] Guard includeAll — chỉ R1 (Admin) hoặc R2 (Doctor, chỉ lịch của mình)
    if (includeAll && req.user) {
      if (req.user.roleId === 'R2' && String(doctorId) !== String(req.user.id)) {
        return res.status(403).json({
          errCode: -1,
          message: 'Forbidden: Bác sĩ chỉ xem được lịch của chính mình!',
        });
      }
      if (req.user.roleId !== 'R1' && req.user.roleId !== 'R2') {
        return res.status(403).json({
          errCode: -1,
          message: 'Forbidden: Admin or Doctor access required for includeAll',
        });
      }
    }

    if (!doctorId || !date) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số!' });
    }
    const result = await doctorService.getScheduleByDate(doctorId, date, includeAll);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getScheduleByDate error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-DR-003 – Lấy danh sách bệnh nhân, lọc theo statusId
const getListPatientForDoctor = async (req, res) => {
  try {
    // FIX DS-06: lấy doctorId từ JWT — không tin URL để chặn IDOR
    const doctorId = req.user.id;
    const { date, statusId } = req.query;
    if (!date) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số date!' });
    }
    const result = await doctorService.getListPatientForDoctor(doctorId, date, statusId);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getListPatientForDoctor error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const sendRemedy = async (req, res) => {
  try {
    // ✅ [Phase 8 v3.0] IDOR/BOLA: Lấy doctorId từ JWT token, KHÔNG tin req.body
    const data = {
      ...req.body,
      bookingId: req.params.bookingId,
      doctorId: req.user.id,  // BẮT BUỘC từ token
    };
    // ✅ [Phase 8 v3.0] Defense-in-depth: xóa email nếu client gửi lên
    // Backend sẽ tự lấy email từ Database khi query booking + include patientData
    delete data.email;

    const result = await doctorService.sendRemedy(data);
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> sendRemedy error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-DR-004 – Hủy lịch hẹn S2 → S4
const cancelBooking = async (req, res) => {
  try {
    // FIX DS-04: merge bookingId từ URL
    // ✅ [SECURITY-FIX Phase 4] IDOR/BOLA: Lấy doctorId từ JWT token, KHÔNG tin req.body
    const data = {
      ...req.body,
      bookingId: req.params.bookingId,
      doctorId: req.user.id,  // BẮT BUỘC từ token
    };
    const result = await doctorService.cancelBooking(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> cancelBooking error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-DR-007 – Lịch sử booking của bệnh nhân
const getPatientBookingHistory = async (req, res) => {
  try {
    // ✅ [SECURITY-FIX Phase 4] IDOR/BOLA: Lấy doctorId từ JWT token
    const doctorId = req.user.id;
    const patientId = req.params.patientId || req.query.patientId;
    if (!patientId) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số patientId!' });
    }
    const result = await doctorService.getPatientBookingHistory(patientId, doctorId);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getPatientBookingHistory error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  getTopDoctorHome,
  getDetailDoctorById,
  saveInfoDoctor,
  deleteDoctorInfo,
  bulkCreateSchedule,
  editSchedule,    // FIX FE-02
  deleteSchedule,
  getScheduleByDate,
  getListPatientForDoctor,
  sendRemedy,
  cancelBooking,
  getPatientBookingHistory,
};
