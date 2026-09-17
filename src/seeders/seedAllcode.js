// src/seeders/seedAllcode.js — SUPER SEEDER v3.0
// Sinh Big Data tự động bằng vòng lặp & logic random
// Chạy: npm run seed (hoặc: node src/seeders/seedAllcode.js)

require('dotenv').config();
const db = require('../models');
const bcrypt = require('bcryptjs');
const {
  pick, randInt, shuffle, uuidv4,
  specialtyNames, clinicPool, reviewComments, bookingReasons,
  cancellationReasons, clinicalDiagnoses, bankList, PRICE_MAP,
  generateSpecialtyMarkdown, generateClinicMarkdown,
  generateRandomUser, generateDoctorInfo,
  generateSpecialtyImageBase64, generateClinicImageBase64,
} = require('./seedHelpers');

// ══════════════════════════════════════════════════════════════
// CONFIG — Điều chỉnh số lượng record tại đây
// ══════════════════════════════════════════════════════════════
const CONFIG = {
  DOCTOR_COUNT: 50,
  PATIENT_COUNT: 120,
  BOOKING_COUNT: 450,
  SCHEDULE_PAST_DAYS: 90,
  SCHEDULE_FUTURE_DAYS: 14,
  REVIEW_CHANCE_FOR_S3: 0.75, // 75% booking S3 sẽ có review
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
    const specialtyDataArray = specialtyNames.map((name, idx) => {
      const { md, html } = generateSpecialtyMarkdown(name);
      const img = generateSpecialtyImageBase64(idx);
      return { name, descriptionMarkdown: md, descriptionHTML: html, image: img };
    });
    const specialties = await db.Specialty.bulkCreate(specialtyDataArray);
    console.log(`✅ Specialties: ${specialties.length} records`);

    // ═══════════ 6. CLINICS (10 — bulkCreate) ═══════════
    const clinicDataArray = clinicPool.map((c, idx) => {
      const { md, html } = generateClinicMarkdown(c);
      const img = generateClinicImageBase64(idx);
      return { name: c.name, address: c.address, descriptionMarkdown: md, descriptionHTML: html, image: img };
    });
    const clinics = await db.Clinic.bulkCreate(clinicDataArray);
    console.log(`✅ Clinics: ${clinics.length} records`);

    // ═══════════ 7. DOCTOR_INFO (50 — bulkCreate) ═══════════
    const doctorInfoArray = doctorUsers.map((doc, idx) =>
      generateDoctorInfo(doc.id, idx, specialties.length, clinics.length)
    );
    await db.Doctor_Info.bulkCreate(doctorInfoArray);
    console.log(`✅ Doctor_Info: ${doctorInfoArray.length} records`);

    // Doctor Price Map for accurate bookingPrice
    const doctorPriceMap = {};
    for (const info of doctorInfoArray) {
      doctorPriceMap[info.doctorId] = PRICE_MAP[info.priceId] || 300000;
    }

    // ═══════════ 8. SCHEDULES (Past 90 days to Future 14 days) ═══════════
    const timeSlots = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
    const today = new Date();
    const scheduleArray = [];
    const scheduleLookup = new Map();

    for (const doctor of doctorUsers) {
      for (let dayOffset = -CONFIG.SCHEDULE_PAST_DAYS; dayOffset <= CONFIG.SCHEDULE_FUTURE_DAYS; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);
        // Chủ nhật: 2/3 bác sĩ nghỉ
        if (date.getDay() === 0 && doctor.id % 3 !== 0) continue;

        const utcStartOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        const dateStr = utcStartOfDay.toString();

        const numSlots = randInt(4, 6);
        const selectedSlots = shuffle(timeSlots).slice(0, numSlots);

        for (const slot of selectedSlots) {
          const item = {
            doctorId: doctor.id,
            date: dateStr,
            timeType: slot,
            maxNumber: 10,
            currentNumber: 0,
          };
          scheduleArray.push(item);
          scheduleLookup.set(`${doctor.id}_${dateStr}_${slot}`, item);
        }
      }
    }

    // ═══════════ 9. BOOKINGS (450 records across 90 days) ═══════════
    const frequentPatientUsers = patientUsers.slice(0, 20);
    const regularPatientUsers = patientUsers.slice(20);

    const bookingArray = [];
    const pendingReviews = []; // { bookingIdx, doctorId, patientId }
    const genders = ['G1', 'G2'];

    // Phân bổ ngày: 230 ca (30 ngày gần đây), 140 ca (-90 đến -31), 50 ca (+1 đến +10), 30 ca (hôm nay)
    const dateOffsets = [];
    for (let i = 0; i < 230; i++) dateOffsets.push(randInt(-30, -1));
    for (let i = 0; i < 140; i++) dateOffsets.push(randInt(-90, -31));
    for (let i = 0; i < 50; i++) dateOffsets.push(randInt(1, 10));
    for (let i = 0; i < 30; i++) dateOffsets.push(0);

    const shuffledOffsets = shuffle(dateOffsets);

    for (let i = 0; i < CONFIG.BOOKING_COUNT; i++) {
      const doctor = pick(doctorUsers);
      const patient = Math.random() < 0.4 ? pick(frequentPatientUsers) : pick(regularPatientUsers);
      const dayOffset = shuffledOffsets[i % shuffledOffsets.length];

      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const utcStartOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      const dateStr = utcStartOfDay.toString();
      const timeType = pick(timeSlots);

      let statusId = 'S3';
      if (dayOffset > 0) {
        const futureRand = Math.random();
        if (futureRand < 0.45) statusId = 'S2';
        else if (futureRand < 0.75) statusId = 'S1';
        else if (futureRand < 0.85) statusId = 'S1.5';
        else statusId = 'S4';
      } else if (dayOffset === 0) {
        const todayRand = Math.random();
        if (todayRand < 0.40) statusId = 'S2';
        else if (todayRand < 0.75) statusId = 'S3';
        else if (todayRand < 0.90) statusId = 'S1';
        else statusId = 'S4';
      } else {
        const pastRand = Math.random();
        if (pastRand < 0.72) statusId = 'S3';
        else if (pastRand < 0.90) statusId = 'S4';
        else statusId = 'S2';
      }

      const bookingPrice = doctorPriceMap[doctor.id] || 300000;
      let paymentStatus = 'unpaid';
      let refundRate = null;
      let refundAmount = null;
      let refundStatus = 'none';
      let cancelledAt = null;
      let cancellationReason = null;
      let bankAccountNumber = null;
      let bankAccountName = null;
      let bankName = null;
      let symptoms = null;
      let clinicalNotes = null;
      let diagnosis = null;
      let careInstructions = null;

      if (statusId === 'S3') {
        paymentStatus = 'paid';
        const diag = pick(clinicalDiagnoses);
        symptoms = diag.symptoms;
        clinicalNotes = diag.clinicalNotes;
        diagnosis = diag.diagnosis;
        careInstructions = diag.careInstructions;
      } else if (statusId === 'S4') {
        cancellationReason = pick(cancellationReasons);
        refundRate = pick([100, 75, 50]);
        refundAmount = Math.round((bookingPrice * refundRate) / 100);
        refundStatus = Math.random() < 0.65 ? 'done' : 'pending';
        paymentStatus = refundStatus === 'done' ? 'refunded' : 'refund_pending';
        const dateMs = parseInt(dateStr, 10);
        cancelledAt = new Date(dateMs - randInt(2, 48) * 3600000);
        const b = pick(bankList);
        bankName = b.bankName;
        bankAccountNumber = `${randInt(1000, 9999)}${randInt(100000, 999999)}`;
        bankAccountName = `${patient.firstName} ${patient.lastName}`.toUpperCase();
      } else if (statusId === 'S2') {
        paymentStatus = Math.random() < 0.8 ? 'paid' : 'unpaid';
      }

      // Đồng bộ currentNumber với Schedule
      const schedKey = `${doctor.id}_${dateStr}_${timeType}`;
      let sched = scheduleLookup.get(schedKey);
      if (!sched) {
        sched = {
          doctorId: doctor.id,
          date: dateStr,
          timeType: timeType,
          maxNumber: 10,
          currentNumber: 0,
        };
        scheduleArray.push(sched);
        scheduleLookup.set(schedKey, sched);
      }
      if (statusId === 'S2' || statusId === 'S3') {
        if (sched.currentNumber < sched.maxNumber) {
          sched.currentNumber += 1;
        }
      }

      bookingArray.push({
        statusId,
        doctorId: doctor.id,
        patientId: patient.id,
        date: dateStr,
        timeType,
        token: uuidv4(),
        bookingPrice,
        paymentStatus,
        refundRate,
        refundAmount,
        refundStatus,
        cancelledAt,
        bankAccountNumber,
        bankAccountName,
        bankName,
        symptoms,
        clinicalNotes,
        diagnosis,
        careInstructions,
        reason: cancellationReason ? cancellationReason : pick(bookingReasons),
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientPhoneNumber: patient.phoneNumber,
        patientAddress: patient.address || 'TP. Hồ Chí Minh',
        patientGender: pick(genders),
        patientBirthday: `${randInt(1960, 2005)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
      });

      if (statusId === 'S3' && Math.random() < CONFIG.REVIEW_CHANCE_FOR_S3) {
        pendingReviews.push({ bookingIdx: i, doctorId: doctor.id, patientId: patient.id });
      }
    }

    await db.Schedule.bulkCreate(scheduleArray);
    console.log(`✅ Schedules: ${scheduleArray.length} records (Past 90d to Future 14d)`);

    const createdBookings = await db.Booking.bulkCreate(bookingArray);
    console.log(`✅ Bookings: ${createdBookings.length} records (with real prices, refunds & medical info)`);

    // ═══════════ 10. PATIENT BANK ACCOUNTS ═══════════
    const bankAccountArray = [];
    const usedPatientBankIds = new Set();
    for (const b of bookingArray) {
      if (b.bankAccountNumber && !usedPatientBankIds.has(b.patientId)) {
        usedPatientBankIds.add(b.patientId);
        bankAccountArray.push({
          patientId: b.patientId,
          bankName: b.bankName,
          accountNumber: b.bankAccountNumber,
          accountHolderName: b.bankAccountName,
          isPrimary: true,
        });
      }
    }
    for (const p of frequentPatientUsers) {
      if (!usedPatientBankIds.has(p.id)) {
        usedPatientBankIds.add(p.id);
        const b = pick(bankList);
        bankAccountArray.push({
          patientId: p.id,
          bankName: b.bankName,
          accountNumber: `${randInt(1000, 9999)}${randInt(100000, 999999)}`,
          accountHolderName: `${p.firstName} ${p.lastName}`.toUpperCase(),
          isPrimary: true,
        });
      }
    }
    if (bankAccountArray.length > 0) {
      await db.PatientBankAccount.bulkCreate(bankAccountArray);
      console.log(`✅ Patient_Bank_Accounts: ${bankAccountArray.length} records`);
    }

    // ═══════════ 11. REVIEWS (auto-generated from S3 bookings) ═══════════

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

    // ═══════════ 12. DOCTOR SETTLEMENTS & COMMISSION LOGS (v5.0 - Operations Center) ═══════════
    const settlementArray = [];
    const commissionLogArray = [];

    for (let i = 0; i < Math.min(25, doctorUsers.length); i++) {
      const doc = doctorUsers[i];
      // Kỳ trước: 1 đợt thanh toán đã hoàn tất
      settlementArray.push({
        doctorId: doc.id,
        periodFrom: new Date(Date.now() - 45 * 86400000),
        periodTo: new Date(Date.now() - 15 * 86400000),
        grossRevenue: 15000000,
        commissionRate: 15.0,
        platformFee: 2250000,
        netPayout: 12750000,
        payoutStatus: 'paid',
        paymentMethod: 'bank_transfer',
        transactionRef: `PAY-VCB-${1000 + i}`,
        note: `Quyết toán chi trả doanh thu đợt tháng trước cho bác sĩ #${doc.id}`,
        paidAt: new Date(Date.now() - 14 * 86400000),
      });

      if (i % 2 === 0) {
        commissionLogArray.push({
          doctorId: doc.id,
          oldRate: 15.0,
          newRate: [10, 12, 18, 20][i % 4],
          reason: 'Chính sách ưu đãi doanh số cao & đàm phán hợp đồng mới',
          updatedByAdminId: 1,
        });
      }
    }

    if (settlementArray.length > 0) {
      await db.Doctor_Settlement.bulkCreate(settlementArray);
      console.log(`✅ Doctor Settlements: ${settlementArray.length} payout records`);
    }

    if (commissionLogArray.length > 0) {
      await db.Doctor_Commission_Log.bulkCreate(commissionLogArray);
      console.log(`✅ Doctor Commission Logs: ${commissionLogArray.length} audit records`);
    }

    // ═══════════ SUMMARY ═══════════
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const totalRecords = allcodeData.length + 1 + doctorUsers.length + patientUsers.length
      + specialties.length + clinics.length + doctorInfoArray.length
      + scheduleArray.length + createdBookings.length + reviewArray.length + bankAccountArray.length;

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   🚀 SUPER SEEDER v4.5 (Analytics) — COMPLETE    ║');
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
    console.log(`║  Bank Accounts : ${String(bankAccountArray.length).padStart(6)} records              ║`);
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
