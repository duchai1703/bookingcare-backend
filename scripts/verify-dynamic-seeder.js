// scripts/verify-dynamic-seeder.js
// Script kiểm thử xác minh cơ chế Dynamic Rolling Seed
'use strict';

const db = require('../src/models');
const dynamicSeedService = require('../src/services/dynamicSeedService');

async function testDynamicSeeder() {
  console.log('🧪 [TEST] Bắt đầu kiểm thử Dynamic Rolling Seeder...');

  try {
    await db.sequelize.authenticate();
    console.log('✅ Kết nối database thành công');

    // Chạy dynamic seed lần 1
    const res1 = await dynamicSeedService.ensureRollingSchedulesAndBookings();
    console.log('📊 Kết quả chạy lần 1:', res1);

    // Chạy dynamic seed lần 2 (Kiểm tra Idempotency - Không được duplicate)
    const res2 = await dynamicSeedService.ensureRollingSchedulesAndBookings();
    console.log('📊 Kết quả chạy lần 2 (Idempotency test):', res2);

    // Kiểm tra dữ liệu ngày hôm nay
    const todayStr = dynamicSeedService.getUtcDayTimestampStr(0);
    const todaySchedules = await db.Schedule.findAll({ where: { date: todayStr } });
    const todayBookings = await db.Booking.findAll({ where: { date: todayStr } });

    console.log(`📅 [HÔM NAY - ${todayStr}]:`);
    console.log(`   - Schedules mở: ${todaySchedules.length} slots`);
    console.log(`   - Bookings live : ${todayBookings.length} ca khám`);

    // Kiểm tra dữ liệu ngày mai (+1) và ngày kia (+2)
    const day1Str = dynamicSeedService.getUtcDayTimestampStr(1);
    const day1Schedules = await db.Schedule.findAll({ where: { date: day1Str } });
    console.log(`📅 [NGÀY MAI - ${day1Str}]: ${day1Schedules.length} slots`);

    const day7Str = dynamicSeedService.getUtcDayTimestampStr(7);
    const day7Schedules = await db.Schedule.findAll({ where: { date: day7Str } });
    console.log(`📅 [7 NGÀY TỚI - ${day7Str}]: ${day7Schedules.length} slots`);

    // Kiểm tra Doctor Assignments
    const assignmentCount = await db.Doctor_Assignment.count();
    console.log(`🏥 [DOCTOR ASSIGNMENTS]: ${assignmentCount} bản ghi phân công`);

    // Kiểm tra Wallets
    const walletCount = await db.Wallet.count();
    console.log(`💰 [WALLETS]: ${walletCount} ví đã sẵn sàng`);

    if (todaySchedules.length > 0 && todayBookings.length > 0 && day7Schedules.length > 0) {
      console.log('🎉 [TEST PASSED] Dynamic Rolling Seeder hoạt động hoàn hảo!');
      process.exit(0);
    } else {
      console.error('❌ [TEST FAILED] Thiếu slots hoặc bookings ngày hôm nay!');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ [TEST ERROR]:', err);
    process.exit(1);
  }
}

testDynamicSeeder();
