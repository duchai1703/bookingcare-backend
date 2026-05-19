// src/seeders/seedAllcode.js — SUPER SEEDER v2.0
// Sinh Big Data tự động bằng vòng lặp & logic random
// Chạy: npm run seed (hoặc: node src/seeders/seedAllcode.js)

require('dotenv').config();
const db = require('../models');
const bcrypt = require('bcryptjs');
const {
  pick, randInt, shuffle, uuidv4,
  specialtyNames, clinicPool, reviewComments, bookingReasons,
  commonImageBase64,
  generateSpecialtyMarkdown, generateClinicMarkdown,
  generateRandomUser, generateDoctorInfo,
} = require('./seedHelpers');

// ══════════════════════════════════════════════════════════════
// CONFIG — Điều chỉnh số lượng record tại đây
// ══════════════════════════════════════════════════════════════
const CONFIG = {
  DOCTOR_COUNT: 50,
  PATIENT_COUNT: 100,
  BOOKING_COUNT: 200,
  SCHEDULE_DAYS: 7,
  REVIEW_CHANCE_FOR_S3: 0.7, // 70% booking S3 sẽ có review
};

// ══════════════════════════════════════════════════════════════
// ALLCODE DATA — Giữ nguyên từ file gốc của Kỹ sư trưởng
// ══════════════════════════════════════════════════════════════
const allcodeData = [
  // ROLE
  { type: 'ROLE', keyMap: 'R1', valueVi: 'Quản trị viên', valueEn: 'Admin' },
  { type: 'ROLE', keyMap: 'R2', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
  { type: 'ROLE', keyMap: 'R3', valueVi: 'Bệnh nhân', valueEn: 'Patient' },
  // GENDER
  { type: 'GENDER', keyMap: 'G1', valueVi: 'Nam', valueEn: 'Male' },
  { type: 'GENDER', keyMap: 'G2', valueVi: 'Nữ', valueEn: 'Female' },
  { type: 'GENDER', keyMap: 'G3', valueVi: 'Khác', valueEn: 'Other' },
  // TIME
  { type: 'TIME', keyMap: 'T1', valueVi: '8:00 - 9:00', valueEn: '8:00 AM - 9:00 AM' },
  { type: 'TIME', keyMap: 'T2', valueVi: '9:00 - 10:00', valueEn: '9:00 AM - 10:00 AM' },
  { type: 'TIME', keyMap: 'T3', valueVi: '10:00 - 11:00', valueEn: '10:00 AM - 11:00 AM' },
  { type: 'TIME', keyMap: 'T4', valueVi: '11:00 - 12:00', valueEn: '11:00 AM - 12:00 PM' },
  { type: 'TIME', keyMap: 'T5', valueVi: '13:00 - 14:00', valueEn: '1:00 PM - 2:00 PM' },
  { type: 'TIME', keyMap: 'T6', valueVi: '14:00 - 15:00', valueEn: '2:00 PM - 3:00 PM' },
  { type: 'TIME', keyMap: 'T7', valueVi: '15:00 - 16:00', valueEn: '3:00 PM - 4:00 PM' },
  { type: 'TIME', keyMap: 'T8', valueVi: '16:00 - 17:00', valueEn: '4:00 PM - 5:00 PM' },
  // STATUS — Giữ nguyên S1.5 (Chờ thanh toán) theo yêu cầu
  { type: 'STATUS', keyMap: 'S1', valueVi: 'Lịch hẹn mới', valueEn: 'New appointment' },
  { type: 'STATUS', keyMap: 'S1.5', valueVi: 'Chờ thanh toán', valueEn: 'Pending Payment' },
  { type: 'STATUS', keyMap: 'S2', valueVi: 'Đã xác nhận', valueEn: 'Confirmed' },
  { type: 'STATUS', keyMap: 'S3', valueVi: 'Đã khám xong', valueEn: 'Done' },
  { type: 'STATUS', keyMap: 'S4', valueVi: 'Đã hủy', valueEn: 'Cancelled' },
  // POSITION
  { type: 'POSITION', keyMap: 'P0', valueVi: 'Không chọn', valueEn: 'None' },
  { type: 'POSITION', keyMap: 'P1', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
  { type: 'POSITION', keyMap: 'P2', valueVi: 'Thạc sĩ', valueEn: 'Master' },
  { type: 'POSITION', keyMap: 'P3', valueVi: 'Tiến sĩ', valueEn: 'PhD' },
  { type: 'POSITION', keyMap: 'P4', valueVi: 'Phó giáo sư', valueEn: 'Associate Professor' },
  { type: 'POSITION', keyMap: 'P5', valueVi: 'Giáo sư', valueEn: 'Professor' },
  // PRICE — Giữ nguyên PRI1-PRI6
  { type: 'PRICE', keyMap: 'PRI1', valueVi: '100.000đ', valueEn: '100,000 VND' },
  { type: 'PRICE', keyMap: 'PRI2', valueVi: '200.000đ', valueEn: '200,000 VND' },
  { type: 'PRICE', keyMap: 'PRI3', valueVi: '300.000đ', valueEn: '300,000 VND' },
  { type: 'PRICE', keyMap: 'PRI4', valueVi: '500.000đ', valueEn: '500,000 VND' },
  { type: 'PRICE', keyMap: 'PRI5', valueVi: '1.000.000đ', valueEn: '1,000,000 VND' },
  { type: 'PRICE', keyMap: 'PRI6', valueVi: '2.000.000đ', valueEn: '2,000,000 VND' },
  // PAYMENT — Giữ nguyên PAY1-PAY3
  { type: 'PAYMENT', keyMap: 'PAY1', valueVi: 'Tiền mặt', valueEn: 'Cash' },
  { type: 'PAYMENT', keyMap: 'PAY2', valueVi: 'Chuyển khoản', valueEn: 'Bank transfer' },
  { type: 'PAYMENT', keyMap: 'PAY3', valueVi: 'Thẻ tín dụng', valueEn: 'Credit card' },
  // PROVINCE — Giữ nguyên PRO1-PRO6
  { type: 'PROVINCE', keyMap: 'PRO1', valueVi: 'Hà Nội', valueEn: 'Hanoi' },
  { type: 'PROVINCE', keyMap: 'PRO2', valueVi: 'TP. Hồ Chí Minh', valueEn: 'Ho Chi Minh City' },
  { type: 'PROVINCE', keyMap: 'PRO3', valueVi: 'Đà Nẵng', valueEn: 'Da Nang' },
  { type: 'PROVINCE', keyMap: 'PRO4', valueVi: 'Cần Thơ', valueEn: 'Can Tho' },
  { type: 'PROVINCE', keyMap: 'PRO5', valueVi: 'Hải Phòng', valueEn: 'Hai Phong' },
  { type: 'PROVINCE', keyMap: 'PRO6', valueVi: 'Huế', valueEn: 'Hue' },
];

// ══════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ══════════════════════════════════════════════════════════════
const seed = async () => {
  const t0 = Date.now();
  try {
    await db.sequelize.authenticate();
    console.log('>>> Database connected');

    // Drop & recreate all tables
    await db.sequelize.sync({ force: true });
    console.log('>>> All tables dropped & recreated');

    // ═══════════ 1. ALLCODE (bulkCreate) ═══════════
    await db.Allcode.bulkCreate(allcodeData);
    console.log(`✅ Allcode: ${allcodeData.length} records`);

    // ═══════════ 2. ADMIN ═══════════
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('123456', salt);
    await db.User.create({
      email: 'admin@bookingcare.vn', password: hashedPassword,
      firstName: 'Admin', lastName: 'BookingCare',
      roleId: 'R1', gender: 'G1', address: 'TP. Hồ Chí Minh',
      phoneNumber: '0123456789', positionId: null,
    });
    console.log('✅ Admin: admin@bookingcare.vn / 123456');

    // ═══════════ 3. DOCTORS (50 users — bulkCreate) ═══════════
    const usedEmails = new Set(['admin@bookingcare.vn']);
    const doctorDataArray = [];
    for (let i = 0; i < CONFIG.DOCTOR_COUNT; i++) {
      const u = generateRandomUser(i, 'R2', usedEmails);
      u.password = hashedPassword;
      doctorDataArray.push(u);
    }
    const doctorUsers = await db.User.bulkCreate(doctorDataArray);
    console.log(`✅ Doctors: ${doctorUsers.length} accounts`);

    // ═══════════ 4. PATIENTS (100 users — bulkCreate) ═══════════
    const patientDataArray = [];
    for (let i = 0; i < CONFIG.PATIENT_COUNT; i++) {
      const u = generateRandomUser(i, 'R3', usedEmails);
      u.password = hashedPassword;
      patientDataArray.push(u);
    }
    const patientUsers = await db.User.bulkCreate(patientDataArray);
    console.log(`✅ Patients: ${patientUsers.length} accounts`);

    // ═══════════ 5. SPECIALTIES (15 — bulkCreate) ═══════════
    const specialtyDataArray = specialtyNames.map(name => {
      const { md, html } = generateSpecialtyMarkdown(name);
      return { name, descriptionMarkdown: md, descriptionHTML: html, image: commonImageBase64 };
    });
    const specialties = await db.Specialty.bulkCreate(specialtyDataArray);
    console.log(`✅ Specialties: ${specialties.length} records`);

    // ═══════════ 6. CLINICS (10 — bulkCreate) ═══════════
    const clinicDataArray = clinicPool.map(c => {
      const { md, html } = generateClinicMarkdown(c);
      return { name: c.name, address: c.address, descriptionMarkdown: md, descriptionHTML: html, image: commonImageBase64 };
    });
    const clinics = await db.Clinic.bulkCreate(clinicDataArray);
    console.log(`✅ Clinics: ${clinics.length} records`);

    // ═══════════ 7. DOCTOR_INFO (50 — bulkCreate) ═══════════
    const doctorInfoArray = doctorUsers.map((doc, idx) =>
      generateDoctorInfo(doc.id, idx, specialties.length, clinics.length)
    );
    await db.Doctor_Info.bulkCreate(doctorInfoArray);
    console.log(`✅ Doctor_Info: ${doctorInfoArray.length} records`);

    // ═══════════ 8. SCHEDULES (50 doctors × 7 days × 4-6 slots — bulkCreate) ═══════════
    const timeSlots = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
    const today = new Date();
    const scheduleArray = [];

    for (const doctor of doctorUsers) {
      for (let dayOffset = 0; dayOffset < CONFIG.SCHEDULE_DAYS; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);
        // TUYỆT ĐỐI giữ nguyên logic Date.UTC — đồng bộ múi giờ với Frontend
        const utcStartOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        const dateStr = utcStartOfDay.toString();

        const numSlots = randInt(4, 6);
        const selectedSlots = shuffle(timeSlots).slice(0, numSlots);

        for (const slot of selectedSlots) {
          scheduleArray.push({
            doctorId: doctor.id,
            date: dateStr,
            timeType: slot,
            maxNumber: 10,
            currentNumber: randInt(0, 9),
          });
        }
      }
    }
    await db.Schedule.bulkCreate(scheduleArray);
    console.log(`✅ Schedules: ${scheduleArray.length} records (${CONFIG.SCHEDULE_DAYS} days × ${doctorUsers.length} doctors)`);

    // ═══════════ 9. BOOKINGS (200) + REVIEWS (auto 70% cho S3) ═══════════
    const statusPool = ['S1', 'S1.5', 'S2', 'S3', 'S4'];
    const genders = ['G1', 'G2'];
    const bookingArray = [];
    const pendingReviews = []; // { bookingIdx, doctorId, patientId }

    for (let i = 0; i < CONFIG.BOOKING_COUNT; i++) {
      const doctor = pick(doctorUsers);
      const patient = pick(patientUsers);
      const statusId = pick(statusPool);
      // Random ngày: từ -10 đến +7
      const dayOffset = randInt(-10, 7);
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const utcStartOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      const dateStr = utcStartOfDay.toString();

      bookingArray.push({
        statusId,
        doctorId: doctor.id,
        patientId: patient.id,
        date: dateStr,
        timeType: pick(timeSlots),
        token: uuidv4(),
        reason: pick(bookingReasons),
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientPhoneNumber: patient.phoneNumber,
        patientAddress: patient.address || 'Địa chỉ',
        patientGender: pick(genders),
        patientBirthday: `${randInt(1960, 2005)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
      });

      // 70% xác suất sinh Review nếu S3
      if (statusId === 'S3' && Math.random() < CONFIG.REVIEW_CHANCE_FOR_S3) {
        pendingReviews.push({ bookingIdx: i, doctorId: doctor.id, patientId: patient.id });
      }
    }

    const createdBookings = await db.Booking.bulkCreate(bookingArray);
    console.log(`✅ Bookings: ${createdBookings.length} records`);

    // Sinh Reviews cho các booking S3
    const reviewArray = [];
    const usedBookingIds = new Set();
    for (const r of pendingReviews) {
      const bookingId = createdBookings[r.bookingIdx].id;
      // Đảm bảo UNIQUE(bookingId)
      if (usedBookingIds.has(bookingId)) continue;
      usedBookingIds.add(bookingId);
      reviewArray.push({
        doctorId: r.doctorId,
        patientId: r.patientId,
        bookingId,
        rating: randInt(4, 5),
        comment: pick(reviewComments),
      });
    }
    if (reviewArray.length > 0) {
      await db.Review.bulkCreate(reviewArray);
    }
    console.log(`✅ Reviews: ${reviewArray.length} records (auto-generated from S3 bookings)`);

    // ═══════════ SUMMARY ═══════════
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const totalRecords = allcodeData.length + 1 + doctorUsers.length + patientUsers.length
      + specialties.length + clinics.length + doctorInfoArray.length
      + scheduleArray.length + createdBookings.length + reviewArray.length;

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║         🚀 SUPER SEEDER v2.0 — COMPLETE         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Allcode       : ${String(allcodeData.length).padStart(6)} records              ║`);
    console.log(`║  Admin         :      1 account               ║`);
    console.log(`║  Doctors (R2)  : ${String(doctorUsers.length).padStart(6)} accounts             ║`);
    console.log(`║  Patients (R3) : ${String(patientUsers.length).padStart(6)} accounts             ║`);
    console.log(`║  Specialties   : ${String(specialties.length).padStart(6)} records              ║`);
    console.log(`║  Clinics       : ${String(clinics.length).padStart(6)} records              ║`);
    console.log(`║  Doctor_Info   : ${String(doctorInfoArray.length).padStart(6)} records              ║`);
    console.log(`║  Schedules     : ${String(scheduleArray.length).padStart(6)} records              ║`);
    console.log(`║  Bookings      : ${String(createdBookings.length).padStart(6)} records              ║`);
    console.log(`║  Reviews       : ${String(reviewArray.length).padStart(6)} records              ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  📊 TỔNG CỘNG  : ${String(totalRecords).padStart(6)} records              ║`);
    console.log(`║  ⏱  Thời gian  : ${String(elapsed).padStart(6)}s                    ║`);
    console.log(`║  🔑 Password   : 123456 (tất cả accounts)     ║`);
    console.log('╚══════════════════════════════════════════════════╝');

    process.exit(0);
  } catch (err) {
    console.error('❌ SEED ERROR:', err);
    process.exit(1);
  }
};

seed();
