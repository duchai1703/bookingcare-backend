// src/controllers/doctorPatientController.js
// [Doctor Patient Relationship & Clinical Dossier Hub]
// Controller mỏng (thin): Chỉ nhận request, validate quyền token, gọi service, trả response
const doctorPatientService = require('../services/doctorPatientService');

/**
 * GET /api/v1/doctor/patients
 * Lấy danh sách bệnh nhân duy nhất của bác sĩ đang đăng nhập (req.user.id)
 */
const handleGetDoctorPatients = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const result = await doctorPatientService.getDoctorPatients(doctorId, req.query);
    const statusCode = result.errCode === 0 ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    console.error('>>> handleGetDoctorPatients error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

/**
 * GET /api/v1/doctor/patients/:patientKey/summary
 * Lấy hồ sơ chi tiết và dòng thời gian ca khám của bệnh nhân
 */
const handleGetDoctorPatientSummary = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patientKey } = req.params;
    const result = await doctorPatientService.getDoctorPatientSummary(doctorId, patientKey);
    const statusCode = result.errCode === 0 ? 200 : result.errCode === 2 ? 404 : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    console.error('>>> handleGetDoctorPatientSummary error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  handleGetDoctorPatients,
  handleGetDoctorPatientSummary,
};
