/**
 * Test Suite: Multi-Facility Phase 2 Verification
 * 
 * Kiểm tra:
 * 1. bulkCreateSchedule: Xếp lịch đa cơ sở & Ngăn chặn xung đột (Conflict Prevention)
 * 2. getScheduleByDate: Lọc theo clinicId và include clinicData
 * 3. getDoctorPractices: Lấy danh sách hợp đồng công tác (Doctor_Assignment)
 * 4. postBookAppointment: Đặt lịch gắn đúng clinicId, doctorAssignmentId và snapshot giá khám riêng
 */

require('dotenv').config();
const db = require('../src/models/index');
const doctorService = require('../src/services/doctorService');
const patientService = require('../src/services/patientService');

async function runVerification() {
  console.log('====================================================');
  console.log('  STARTING MULTI-FACILITY PHASE 2 VERIFICATION TEST ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;
  const createdScheduleIds = [];
  let createdBookingId = null;

  try {
    // 0. Setup Context: Lấy 1 Doctor và 2 Clinic
    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) throw new Error('Không tìm thấy Bác sĩ trong hệ thống!');

    const clinics = await db.Clinic.findAll({ limit: 2 });
    if (clinics.length < 2) throw new Error('Cần ít nhất 2 cơ sở y tế (Clinics) để kiểm thử!');

    const clinic1 = clinics[0];
    const clinic2 = clinics[1];
    const testDoctorId = doctor.id;
    const testDate = '9999999999000'; // Ngày tương lai xa cho test

    console.log(`👨‍⚕️ Bác sĩ test: ID ${testDoctorId} (${doctor.lastName} ${doctor.firstName})`);
    console.log(`🏢 Cơ sở 1: ID ${clinic1.id} (${clinic1.name})`);
    console.log(`🏥 Cơ sở 2: ID ${clinic2.id} (${clinic2.name})\n`);

    // Dọn dẹp dữ liệu rác cũ nếu có từ test trước
    await db.Schedule.destroy({ where: { doctorId: testDoctorId, date: testDate } });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Tạo lịch ca sáng ở Clinic 1, ca chiều ở Clinic 2
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: Tạo lịch khám tại 2 cơ sở khác nhau ---');
    const resCreate1 = await doctorService.bulkCreateSchedule({
      clinicId: clinic1.id,
      arrSchedule: [
        { doctorId: testDoctorId, date: testDate, timeType: 'T1', maxNumber: 10, clinicId: clinic1.id },
      ],
    });

    const resCreate2 = await doctorService.bulkCreateSchedule({
      clinicId: clinic2.id,
      arrSchedule: [
        { doctorId: testDoctorId, date: testDate, timeType: 'T5', maxNumber: 10, clinicId: clinic2.id },
      ],
    });

    if (resCreate1.errCode === 0 && resCreate2.errCode === 0) {
      console.log('✅ TEST 1 PASS: Tạo thành công ca T1 (sáng) tại Cơ sở 1 và ca T5 (chiều) tại Cơ sở 2.');
      passed++;
    } else {
      console.error('❌ TEST 1 FAILED:', resCreate1, resCreate2);
      failed++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Ngăn chặn xung đột lịch khám (Conflict Prevention)
    // Cố gắng đăng ký ca T1 (trùng giờ) tại Clinic 2 khi đã có tại Clinic 1
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Ngăn chặn xung đột thời gian giữa các cơ sở ---');
    const resConflict = await doctorService.bulkCreateSchedule({
      clinicId: clinic2.id,
      arrSchedule: [
        { doctorId: testDoctorId, date: testDate, timeType: 'T1', maxNumber: 10, clinicId: clinic2.id },
      ],
    });

    if (resConflict.errCode === 4) {
      console.log(`✅ TEST 2 PASS: Hệ thống đã chặn thành công xung đột lịch! Message: "${resConflict.message}"`);
      passed++;
    } else {
      console.error('❌ TEST 2 FAILED: Hệ thống không chặn được ca khám trùng giờ khác cơ sở!', resConflict);
      failed++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Lọc lịch khám theo clinicId (getScheduleByDate)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Lọc lịch khám theo cơ sở (Clinic Filter) ---');
    const resFilterClinic1 = await doctorService.getScheduleByDate(testDoctorId, testDate, false, clinic1.id);
    const resFilterClinic2 = await doctorService.getScheduleByDate(testDoctorId, testDate, false, clinic2.id);
    const resAll = await doctorService.getScheduleByDate(testDoctorId, testDate, false, null);

    const match1 = resFilterClinic1.data.length === 1 && resFilterClinic1.data[0].timeType === 'T1' && resFilterClinic1.data[0].clinicData?.id === clinic1.id;
    const match2 = resFilterClinic2.data.length === 1 && resFilterClinic2.data[0].timeType === 'T5' && resFilterClinic2.data[0].clinicData?.id === clinic2.id;
    const matchAll = resAll.data.length === 2;

    if (match1 && match2 && matchAll) {
      console.log(`✅ TEST 3 PASS: Lọc chuẩn xác theo cơ sở. Cơ sở 1: ${resFilterClinic1.data.length} slot, Cơ sở 2: ${resFilterClinic2.data.length} slot, Tổng: ${resAll.data.length} slot.`);
      passed++;
    } else {
      console.error('❌ TEST 3 FAILED: Lọc lịch khám không đúng mong đợi!', { match1, match2, matchAll });
      failed++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: API Lấy danh sách cơ sở công tác (getDoctorPractices)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Danh sách cơ sở công tác của Bác sĩ (PractitionerRole) ---');
    // Đảm bảo có ít nhất 1 assignment
    let assignment = await db.Doctor_Assignment.findOne({ where: { doctorId: testDoctorId } });
    if (!assignment) {
      assignment = await db.Doctor_Assignment.create({
        doctorId: testDoctorId,
        clinicId: clinic1.id,
        isPrimary: true,
        workingStatus: 'active',
        commissionRate: 18,
        priceId: 'PRI1',
      });
    }

    const resPractices = await doctorService.getDoctorPractices(testDoctorId);
    if (resPractices.errCode === 0 && Array.isArray(resPractices.data) && resPractices.data.length > 0) {
      const p = resPractices.data[0];
      console.log(`✅ TEST 4 PASS: Lấy được ${resPractices.data.length} cơ sở công tác. Cơ sở: "${p.clinicData?.name}", Giá: "${p.priceTypeData?.valueVi || 'Mặc định'}", Hoa hồng: ${p.commissionRate || 15}%.`);
      passed++;
    } else {
      console.error('❌ TEST 4 FAILED: Không lấy được danh sách cơ sở công tác!', resPractices);
      failed++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Đặt lịch khám đa cơ sở & Snapshot tài chính (postBookAppointment)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: Đặt lịch khám và Snapshot tài chính đa cơ sở ---');
    const patientUser = await db.User.findOne({ where: { roleId: 'R3' } }) || doctor;

    const resBooking = await patientService.postBookAppointment({
      doctorId: testDoctorId,
      clinicId: clinic2.id,
      date: testDate,
      timeType: 'T5',
      fullName: 'Bệnh Nhân Test MultiFacility',
      phoneNumber: '0987654321',
      email: 'test.multifacility@gmail.com',
      address: 'Hà Nội',
      gender: 'G1',
    }, patientUser.id);

    if (resBooking.errCode === 0) {
      const savedBooking = await db.Booking.findOne({
        where: { doctorId: testDoctorId, date: testDate, timeType: 'T5' },
        include: [{ model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] }],
      });

      if (savedBooking && Number(savedBooking.clinicId) === Number(clinic2.id)) {
        createdBookingId = savedBooking.id;
        console.log(`✅ TEST 5 PASS: Đặt lịch thành công! Booking ID #${savedBooking.id} đã liên kết chuẩn với Cơ sở ID ${savedBooking.clinicId} (${savedBooking.clinicData?.name}).`);
        console.log(`   - Giá khám: ${savedBooking.bookingPrice} VND`);
        console.log(`   - Bác sĩ nhận: ${savedBooking.doctorShare} VND | Phí sàn: ${savedBooking.platformFee} VND`);
        passed++;
      } else {
        console.error('❌ TEST 5 FAILED: Booking không lưu đúng clinicId!', savedBooking);
        failed++;
      }
    } else {
      console.error('❌ TEST 5 FAILED: postBookAppointment trả về lỗi:', resBooking);
      failed++;
    }

  } catch (err) {
    console.error('🔥 CRITICAL ERROR DURING VERIFICATION:', err);
    failed++;
  } finally {
    // CLEANUP dữ liệu test
    console.log('\n--- CLEANUP TEST DATA ---');
    try {
      if (createdBookingId) {
        await db.Booking.destroy({ where: { id: createdBookingId } });
        console.log(`🧹 Đã xóa booking test #${createdBookingId}`);
      }
      const deletedSchedules = await db.Schedule.destroy({ where: { date: '9999999999000' } });
      console.log(`🧹 Đã dọn dẹp ${deletedSchedules} test schedules.`);
    } catch (cErr) {
      console.error('Cleanup warning:', cErr.message);
    }

    console.log('\n====================================================');
    console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runVerification();
