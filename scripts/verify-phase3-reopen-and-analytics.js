// scripts/verify-phase3-reopen-and-analytics.js
// Independent Automated Test Suite for Phase 3:
// Reopen Schedule Slot, Doctor Reliability Score, and Master Operational Analytics
'use strict';

const moment = require('moment');
const db = require('../src/models');
const {
  executeCancellation,
  reopenSchedule,
  getDoctorReliabilityScore,
  getCancellationAnalytics,
} = require('../src/services/doctorCancellationService');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ PHASE 3: REOPEN SCHEDULE & DOCTOR ANALYTICS');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Bước 1: Khởi tạo/Lấy tài khoản Bác sĩ & Admin test
    // -------------------------------------------------------------
    console.log('👉 Bước 1: Khởi tạo/Lấy tài khoản Bác sĩ & Admin...');
    let doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) {
      doctor = await db.User.create({
        email: `doc_phase3_${Date.now()}@test.com`,
        password: 'password123',
        firstName: 'Doctor',
        lastName: 'Phase3',
        roleId: 'R2',
      });
    }

    let otherDoctor = await db.User.findOne({
      where: { roleId: 'R2', id: { [db.Sequelize.Op.ne]: doctor.id } },
    });
    if (!otherDoctor) {
      otherDoctor = await db.User.create({
        email: `otherdoc_phase3_${Date.now()}@test.com`,
        password: 'password123',
        firstName: 'Other',
        lastName: 'Doctor',
        roleId: 'R2',
      });
    }

    let admin = await db.User.findOne({ where: { roleId: 'R1' } });
    if (!admin) {
      admin = await db.User.create({
        email: `admin_phase3_${Date.now()}@test.com`,
        password: 'password123',
        firstName: 'Admin',
        lastName: 'Phase3',
        roleId: 'R1',
      });
    }

    assert(Boolean(doctor), `Tài khoản Bác sĩ #${doctor.id}`);
    assert(Boolean(admin), `Tài khoản Admin #${admin.id}`);

    // -------------------------------------------------------------
    // Bước 2: Tạo Slot tương lai và thực hiện Báo bận (Cancel Slot)
    // -------------------------------------------------------------
    console.log('\n👉 Bước 2: Tạo Slot tương lai và thực hiện Báo bận (Cancel Slot)...');
    const futureDate = moment().add(3, 'days').format('YYYY-MM-DD');
    const timeType = 'T3'; // 10:00 - 11:00

    await db.Schedule.destroy({
      where: { doctorId: doctor.id, date: futureDate, timeType: timeType },
    });

    let schedule = await db.Schedule.create({
      doctorId: doctor.id,
      date: futureDate,
      timeType: timeType,
      maxNumber: 10,
      currentNumber: 1,
      status: 'ACTIVE',
    });

    assert(schedule && schedule.id, `Tạo Schedule slot ID ${schedule.id} ngày ${futureDate} thành công`);

    const cancelRes = await executeCancellation({
      doctorId: doctor.id,
      scope: 'SLOT',
      date: futureDate,
      timeType: timeType,
      reason: 'Bác sĩ bận hội chẩn khẩn cấp',
      cancelledBy: doctor.id,
      cancelledByRole: 'DOCTOR',
    });

    assert(cancelRes.errCode === 0, 'Bác sĩ hủy slot thành công');

    await schedule.reload();
    assert(schedule.status === 'CLOSED_BY_DOCTOR', 'Slot đã được khóa cứng CLOSED_BY_DOCTOR');

    // -------------------------------------------------------------
    // Bước 3: Kiểm thử Động cơ Khôi phục / Mở lại Slot (reopenSchedule)
    // -------------------------------------------------------------
    console.log('\n👉 Bước 3: Kiểm thử Động cơ Khôi phục / Mở lại Slot (reopenSchedule)...');

    // Case 3.1: Thiếu scheduleId
    const failRes1 = await reopenSchedule({});
    assert(failRes1.errCode === 1, 'Chặn khi thiếu scheduleId (errCode 1)');

    // Case 3.2: Bác sĩ khác cố mở lại lịch của bác sĩ này -> 403
    const failRes2 = await reopenSchedule({
      scheduleId: schedule.id,
      doctorId: otherDoctor.id,
      userRole: 'R2',
      userId: otherDoctor.id,
    });
    assert(failRes2.errCode === 403, 'Bảo vệ IDOR: Bác sĩ khác bị từ chối 403');

    // Case 3.3: Bác sĩ chính chủ mở lại slot thành công
    const reopenRes = await reopenSchedule({
      scheduleId: schedule.id,
      doctorId: doctor.id,
      userRole: 'R2',
      userId: doctor.id,
      reason: 'Đã hoàn tất hội chẩn sớm hơn dự kiến',
    });

    assert(reopenRes.errCode === 0, 'Bác sĩ chính chủ mở lại slot thành công');
    assert(reopenRes.data?.status === 'ACTIVE', 'Schedule status đã chuyển về ACTIVE');
    assert(reopenRes.data?.currentNumber === 0, 'currentNumber được reset về 0 để đón bệnh nhân mới');

    // Kiểm tra DB audit target đã được cập nhật reopenedAt
    const target = await db.Doctor_Schedule_Cancellation_Target.findOne({
      where: { scheduleId: schedule.id, targetType: 'SCHEDULE' },
    });
    assert(target && Boolean(target.reopenedAt), 'Target Audit Trail đã ghi nhận reopenedAt');
    assert(target && target.reopenedBy === doctor.id, 'Target Audit Trail ghi nhận reopenedBy = doctor.id');

    // Case 3.4: Cố tình gọi mở lại lần nữa khi slot đã ACTIVE -> errCode 3
    const failRes3 = await reopenSchedule({
      scheduleId: schedule.id,
      doctorId: doctor.id,
      userRole: 'R2',
      userId: doctor.id,
    });
    assert(failRes3.errCode === 3, 'Từ chối mở lại khi slot đã ở trạng thái ACTIVE (errCode 3)');

    // -------------------------------------------------------------
    // Bước 4: Kiểm thử Điểm Tin Cậy Bác Sĩ (getDoctorReliabilityScore)
    // -------------------------------------------------------------
    console.log('\n👉 Bước 4: Kiểm thử Điểm Tin Cậy Bác Sĩ (getDoctorReliabilityScore)...');

    const reliabilityRes = await getDoctorReliabilityScore(doctor.id, { days: 30 });
    assert(reliabilityRes.errCode === 0, 'Lấy điểm tin cậy bác sĩ thành công');
    const rData = reliabilityRes.data;
    assert(rData && typeof rData.reliabilityScore === 'number', 'Có trường reliabilityScore dạng số');
    assert(rData && typeof rData.cancellationRate === 'number', 'Có trường cancellationRate dạng số');
    assert(rData && ['EXCELLENT', 'GOOD', 'WARNING', 'CRITICAL'].includes(rData.tier), `Tier hợp lệ: ${rData?.tier}`);
    assert(rData && ['NONE', 'LOW', 'MEDIUM', 'HIGH'].includes(rData.warningLevel), `WarningLevel hợp lệ: ${rData?.warningLevel}`);
    console.log(`    📊 Doctor Score: ${rData.reliabilityScore} / 100 (${rData.tierLabel}) | Warning: ${rData.warningLevel}`);

    // -------------------------------------------------------------
    // Bước 5: Kiểm thử Báo cáo Vận hành Toàn diện (getCancellationAnalytics)
    // -------------------------------------------------------------
    console.log('\n👉 Bước 5: Kiểm thử Báo cáo Vận hành Toàn diện (getCancellationAnalytics)...');

    const analyticsRes = await getCancellationAnalytics({});
    assert(analyticsRes.errCode === 0, 'Lấy Master Operational Analytics thành công');
    const aData = analyticsRes.data;
    assert(aData && aData.summary, 'Có trường summary tổng quan');
    assert(typeof aData.summary.totalEvents === 'number', 'summary.totalEvents là số');
    assert(typeof aData.summary.totalAffectedBookings === 'number', 'summary.totalAffectedBookings là số');
    assert(typeof aData.summary.totalReopenedSlots === 'number', 'summary.totalReopenedSlots là số');
    assert(typeof aData.summary.reopenRate === 'number', 'summary.reopenRate là số');
    assert(typeof aData.summary.rescheduleRetentionRate === 'number', 'summary.rescheduleRetentionRate là số');
    assert(typeof aData.summary.lateCancellationRate === 'number', 'summary.lateCancellationRate là số');

    assert(Array.isArray(aData.doctorWatchlist), 'doctorWatchlist là một mảng danh sách các bác sĩ');
    assert(Array.isArray(aData.dailyTrend), 'dailyTrend là một mảng xu hướng');
    assert(Boolean(aData.byScope), 'byScope phân tách rõ ràng theo BOOKING, SLOT, DAY, DATE_RANGE');

    console.log(`    📈 Tổng sự kiện hủy: ${aData.summary.totalEvents}`);
    console.log(`    📈 Tổng slot đã mở lại: ${aData.summary.totalReopenedSlots} (Tỷ lệ mở lại: ${aData.summary.reopenRate}%)`);
    console.log(`    📈 Tỷ lệ giữ chân đổi lịch: ${aData.summary.rescheduleRetentionRate}%`);
    console.log(`    📈 Tỷ lệ hủy sát giờ: ${aData.summary.lateCancellationRate}%`);
    console.log(`    📈 Số bác sĩ trong Watchlist: ${aData.doctorWatchlist.length}`);

    // Clean up test schedule
    await schedule.destroy();

    console.log('\n================================================================');
    console.log(`🎉 TẤT CẢ ${passedTests}/${totalTests} TESTS PHASE 3 ĐÃ PASS HOÀN TOÀN!`);
    console.log('================================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST THẤT BẠI:', error.message);
    process.exit(1);
  }
}

runTests();
