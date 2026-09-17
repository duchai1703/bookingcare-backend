// src/controllers/patientController.js
// Phase 9.2 — Patient Portal Controllers
// [IDOR Prevention] TẤT CẢ handler lấy patientId = req.user.id (từ JWT)
const patientService = require('../services/patientService');

const postBookAppointment = async (req, res) => {
  try {
    // [Phase 9.3 FIX] Lấy patientId từ JWT (route đã protected)
    // Fallback null cho guest mode (deprecated)
    const patientId = req.user ? req.user.id : null;
    const result = await patientService.postBookAppointment(req.body, patientId);
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
    // [Phase 9.3 FIX] HTTP status chuẩn: errCode !== 0 → 400
    if (result.errCode !== 0) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> postVerifyBookAppointment error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase 9.2] Patient Portal Handlers — Protected (verifyToken + checkPatientRole)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/v1/patient/profile — Lấy thông tin cá nhân
const getPatientProfile = async (req, res) => {
  try {
    // [IDOR Prevention] patientId từ JWT payload, KHÔNG từ query/params
    const patientId = req.user.id;
    const result = await patientService.getPatientProfile(patientId);
    const httpStatus = result.errCode === 0 ? 200 : 404;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getPatientProfile error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// PUT /api/v1/patient/profile — Cập nhật thông tin cá nhân
const editPatientProfile = async (req, res) => {
  try {
    // [IDOR Prevention] patientId từ JWT, KHÔNG từ body
    const patientId = req.user.id;
    const result = await patientService.editPatientProfile(req.body, patientId);
    const statusMap = { 0: 200, 1: 404, 4: 400 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> editPatientProfile error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// PUT /api/v1/patient/change-password — Đổi mật khẩu
const handleChangePassword = async (req, res) => {
  try {
    // [IDOR Prevention] patientId từ JWT
    const patientId = req.user.id;
    const result = await patientService.changePassword(req.body, patientId);
    const statusMap = { 0: 200, 1: 400, 2: 401 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleChangePassword error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// GET /api/v1/patient/bookings — Lấy lịch sử booking (3 tabs + phân trang)
const getPatientBookings = async (req, res) => {
  try {
    // [IDOR Prevention] patientId từ JWT
    const patientId = req.user.id;
    const result = await patientService.getPatientBookings(patientId, req.query);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getPatientBookings error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// PUT /api/v1/patient/bookings/:id/cancel — Hủy lịch hẹn
const handleCancelBooking = async (req, res) => {
  try {
    // [IDOR Prevention] patientId từ JWT, bookingId từ URL params
    const patientId = req.user.id;
    const bookingId = parseInt(req.params.id);
    if (!bookingId || isNaN(bookingId)) {
      return res.status(400).json({ errCode: 1, message: 'ID lịch hẹn không hợp lệ!' });
    }
    const result = await patientService.cancelBooking({ bookingId }, patientId);
    const statusMap = { 0: 200, 1: 400, 2: 404, 3: 400 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleCancelBooking error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// GET /api/v1/patient/bookings/:bookingId/attachments
const handleGetAttachments = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    if (!bookingId || isNaN(bookingId)) {
      return res.status(400).json({ errCode: 1, message: 'ID lịch hẹn không hợp lệ!' });
    }
    const result = await patientService.getBookingAttachments(bookingId, req.user.id, req.user.roleId);
    const statusMap = { 0: 200, 1: 400, 2: 404, 403: 403 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleGetAttachments error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// POST /api/v1/patient/bookings/:bookingId/attachments
const handleUploadAttachment = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    if (!bookingId || isNaN(bookingId)) {
      return res.status(400).json({ errCode: 1, message: 'ID lịch hẹn không hợp lệ!' });
    }
    const result = await patientService.uploadBookingAttachment(bookingId, req.user.id, req.body);
    const statusMap = { 0: 201, 1: 400, 3: 400, 4: 400, 5: 400, 6: 400, 7: 400, 404: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleUploadAttachment error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// GET /api/v1/patient/bookings/:bookingId/attachments/:attachmentId/download
const handleDownloadAttachment = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const attachmentId = parseInt(req.params.attachmentId);
    if (!bookingId || !attachmentId || isNaN(bookingId) || isNaN(attachmentId)) {
      return res.status(400).json({ errCode: 1, message: 'Tham số không hợp lệ!' });
    }
    const result = await patientService.downloadBookingAttachment(bookingId, attachmentId, req.user.id, req.user.roleId);
    if (result.errCode !== 0) {
      const statusMap = { 1: 400, 2: 404, 403: 403, 404: 404 };
      return res.status(statusMap[result.errCode] || 500).json(result);
    }

    const attachment = result.data;
    let base64Raw = attachment.fileData;
    if (base64Raw.includes(';base64,')) {
      base64Raw = base64Raw.split(';base64,')[1];
    }
    const fileBuffer = Buffer.from(base64Raw, 'base64');

    const disposition = req.query.mode === 'inline' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', attachment.fileType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`);
    return res.send(fileBuffer);
  } catch (err) {
    console.error('>>> handleDownloadAttachment error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// DELETE /api/v1/patient/bookings/:bookingId/attachments/:attachmentId
const handleDeleteAttachment = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const attachmentId = parseInt(req.params.attachmentId);
    if (!bookingId || !attachmentId || isNaN(bookingId) || isNaN(attachmentId)) {
      return res.status(400).json({ errCode: 1, message: 'Tham số không hợp lệ!' });
    }
    const result = await patientService.deleteBookingAttachment(bookingId, attachmentId, req.user.id);
    const statusMap = { 0: 200, 1: 400, 3: 400, 404: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleDeleteAttachment error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  postBookAppointment,
  postVerifyBookAppointment,
  getPatientProfile,
  editPatientProfile,
  handleChangePassword,
  getPatientBookings,
  handleCancelBooking,
  handleGetAttachments,
  handleUploadAttachment,
  handleDownloadAttachment,
  handleDeleteAttachment,
};

