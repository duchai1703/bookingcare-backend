// SRS Section 5.2 – RESTful API Endpoints (with Auth Middleware) – Chuẩn REST + Versioning /api/v1/
const userController = require('../controllers/userController');
const doctorController = require('../controllers/doctorController');
const patientController = require('../controllers/patientController');
const reviewController = require('../controllers/reviewController');
const specialtyController = require('../controllers/specialtyController');
const clinicController = require('../controllers/clinicController');
const statisticController = require('../controllers/statisticController');
const paymentController = require('../controllers/paymentController'); // [NEW LOGIC VNPAY-MAIL]
const patientManageController = require('../controllers/patientManageController'); // [Phase F] Patient Workspace & Refund Flow
const doctorManageController = require('../controllers/doctorManageController'); // [Doctor Operations Center]
const clinicManageController = require('../controllers/clinicManageController'); // [Clinic Control Center]
const specialtyManageController = require('../controllers/specialtyManageController'); // [Specialty Intelligence Hub]
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
  app.get('/api/v1/specialties/:id/clinics', specialtyController.getSpecialtyClinics);
  app.get('/api/v1/specialties/:id', specialtyController.getDetailSpecialtyById);

  // Clinics – Public
  app.get('/api/v1/clinics', clinicController.getAllClinic);
  app.get('/api/v1/clinics/:id/specialties', clinicController.getClinicSpecialties);
  app.get('/api/v1/clinics/:id', clinicController.getDetailClinicById);

  // Allcode & Search – Public
  app.get('/api/v1/allcode', userController.getAllCode);
  app.get('/api/v1/search', userController.handleSearch);                                               // REQ-PT-002

  // ═══════════════════════════════════════════════════════════════════════
  // [NEW LOGIC VNPAY-MAIL]: VNPay Payment Routes — Public (không cần JWT)
  // Bệnh nhân bấm từ email → chưa đăng nhập → cần public endpoint
  // ═══════════════════════════════════════════════════════════════════════
  app.post('/api/v1/payment/create-payment-url-by-token', paymentController.createPaymentUrlByToken);
  app.get('/api/v1/payment/vnpay-ipn', paymentController.vnpayIpn);
  app.get('/api/v1/payment/booking-by-token', paymentController.bookingByToken);

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
  app.get('/api/v1/doctor/checkin/:qrToken', verifyToken, checkDoctorRole, doctorController.verifyDoctorCheckin); // [Phase B] Doctor QR check-in

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

  // [Phase B] Patient Bank Accounts (Tài khoản nhận tiền hoàn)
  app.get('/api/v1/patient/bank-accounts',             verifyToken, checkPatientRole, patientController.handleGetBankAccounts);
  app.post('/api/v1/patient/bank-accounts',            verifyToken, checkPatientRole, patientController.handleAddBankAccount);
  app.put('/api/v1/patient/bank-accounts/:id/primary', verifyToken, checkPatientRole, patientController.handleSetPrimaryBankAccount);
  app.delete('/api/v1/patient/bank-accounts/:id',      verifyToken, checkPatientRole, patientController.handleDeleteBankAccount);

  // Booking APIs (Design Doc v3.0, Mục 4.1.2)
  // [Phase 9.3 FIX] POST /bookings chuyển từ Public vào Protected — bệnh nhân PHẢI đăng nhập để đặt lịch
  app.post('/api/v1/bookings',                    verifyToken, checkPatientRole, patientController.postBookAppointment);
  app.get('/api/v1/patient/bookings',             verifyToken, checkPatientRole, patientController.getPatientBookings);
  app.put('/api/v1/patient/bookings/:id/cancel',  verifyToken, checkPatientRole, patientController.handleCancelBooking);

  // [Phase B] Medical Attachments (Tài liệu đính kèm y tế)
  app.post('/api/v1/patient/bookings/:bookingId/attachments', verifyToken, checkPatientRole, patientController.handleUploadAttachment);
  app.get('/api/v1/patient/bookings/:bookingId/attachments', verifyToken, patientController.handleGetAttachments);
  app.get('/api/v1/patient/bookings/:bookingId/attachments/:attachmentId/download', verifyToken, patientController.handleDownloadAttachment);
  app.delete('/api/v1/patient/bookings/:bookingId/attachments/:attachmentId', verifyToken, checkPatientRole, patientController.handleDeleteAttachment);

  // Review API (Design Doc v3.0, Mục 4.1.3) — Protected, R3 only
  app.post('/api/v1/reviews', verifyToken, checkPatientRole, reviewController.submitReview);

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase 12] AI Chatbot — SSE Stream
  // Protected: verifyToken + checkPatientRole (chỉ R3)
  // ═══════════════════════════════════════════════════════════════════════
  app.post('/api/v1/ai/chat',
    // 1. PRE-CHECK BẢO VỆ TUYẾN ĐẦU (Chặn trước khi global body-parser kịp đọc)
    (req, res, next) => {
      const contentLength = req.headers['content-length'];
      if (contentLength && parseInt(contentLength, 10) > 10240) {
        return res.status(413).json({ error: 'Payload quá lớn! Giới hạn tối đa là 10kb.' });
      }
      next();
    },
    // 2. MIDDLEWARE CỤC BỘ
    require('express').json({ limit: '10kb' }),
    verifyToken,
    checkPatientRole,
    // 3. XỬ LÝ CỐT LÕI
    require('../controllers/aiController').streamChat
  );

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase B] CATALOG ROUTES — MedicalCatalog / Medicine / SystemSettings
  // ═══════════════════════════════════════════════════════════════════════
  const catalogController = require('../controllers/catalogController');

  // Public reads (bác sĩ và bệnh nhân cần đọc để hiển thị danh mục + chính sách hoàn tiền)
  app.get('/api/v1/medical-catalogs',          catalogController.getAllMedicalCatalogs);
  app.get('/api/v1/medicines',                 catalogController.getAllMedicines);
  app.get('/api/v1/system-settings',           catalogController.getSystemSettings);

  // Admin CRUD — MedicalCatalog
  app.post('/api/v1/medical-catalogs',         verifyToken, checkAdminRole, catalogController.createMedicalCatalog);
  app.put('/api/v1/medical-catalogs/:id',      verifyToken, checkAdminRole, catalogController.editMedicalCatalog);
  app.delete('/api/v1/medical-catalogs/:id',   verifyToken, checkAdminRole, catalogController.deleteMedicalCatalog);

  // Admin CRUD — Medicine
  app.post('/api/v1/medicines',                verifyToken, checkAdminRole, catalogController.createMedicine);
  app.put('/api/v1/medicines/:id',             verifyToken, checkAdminRole, catalogController.editMedicine);
  app.delete('/api/v1/medicines/:id',          verifyToken, checkAdminRole, catalogController.deleteMedicine);

  // Admin — SystemSettings
  app.post('/api/v1/system-settings/bulk',     verifyToken, checkAdminRole, catalogController.updateBulkSystemSettings);
  app.post('/api/v1/system-settings/reset',    verifyToken, checkAdminRole, catalogController.resetSystemSettings);
  app.put('/api/v1/system-settings/:key',      verifyToken, checkAdminRole, catalogController.updateSystemSetting);

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase B] DOCTOR (Public) — GET /api/v1/doctors?clinicId=&specialtyId=
  // ⚠️ Phải đặt TRƯỚC /api/v1/doctors/:id để tránh conflict route
  // ═══════════════════════════════════════════════════════════════════════
  // Route này được thêm vào Public section trong web.js (đã register sau /doctors/top)
  app.get('/api/v1/doctors/list',              doctorController.getAllDoctors); // /doctors/list?clinicId=&specialtyId=

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase B] DOCTOR ROUTES mới — R2 only
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/doctor/profile',            verifyToken, checkDoctorRole, doctorController.getDoctorOwnProfile);
  app.put('/api/v1/doctor/profile',            verifyToken, checkDoctorRole, doctorController.updateDoctorOwnProfile);
  app.get('/api/v1/doctor/revenue',            verifyToken, checkDoctorRole, doctorController.getDoctorRevenue);
  app.put('/api/v1/bookings/:bookingId/medical-info', verifyToken, checkDoctorRole, doctorController.updateMedicalInfo);

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase B] STATISTICS mở rộng — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/statistics/monthly-revenue',       verifyToken, checkAdminRole, statisticController.getMonthlyRevenue);
  app.get('/api/v1/statistics/revenue-by-doctor',     verifyToken, checkAdminRole, statisticController.getRevenueByDoctor);
  app.get('/api/v1/statistics/revenue-by-clinic',     verifyToken, checkAdminRole, statisticController.getRevenueByClinic);
  app.get('/api/v1/statistics/revenue-by-specialty',  verifyToken, checkAdminRole, statisticController.getRevenueBySpecialty);

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase E] EXECUTIVE MASTER & DETAIL ANALYTICS — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/statistics/executive-master',      verifyToken, checkAdminRole, statisticController.getExecutiveMaster);
  app.get('/api/v1/statistics/analytics/bookings',   verifyToken, checkAdminRole, statisticController.getBookingAnalytics);
  app.get('/api/v1/statistics/analytics/revenue',    verifyToken, checkAdminRole, statisticController.getRevenueAnalytics);
  app.get('/api/v1/statistics/analytics/doctors',    verifyToken, checkAdminRole, statisticController.getDoctorCapacityAnalytics);
  app.get('/api/v1/statistics/analytics/patients',   verifyToken, checkAdminRole, statisticController.getPatientAnalytics);

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase F] PATIENT ENTERPRISE MANAGEMENT & REFUND FLOW — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/admin/patients',                  verifyToken, checkAdminRole, patientManageController.handleGetPatientsList);
  app.get('/api/v1/admin/patients/:id/workspace',    verifyToken, checkAdminRole, patientManageController.handleGetPatientWorkspace);
  app.post('/api/v1/admin/patients/refund',          verifyToken, checkAdminRole, patientManageController.handleProcessRefund);

  // ═══════════════════════════════════════════════════════════════════════
  // [Doctor Operations Center] DOCTOR ENTERPRISE OPERATIONS & SETTLEMENTS — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/admin/doctors',                   verifyToken, checkAdminRole, doctorManageController.handleGetAdminDoctorsList);
  app.get('/api/v1/admin/doctors/:id/workspace',     verifyToken, checkAdminRole, doctorManageController.handleGetAdminDoctorWorkspace);
  app.post('/api/v1/admin/doctors/:id/commission',   verifyToken, checkAdminRole, doctorManageController.handleUpdateDoctorCommission);
  app.post('/api/v1/admin/doctors/:id/status',       verifyToken, checkAdminRole, doctorManageController.handleUpdateDoctorWorkingStatus);
  app.post('/api/v1/admin/doctors/:id/payout',       verifyToken, checkAdminRole, doctorManageController.handleCreateDoctorPayout);
  app.post('/api/v1/admin/doctors/:id/schedules',    verifyToken, checkAdminRole, doctorManageController.handleUpdateDoctorScheduleSlots);

  // ═══════════════════════════════════════════════════════════════════════
  // [Clinic Operations] HEALTHCARE FACILITY CONTROL CENTER — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/admin/clinics-manage',                    verifyToken, checkAdminRole, clinicManageController.handleGetAdminClinicsList);
  app.get('/api/v1/admin/clinics-manage/:id/control-center', verifyToken, checkAdminRole, clinicManageController.handleGetAdminClinicControlCenter);
  app.post('/api/v1/admin/clinics-manage/:id/status',        verifyToken, checkAdminRole, clinicManageController.handleUpdateClinicWorkingStatus);
  app.post('/api/v1/admin/clinics-manage/:id/commission',    verifyToken, checkAdminRole, clinicManageController.handleUpdateClinicCommission);
  app.post('/api/v1/admin/clinics-manage/:id/assign-doctor', verifyToken, checkAdminRole, clinicManageController.handleAssignDoctorToClinic);

  // ═══════════════════════════════════════════════════════════════════════
  // [Specialty Operations] MEDICAL DISCIPLINES & INTELLIGENCE HUB — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/v1/admin/specialties-manage',                verifyToken, checkAdminRole, specialtyManageController.handleGetAdminSpecialtiesList);
  app.get('/api/v1/admin/specialties-manage/:id/workspace',  verifyToken, checkAdminRole, specialtyManageController.handleGetAdminSpecialtyWorkspace);
  app.post('/api/v1/admin/specialties-manage/:id/status',    verifyToken, checkAdminRole, specialtyManageController.handleUpdateSpecialtyWorkingStatus);

  // ═══════════════════════════════════════════════════════════════════════
  // [Enterprise Hierarchy] CONTEXTUAL MANAGEMENT: CLINIC -> SPECIALTY -> DOCTOR — Admin R1
  // ═══════════════════════════════════════════════════════════════════════
  const clinicHierarchyController = require('../controllers/clinicHierarchyController');
  app.get('/api/v1/admin/clinics/:clinicId/specialties',                         verifyToken, checkAdminRole, clinicHierarchyController.handleGetClinicSpecialties);
  app.post('/api/v1/admin/clinics/:clinicId/specialties/assign',                 verifyToken, checkAdminRole, clinicHierarchyController.handleAssignSpecialtyToClinic);
  app.post('/api/v1/admin/clinics/:clinicId/specialties/unassign',               verifyToken, checkAdminRole, clinicHierarchyController.handleUnassignSpecialtyFromClinic);
  app.get('/api/v1/admin/clinics/:clinicId/specialties/:specialtyId/workspace',   verifyToken, checkAdminRole, clinicHierarchyController.handleGetClinicSpecialtyWorkspace);
  app.post('/api/v1/admin/clinics/:clinicId/specialties/:specialtyId/assign-doctor', verifyToken, checkAdminRole, clinicHierarchyController.handleAssignDoctorToClinicSpecialty);
  app.put('/api/v1/admin/doctor-assignments/:assignmentId',                      verifyToken, checkAdminRole, clinicHierarchyController.handleUpdateDoctorAssignment);
  app.delete('/api/v1/admin/doctor-assignments/:assignmentId',                   verifyToken, checkAdminRole, clinicHierarchyController.handleUnassignDoctorFromClinicSpecialty);
  app.get('/api/v1/admin/doctors/:doctorId/assignments',                         verifyToken, checkAdminRole, clinicHierarchyController.handleGetDoctorAssignments);
};

module.exports = routes;




