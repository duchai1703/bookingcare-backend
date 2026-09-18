// scripts/verify-doctor-schedule-workspace.js
// Kiểm thử các tính năng mới của Doctor Schedule Workspace: enriched slot bookings, copy schedule, recurring schedule, close slot, và delete protection
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models');
const doctorService = require('../src/services/doctorService');
const moment = require('moment');

async function testDoctorScheduleWorkspace() {
  console.log('--- BẮT ĐẦU TEST DOCTOR SCHEDULE WORKSPACE BACKEND ---');
  try {
    // 1. Lấy 1 bác sĩ mẫu
    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) {
      console.log('Không tìm thấy bác sĩ trong DB!');
      process.exit(0);
    }
    const doctorId = doctor.id;
    console.log(`Bác sĩ thử nghiệm: ID=${doctorId}, Tên=${doctor.lastName} ${doctor.firstName}`);

    const todayDate = moment.utc().startOf('day').valueOf();

    // TEST 1: Tạo ít nhất 1 schedule mẫu nếu chưa có
    const checkSchedule = await db.Schedule.findOne({ where: { doctorId, date: String(todayDate) } });
    if (!checkSchedule) {
      await db.Schedule.create({
        doctorId,
        date: String(todayDate),
        timeType: 'T1',
        maxNumber: 10,
        currentNumber: 0,
      });
    }

    // TEST 2: getScheduleByDate với includeAll=true phải có slotBookings
    const resSchedule = await doctorService.getScheduleByDate(doctorId, todayDate, true);
    console.log('Test 1 (getScheduleByDate enriched):', resSchedule.errCode === 0 && Array.isArray(resSchedule.data) ? 'PASS ✅' : 'FAIL ❌');
    if (resSchedule.errCode !== 0 || !Array.isArray(resSchedule.data)) throw new Error('Test 1 failed');
    const hasSlotBookingsField = resSchedule.data.every((s) => Array.isArray(s.slotBookings));
    console.log('Test 1.1 (slotBookings array exists on all slots):', hasSlotBookingsField ? 'PASS ✅' : 'FAIL ❌');
    if (!hasSlotBookingsField) throw new Error('Test 1.1 failed');

    // TEST 3: Sao chép lịch sang ngày mai
    const tomorrowDate = moment.utc().add(1, 'days').startOf('day').valueOf();
    const resCopy = await doctorService.copyDoctorSchedule(doctorId, todayDate, [tomorrowDate]);
    console.log('Test 2 (copyDoctorSchedule):', resCopy.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${resCopy.message})`);
    if (resCopy.errCode !== 0) throw new Error('Test 2 failed');

    // TEST 4: Tạo lịch lặp định kỳ theo tuần (Thứ 2, Thứ 4)
    const startDate = moment.utc().add(2, 'days').format('YYYY-MM-DD');
    const endDate = moment.utc().add(8, 'days').format('YYYY-MM-DD');
    const resRecur = await doctorService.createRecurringSchedule(doctorId, {
      daysOfWeek: [1, 3], // Thứ 2, Thứ 4
      startDate,
      endDate,
      timeTypes: ['T2', 'T3'],
      maxNumber: 8,
    });
    console.log('Test 3 (createRecurringSchedule):', resRecur.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${resRecur.message})`);
    if (resRecur.errCode !== 0) throw new Error('Test 3 failed');

    // TEST 5: Đóng / Mở slot
    const aSchedule = await db.Schedule.findOne({ where: { doctorId } });
    if (aSchedule) {
      const resClose = await doctorService.toggleCloseScheduleSlot(aSchedule.id, doctorId, true);
      console.log('Test 4 (toggleCloseScheduleSlot - Close):', resClose.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${resClose.message})`);
      if (resClose.errCode !== 0) throw new Error('Test 4 failed');

      const resOpen = await doctorService.toggleCloseScheduleSlot(aSchedule.id, doctorId, false);
      console.log('Test 4.1 (toggleCloseScheduleSlot - Reopen):', resOpen.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${resOpen.message})`);
      if (resOpen.errCode !== 0) throw new Error('Test 4.1 failed');
    }

    // TEST 6: Chặn xóa slot khi currentNumber > 0
    // Tạo 1 schedule giả lập có currentNumber = 2
    const dummySlot = await db.Schedule.create({
      doctorId,
      date: '9999999999999',
      timeType: 'T8',
      maxNumber: 10,
      currentNumber: 2,
    });
    const resDel = await doctorService.deleteSchedule({ id: dummySlot.id });
    console.log('Test 5 (Chặn xóa slot có booking currentNumber > 0):', resDel.errCode === 2 ? 'PASS ✅ (Bị chặn an toàn)' : `FAIL ❌ (${resDel.errCode})`);
    // Cleanup dummySlot
    await dummySlot.destroy();
    if (resDel.errCode !== 2) throw new Error('Test 5 failed');

    console.log('--- TẤT CẢ 5/5 TESTS BACKEND CAPACITY ENGINE ĐÃ PASS HOÀN TOÀN! 🎉 ---');
    process.exit(0);
  } catch (err) {
    console.error('>>> LỖI TEST:', err.message);
    process.exit(1);
  }
}

testDoctorScheduleWorkspace();
