// bookingcare-backend/scripts/verify-smart-reschedule.js
// Kịch bản kiểm thử tích hợp độc lập: Smart Reschedule Engine & Doctor Cancellation Flow
'use strict';

const db = require('../src/models');
const { executeCancellation } = require('../src/services/doctorCancellationService');
const { getRescheduleOptions, rescheduleBooking } = require('../src/services/patientService');
const { getOrCreateWallet } = require('../src/services/walletService');

async function runVerification() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ: SMART 1-CLICK PATIENT RESCHEDULE ENGINE');
  console.log('══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Chuẩn bị dữ liệu mẫu: Bác sĩ, Bệnh nhân, và Ví
    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) throw new Error('Không tìm thấy bác sĩ test (roleId: R2)');

    const patient = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!patient) throw new Error('Không tìm thấy bệnh nhân test (roleId: R3)');

    const otherPatient = await db.User.findOne({
      where: { roleId: 'R3', id: { [db.Sequelize.Op.ne]: patient.id } },
    });

    console.log(`👨‍⚕️ Bác sĩ: #${doctor.id} (${doctor.lastName} ${doctor.firstName})`);
    console.log(`🧑 Bệnh nhân: #${patient.id} (${patient.lastName} ${patient.firstName})`);

    const testDate = '20261015'; // 15/10/2026
    const futureDate = '20261016'; // 16/10/2026
    const testSlot = 'T1'; // 08:00 - 09:00
    const newSlot = 'T2';  // 09:00 - 10:00

    // Đảm bảo có Schedule cho ngày test
    await db.Schedule.destroy({ where: { doctorId: doctor.id, date: [testDate, futureDate] } });

    const schedOld = await db.Schedule.create({
      doctorId: doctor.id,
      date: testDate,
      timeType: testSlot,
      maxNumber: 10,
      currentNumber: 1,
      status: 'ACTIVE',
    });

    const schedNew = await db.Schedule.create({
      doctorId: doctor.id,
      date: futureDate,
      timeType: newSlot,
      maxNumber: 10,
      currentNumber: 0,
      status: 'ACTIVE',
    });

    // Tạo ca khám mẫu đã trả tiền qua Ví
    const bookingPrice = 300000;
    const oldBooking = await db.Booking.create({
      statusId: 'S2',
      doctorId: doctor.id,
      patientId: patient.id,
      date: testDate,
      timeType: testSlot,
      token: 'test-token-reschedule-' + Date.now(),
      bookingPrice: bookingPrice,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      patientName: `${patient.lastName} ${patient.firstName}`,
      patientPhoneNumber: patient.phoneNumber || '0987654321',
      reason: 'Đau mỏi vai gáy định kỳ',
    });

    console.log(`📋 Đã tạo ca khám #${oldBooking.id} vào slot ${testSlot} ngày ${testDate}\n`);

    // 2. Bác sĩ báo bận và hủy slot này
    console.log('--- TEST BƯỚC 1: BÁC SĨ BÁO BẬN HỦY KHUNG GIỜ ---');
    const cancelResult = await executeCancellation({
      doctorId: doctor.id,
      scope: 'SLOT',
      date: testDate,
      timeType: testSlot,
      reason: 'Hội chẩn khẩn cấp tại Bệnh viện Bạch Mai',
      cancelledBy: doctor.id,
      cancelledByRole: 'DOCTOR',
    });

    assert(cancelResult.errCode === 0, 'Hủy slot thành công');
    assert(cancelResult.data.affectedBookingsCount >= 1, 'Ghi nhận số ca bị ảnh hưởng');

    const updatedOldBooking = await db.Booking.findByPk(oldBooking.id);
    assert(updatedOldBooking.statusId === 'S4', 'Booking chuyển trạng thái S4 (Cancelled)');
    assert(updatedOldBooking.cancellationType === 'DOCTOR', 'cancellationType là DOCTOR');
    assert(updatedOldBooking.refundAmount === bookingPrice, 'Số tiền hoàn là 100% (300.000 đ)');
    assert(updatedOldBooking.paymentStatus === 'refunded', 'paymentStatus là refunded');

    // 3. Test API getRescheduleOptions
    console.log('\n--- TEST BƯỚC 2: TRA CỨU TÙY CHỌN ĐỔI LỊCH THÔNG MINH (getRescheduleOptions) ---');

    // 3.1 IDOR Protection: Bệnh nhân khác không được xem
    if (otherPatient) {
      const idorRes = await getRescheduleOptions(oldBooking.id, otherPatient.id);
      assert(idorRes.errCode === 2, 'IDOR Guard: Bệnh nhân khác không có quyền truy cập ca khám này');
    }

    // 3.2 Bệnh nhân chính chủ tra cứu
    const optionsRes = await getRescheduleOptions(oldBooking.id, patient.id);
    assert(optionsRes.errCode === 0, 'Lấy tùy chọn đổi lịch thành công');
    assert(optionsRes.data.booking.id === oldBooking.id, 'Thông tin ca khám cũ chuẩn xác');
    assert(optionsRes.data.doctorSchedules.length > 0, 'Tìm thấy danh sách slot trống tiếp theo của bác sĩ');
    assert(optionsRes.data.patientWallet.availableBalance >= bookingPrice, 'Số dư ví bệnh nhân đủ để đổi lịch');

    // 4. Test API rescheduleBooking
    console.log('\n--- TEST BƯỚC 3: THỰC HIỆN ĐỔI LỊCH KHÁM THÔNG MINH (rescheduleBooking) ---');

    const rescheduleRes = await rescheduleBooking(oldBooking.id, patient.id, {
      newDoctorId: doctor.id,
      newDate: futureDate,
      newTimeType: newSlot,
      reason: 'Đổi lịch sang ngày 16/10 do bác sĩ bận',
    });

    assert(rescheduleRes.errCode === 0, 'Đổi lịch khám thành công 1-Click');
    assert(rescheduleRes.data.newBookingId !== oldBooking.id, 'Tạo mã ca khám mới thành công');

    // Kiểm tra liên kết giữa 2 ca khám
    const reloadedOld = await db.Booking.findByPk(oldBooking.id);
    const newBooking = await db.Booking.findByPk(rescheduleRes.data.newBookingId);

    assert(reloadedOld.rescheduledToBookingId === newBooking.id, 'Ca cũ được gắn rescheduledToBookingId trỏ sang ca mới');
    assert(reloadedOld.rescheduledAt !== null, 'Lưu vết thời điểm đổi lịch rescheduledAt');
    assert(newBooking.rescheduledFromBookingId === oldBooking.id, 'Ca mới được gắn rescheduledFromBookingId trỏ về ca cũ');
    assert(newBooking.statusId === 'S2', 'Ca mới được xác nhận ngay lập tức (S2)');
    assert(newBooking.paymentMethod === 'WALLET', 'Ca mới thanh toán qua WALLET');
    assert(newBooking.paymentStatus === 'paid', 'Ca mới trạng thái đã thanh toán');

    // 5. Test chống đổi lịch 2 lần (Anti-Double Reschedule)
    console.log('\n--- TEST BƯỚC 4: BẢO VỆ CHỐNG ĐỔI LỊCH LẦN 2 (Anti-Double Reschedule) ---');
    const doubleRes = await rescheduleBooking(oldBooking.id, patient.id, {
      newDate: futureDate,
      newTimeType: newSlot,
    });
    assert(doubleRes.errCode === 6, 'Chặn thành công hành vi cố tình đổi lịch 2 lần cho cùng 1 ca khám cũ');

    // Kiểm tra slot schedule mới đã tăng currentNumber
    const reloadedNewSched = await db.Schedule.findByPk(schedNew.id);
    assert(reloadedNewSched.currentNumber === 1, 'Khung giờ khám mới đã tăng currentNumber lên 1');

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log(`🎉 KẾT QUẢ: ${passed} PASS, ${failed} FAIL`);
    console.log('══════════════════════════════════════════════════════════════════');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình test:', err);
    process.exit(1);
  }
}

runVerification();
