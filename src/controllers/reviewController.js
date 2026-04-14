// src/controllers/reviewController.js
// Phase 9.2 — Review Controllers
// submitReview: Protected (R3 only) | getDoctorReviews: Public
const reviewService = require('../services/reviewService');

// POST /api/v1/reviews — Bệnh nhân đánh giá bác sĩ
// Middleware: verifyToken → checkPatientRole
const submitReview = async (req, res) => {
  try {
    // [IDOR Prevention] patientId từ JWT, KHÔNG từ body
    const patientId = req.user.id;
    const result = await reviewService.submitReview(req.body, patientId);
    const statusMap = { 0: 201, 1: 400, 2: 400, 3: 409 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> submitReview error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// GET /api/v1/doctors/:doctorId/reviews — Lấy danh sách đánh giá (PUBLIC)
// KHÔNG cần middleware auth — ai cũng xem được
const getDoctorReviews = async (req, res) => {
  try {
    const doctorId = parseInt(req.params.doctorId);
    if (!doctorId || isNaN(doctorId)) {
      return res.status(400).json({ errCode: 1, message: 'ID bác sĩ không hợp lệ!' });
    }
    const result = await reviewService.getDoctorReviews(doctorId, req.query);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getDoctorReviews error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  submitReview,
  getDoctorReviews,
};
