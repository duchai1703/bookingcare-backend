// src/controllers/patientController.js
const patientService = require('../services/patientService');

const postBookAppointment = async (req, res) => {
  try {
    const result = await patientService.postBookAppointment(req.body);
    // errCode 0 = thành công (200), còn lại = lỗi validation (400)
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> postBookAppointment error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const postVerifyBookAppointment = async (req, res) => {
  try {
    const result = await patientService.postVerifyBookAppointment(req.body);
    // errCode 0 = OK, 2 = đã xác nhận rồi (409 Conflict)
    const statusMap = { 0: 200, 1: 400, 2: 409 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> postVerifyBookAppointment error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  postBookAppointment,
  postVerifyBookAppointment,
};
