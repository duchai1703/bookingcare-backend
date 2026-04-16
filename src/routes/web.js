// SRS Section 5.2 – RESTful API Endpoints (with Auth Middleware) – Chuẩn REST + Versioning /api/v1/
const userController = require('../controllers/userController');
const doctorController = require('../controllers/doctorController');
const patientController = require('../controllers/patientController');
const reviewController = require('../controllers/reviewController');
const specialtyController = require('../controllers/specialtyController');
const clinicController = require('../controllers/clinicController');
const statisticController = require('../controllers/statisticController');
const { verifyToken, checkAdminRole, checkDoctorRole, checkPatientRole, checkAdminOrDoctorRole } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

// ═══════════════════════════════════════════════════════════════════════
// [Phase 9.7] authLimiter — Chống brute-force cho Auth endpoints
// 5 requests / 15 phút cho mỗi IP — gắt gao hơn apiLimiter
// ═══════════════════════════════════════════════════════════════════════
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100,                 // Tăng lên 100 cho môi trường dev thay vì 5
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    errCode: 429,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
});

const routes = (app) => {
  // ✅ [FIX-IMAGE] DS-01 v2: jsonLarge không cần nữa — global limit đã 8mb trong server.js

  // ===== HEALTH CHECK =====
  app.get('/api/health', (req, res) => res.json({ errCode: 0, message: 'BookingCare Backend is running!' }));

  // ===== PUBLIC ROUTES (không cần đăng nhập) =====

  // Authentication (SRS 3.1)
  // [Phase 9.7] authLimiter — 5 req/15min chống brute-force
  app.post('/api/v1/auth/login', authLimiter, userController.handleLogin);

  // ─────────────────────────────────────────────────────
  // [Phase 9] Auth Public Endpoints — Nhóm 2 (Design Document v3.0, Mục 4.2)
  // Các endpoint này KHÔNG đi qua JWT middleware
  // ─────────────────────────────────────────────────────
  app.post('/api/v1/auth/register',         userController.handleRegisterPatient);    // Đăng ký bệnh nhân (R3)
  app.post('/api/v1/auth/forgot-password',  authLimiter, userController.handleForgotPassword);     // [Phase 9.7] authLimiter
  app.post('/api/v1/auth/reset-password',   userController.handleResetPassword);      // Đặt mật khẩu mới

  // Doctors – Public (SRS 3.7, 3.8, 3.9)
  app.get('/api/v1/doctors/top', doctorController.getTopDoctorHome);
  app.get('/api/v1/doctors/:id', doctorController.getDetailDoctorById);
  app.get('/api/v1/doctors/:doctorId/schedules', doctorController.getScheduleByDate);

  // ─────────────────────────────────────────────────────
  // [Phase 9.2] Doctor Reviews — PUBLIC (không cần auth)
  // GET /api/v1/doctors/:doctorId/reviews?page=1&limit=10
  // Ai cũng xem được đánh giá bác sĩ
  // ─────────────────────────────────────────────────────
  app.get('/api/v1/doctors/:doctorId/reviews', reviewController.getDoctorReviews);

  // FINAL FIX 9.7 — Endpoint chuẩn cho Verify Booking (link email không có JWT)
  app.post('/api/v1/verify-book-appointment', patientController.postVerifyBookAppointment); // FINAL FIX 9.7
  // Alias giữ tương thích ngược — các email cũ vẫn hoạt động
  app.post('/api/v1/bookings/verify', patientController.postVerifyBookAppointment);

  // Specialties – Public
  app.get('/api/v1/specialties', specialtyController.getAllSpecialty);
  app.get('/api/v1/specialties/:id', specialtyController.getDetailSpecialtyById);

  // Clinics – Public
  app.get('/api/v1/clinics', clinicController.getAllClinic);
  app.get('/api/v1/clinics/:id', clinicController.getDetailClinicById);

  // Allcode & Search – Public
  app.get('/api/v1/allcode', userController.getAllCode);
  app.get('/api/v1/search', userController.handleSearch);                                               // REQ-PT-002

  // ===== ADMIN ROUTES – Yêu cầu role R1 (SRS REQ-AU-004, 008) =====

  // User CRUD (SRS 3.2)
  app.get('/api/v1/users', verifyToken, checkAdminRole, userController.handleGetAllUsers);
  app.post('/api/v1/users', verifyToken, checkAdminRole, userController.handleCreateNewUser);
  app.put('/api/v1/users/:id', verifyToken, checkAdminRole, userController.handleEditUser);
  app.delete('/api/v1/users/:id', verifyToken, checkAdminRole, userController.handleDeleteUser);

  // Doctor Management (SRS 3.3)
  app.post('/api/v1/doctors', verifyToken, checkAdminRole, doctorController.saveInfoDoctor);
  app.delete('/api/v1/doctors/:doctorId', verifyToken, checkAdminRole, doctorController.deleteDoctorInfo);

  // Schedule Management (SRS 3.6) — Mở cho cả Admin (R1) và Doctor (R2)
  // Security guard: Doctor chỉ được thao tác lịch của chính mình (enforced in controller)
  app.post('/api/v1/schedules/bulk', verifyToken, checkAdminOrDoctorRole, doctorController.bulkCreateSchedule);
  app.put('/api/v1/schedules/:id', verifyToken, checkAdminOrDoctorRole, doctorController.editSchedule);            // FIX FE-02: REQ-AM-021
  app.delete('/api/v1/schedules/:id', verifyToken, checkAdminOrDoctorRole, doctorController.deleteSchedule);
  // [Phase 10.5 VULN-001] Admin + Doctor schedule read (includeAll=true)
  // Guard: Doctor chỉ xem được lịch của chính mình (enforced in controller)
  app.get('/api/v1/admin/schedules', verifyToken, checkAdminOrDoctorRole, doctorController.getScheduleByDate);

  // Specialty Management (SRS 3.5)
  app.post('/api/v1/specialties', verifyToken, checkAdminRole, specialtyController.createSpecialty);
  app.put('/api/v1/specialties/:id', verifyToken, checkAdminRole, specialtyController.editSpecialty);
  app.delete('/api/v1/specialties/:id', verifyToken, checkAdminRole, specialtyController.deleteSpecialty);

  // Clinic Management (SRS 3.4)
  app.post('/api/v1/clinics', verifyToken, checkAdminRole, clinicController.createClinic);
  app.put('/api/v1/clinics/:id', verifyToken, checkAdminRole, clinicController.editClinic);
  app.delete('/api/v1/clinics/:id', verifyToken, checkAdminRole, clinicController.deleteClinic);

  // [Phase 10] STATISTICS — Admin only (roleId === 'R1')
  app.get('/api/v1/statistics/overview',           verifyToken, checkAdminRole, statisticController.getOverviewStatistics);
  app.get('/api/v1/statistics/bookings-by-day',    verifyToken, checkAdminRole, statisticController.getBookingsByDay);
  app.get('/api/v1/statistics/bookings-by-status', verifyToken, checkAdminRole, statisticController.getBookingsByStatus);
  app.get('/api/v1/statistics/top-specialties',    verifyToken, checkAdminRole, statisticController.getTopSpecialties);
  app.get('/api/v1/statistics/top-doctors',        verifyToken, checkAdminRole, statisticController.getTopDoctors);

  // ===== DOCTOR ROUTES – Yêu cầu role R2 (SRS 3.11, 3.12, 3.13) =====

  app.get('/api/v1/doctors/:doctorId/patients', verifyToken, checkDoctorRole, doctorController.getListPatientForDoctor);
  app.post('/api/v1/bookings/:bookingId/remedy', verifyToken, checkDoctorRole, doctorController.sendRemedy);
  app.patch('/api/v1/bookings/:bookingId/cancel', verifyToken, checkDoctorRole, doctorController.cancelBooking);        // REQ-DR-004
  app.get('/api/v1/patients/:patientId/bookings', verifyToken, checkDoctorRole, doctorController.getPatientBookingHistory); // REQ-DR-007

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase 9.2] PATIENT ROUTES – Yêu cầu role R3 (verifyToken + checkPatientRole)
  // ═══════════════════════════════════════════════════════════════════════
  // Security: TẤT CẢ route dưới đây đi qua verifyToken (JWT) + checkPatientRole (R3)
  // IDOR Prevention: Controller lấy patientId = req.user.id, KHÔNG từ params/body
  // ═══════════════════════════════════════════════════════════════════════

  // Profile APIs (Design Doc v3.0, Mục 4.1.1)
  app.get('/api/v1/patient/profile',          verifyToken, checkPatientRole, patientController.getPatientProfile);
  app.put('/api/v1/patient/profile',          verifyToken, checkPatientRole, patientController.editPatientProfile);
  app.put('/api/v1/patient/change-password',  verifyToken, checkPatientRole, patientController.handleChangePassword);

  // Booking APIs (Design Doc v3.0, Mục 4.1.2)
  // [Phase 9.3 FIX] POST /bookings chuyển từ Public vào Protected — bệnh nhân PHẢI đăng nhập để đặt lịch
  app.post('/api/v1/bookings',                    verifyToken, checkPatientRole, patientController.postBookAppointment);
  app.get('/api/v1/patient/bookings',             verifyToken, checkPatientRole, patientController.getPatientBookings);
  app.put('/api/v1/patient/bookings/:id/cancel',  verifyToken, checkPatientRole, patientController.handleCancelBooking);

  // Review API (Design Doc v3.0, Mục 4.1.3) — Protected, R3 only
  app.post('/api/v1/reviews', verifyToken, checkPatientRole, reviewController.submitReview);
};

module.exports = routes;

