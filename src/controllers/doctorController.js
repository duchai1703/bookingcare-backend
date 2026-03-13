// src/controllers/doctorController.js
const doctorService = require('../services/doctorService');

const getTopDoctorHome = async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const result = await doctorService.getTopDoctorHome(+limit);
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
    const result = await doctorService.bulkCreateSchedule(req.body);
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> bulkCreateSchedule error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-021 – Xóa lịch khám
const deleteSchedule = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id || req.body.id };
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
    if (!doctorId || !date) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số!' });
    }
    const result = await doctorService.getScheduleByDate(doctorId, date);
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
    const doctorId = req.params.doctorId || req.query.doctorId;
    const { date, statusId } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số!' });
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
    const result = await doctorService.sendRemedy(req.body);
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
    const result = await doctorService.cancelBooking(req.body);
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
    const patientId = req.params.patientId || req.query.patientId;
    if (!patientId) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số patientId!' });
    }
    const result = await doctorService.getPatientBookingHistory(patientId);
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
  deleteSchedule,
  getScheduleByDate,
  getListPatientForDoctor,
  sendRemedy,
  cancelBooking,
  getPatientBookingHistory,
};
