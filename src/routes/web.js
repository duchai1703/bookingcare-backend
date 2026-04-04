// SRS Section 5.2 – RESTful API Endpoints (with Auth Middleware) – Chuẩn REST + Versioning /api/v1/
const userController = require('../controllers/userController');
const doctorController = require('../controllers/doctorController');
const patientController = require('../controllers/patientController');
const specialtyController = require('../controllers/specialtyController');
const clinicController = require('../controllers/clinicController');
const { verifyToken, checkAdminRole, checkDoctorRole } = require('../middleware/authMiddleware');

const routes = (app) => {
  // ✅ [FIX-IMAGE] DS-01 v2: jsonLarge không cần nữa — global limit đã 8mb trong server.js

  // ===== HEALTH CHECK =====
  app.get('/api/health', (req, res) => res.json({ errCode: 0, message: 'BookingCare Backend is running!' }));

  // ===== PUBLIC ROUTES (không cần đăng nhập) =====

  // Authentication (SRS 3.1)
  app.post('/api/v1/auth/login', userController.handleLogin);

  // Doctors – Public (SRS 3.7, 3.8, 3.9)
  app.get('/api/v1/doctors/top', doctorController.getTopDoctorHome);
  app.get('/api/v1/doctors/:id', doctorController.getDetailDoctorById);
  app.get('/api/v1/doctors/:doctorId/schedules', doctorController.getScheduleByDate);

  // Bookings – Public (SRS 3.10)
  app.post('/api/v1/bookings', patientController.postBookAppointment);
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

  // Schedule Management (SRS 3.6)
  app.post('/api/v1/schedules/bulk', verifyToken, checkAdminRole, doctorController.bulkCreateSchedule);
  app.put('/api/v1/schedules/:id', verifyToken, checkAdminRole, doctorController.editSchedule);            // FIX FE-02: REQ-AM-021
  app.delete('/api/v1/schedules/:id', verifyToken, checkAdminRole, doctorController.deleteSchedule);

  // Specialty Management (SRS 3.5)
  app.post('/api/v1/specialties', verifyToken, checkAdminRole, specialtyController.createSpecialty);
  app.put('/api/v1/specialties/:id', verifyToken, checkAdminRole, specialtyController.editSpecialty);
  app.delete('/api/v1/specialties/:id', verifyToken, checkAdminRole, specialtyController.deleteSpecialty);

  // Clinic Management (SRS 3.4)
  app.post('/api/v1/clinics', verifyToken, checkAdminRole, clinicController.createClinic);
  app.put('/api/v1/clinics/:id', verifyToken, checkAdminRole, clinicController.editClinic);
  app.delete('/api/v1/clinics/:id', verifyToken, checkAdminRole, clinicController.deleteClinic);

  // ===== DOCTOR ROUTES – Yêu cầu role R2 (SRS 3.11, 3.12, 3.13) =====

  app.get('/api/v1/doctors/:doctorId/patients', verifyToken, checkDoctorRole, doctorController.getListPatientForDoctor);
  app.post('/api/v1/bookings/:bookingId/remedy', verifyToken, checkDoctorRole, doctorController.sendRemedy);
  app.patch('/api/v1/bookings/:bookingId/cancel', verifyToken, checkDoctorRole, doctorController.cancelBooking);        // REQ-DR-004
  app.get('/api/v1/patients/:patientId/bookings', verifyToken, checkDoctorRole, doctorController.getPatientBookingHistory); // REQ-DR-007
};

module.exports = routes;
