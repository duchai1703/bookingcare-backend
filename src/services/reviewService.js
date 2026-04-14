// src/services/reviewService.js
// Phase 9.2 — Review Service: submitReview, getDoctorReviews
// Security: IDOR check, XSS Sanitize, Pagination
const db = require('../models');
const { sanitizeContent } = require('../utils/sanitizeHtml');

// ═══════════════════════════════════════════════════════════════════════
// 1. SUBMIT REVIEW — Bệnh nhân đánh giá bác sĩ sau khám
// ═══════════════════════════════════════════════════════════════════════
// Security Rules:
//   - IDOR Check: bookingId phải thuộc về patientId (từ JWT)
//   - Status Check: booking.statusId PHẢI là 'S3' (đã khám xong)
//   - Unique Check: UNIQUE(bookingId) → mỗi booking chỉ review 1 lần
//   - XSS Sanitize: comment được sanitize trước khi lưu
// ═══════════════════════════════════════════════════════════════════════
const submitReview = async (data, patientId) => {
  try {
    // 1. Validate đầu vào
    if (!data.bookingId || !data.doctorId || !data.rating) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc (bookingId, doctorId, rating)!' };
    }

    // Validate rating trong khoảng 1–5
    const rating = parseInt(data.rating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return { errCode: 1, message: 'Điểm đánh giá phải từ 1 đến 5!' };
    }

    // ═══════════════════════════════════════════════════════════
    // 2. [IDOR Check] Verify booking thuộc về patient + đúng doctor + đúng status
    // WHERE { id: bookingId, patientId: req.user.id, doctorId, statusId: 'S3' }
    // → Chặn patient A review booking của patient B
    // ═══════════════════════════════════════════════════════════
    const booking = await db.Booking.findOne({
      where: {
        id: data.bookingId,
        patientId,          // [IDOR] Từ JWT, KHÔNG từ body
        doctorId: data.doctorId,
        statusId: 'S3',     // Chỉ review khi đã khám xong
      },
    });

    if (!booking) {
      return { errCode: 2, message: 'Lịch hẹn không hợp lệ hoặc chưa được khám xong!' };
    }

    // 3. Kiểm tra đã review chưa (UNIQUE constraint cũng bắt, nhưng check trước cho UX tốt hơn)
    const existingReview = await db.Review.findOne({
      where: { bookingId: data.bookingId },
    });

    if (existingReview) {
      return { errCode: 3, message: 'Bạn đã đánh giá lịch hẹn này rồi!' };
    }

    // ═══════════════════════════════════════════════════════════
    // 4. [XSS Sanitize] Làm sạch comment trước khi lưu DB
    // Chặn Stored XSS (Defense-in-Depth Layer 1)
    // ═══════════════════════════════════════════════════════════
    const cleanComment = data.comment ? sanitizeContent(data.comment) : null;

    // 5. Create review
    await db.Review.create({
      doctorId: data.doctorId,
      patientId,  // [IDOR] Từ JWT
      bookingId: data.bookingId,
      rating,
      comment: cleanComment,
    });

    return { errCode: 0, message: 'Đánh giá thành công! Cảm ơn bạn.' };
  } catch (err) {
    console.error('>>> submitReview error:', err);
    // Handle unique constraint violation (double-click protection)
    if (err.name === 'SequelizeUniqueConstraintError') {
      return { errCode: 3, message: 'Bạn đã đánh giá lịch hẹn này rồi!' };
    }
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 2. GET DOCTOR REVIEWS — Lấy danh sách đánh giá của bác sĩ (PUBLIC)
// ═══════════════════════════════════════════════════════════════════════
// Endpoint: GET /api/v1/doctors/:doctorId/reviews
// KHÔNG cần JWT — ai cũng xem được
// BẮT BUỘC phân trang: ?page=1&limit=10 (max limit=50)
// Trả thêm: averageRating, totalReviews
// ═══════════════════════════════════════════════════════════════════════
const getDoctorReviews = async (doctorId, query) => {
  try {
    if (!doctorId) {
      return { errCode: 1, message: 'Thiếu ID bác sĩ!' };
    }

    const { page = 1, limit = 10 } = query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 10, 50); // Cap tối đa 50

    // 1. Lấy danh sách reviews có phân trang
    const { count, rows } = await db.Review.findAndCountAll({
      where: { doctorId },
      limit: safeLimit,
      offset,
      order: [['createdAt', 'DESC']],
      raw: false,
      include: [
        // Tên bệnh nhân đã đánh giá (chỉ lấy firstName, lastName — KHÔNG lấy email/phone)
        {
          model: db.User,
          as: 'reviewPatientData',
          attributes: ['firstName', 'lastName'],
        },
      ],
    });

    // 2. Tính trung bình rating
    // Dùng aggregate function thay vì tính từ rows (để đúng khi phân trang)
    const avgResult = await db.Review.findOne({
      where: { doctorId },
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'avgRating'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'totalCount'],
      ],
      raw: true,
    });

    const averageRating = avgResult.avgRating
      ? parseFloat(parseFloat(avgResult.avgRating).toFixed(1))
      : 0;
    const totalReviews = parseInt(avgResult.totalCount) || 0;

    return {
      errCode: 0,
      message: 'OK',
      data: {
        averageRating,
        totalReviews,
        reviews: rows,
        pagination: {
          page: parseInt(page),
          limit: safeLimit,
          totalItems: count,
          totalPages: Math.ceil(count / safeLimit),
        },
      },
    };
  } catch (err) {
    console.error('>>> getDoctorReviews error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = {
  submitReview,
  getDoctorReviews,
};
