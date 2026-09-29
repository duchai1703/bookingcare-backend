// bookingcare-backend/scripts/verify-multi-facility-phase1.js
// Verification of Phase 1: Multi-facility Associations & Query Integrity
'use strict';
require('dotenv').config();
const db = require('../src/models');

async function verify() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ XÁC MINH PHASE 1: SEQUELIZE ASSOCIATIONS & QUERIES');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    await db.sequelize.authenticate();

    // 1. Kiểm tra Schedule -> Clinic association
    console.log('⏳ Test 1: Kiểm tra Schedule.belongsTo(Clinic, as: clinicData)...');
    const schedule = await db.Schedule.findOne({
      where: { clinicId: { [db.Sequelize.Op.ne]: null } },
      include: [{ model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] }],
    });
    if (!schedule) throw new Error('Không tìm thấy Schedule nào có clinicId!');
    if (!schedule.clinicData) throw new Error('Association Schedule -> Clinic thất bại!');
    console.log(`   ✓ PASS Test 1: Schedule ID ${schedule.id} thuộc Cơ sở: "${schedule.clinicData.name}" (Clinic ID: ${schedule.clinicData.id})\n`);

    // 2. Kiểm tra Booking -> Clinic & Doctor_Assignment associations
    console.log('⏳ Test 2: Kiểm tra Booking.belongsTo(Clinic) & Booking.belongsTo(Doctor_Assignment)...');
    const booking = await db.Booking.findOne({
      where: {
        clinicId: { [db.Sequelize.Op.ne]: null },
        doctorAssignmentId: { [db.Sequelize.Op.ne]: null },
      },
      include: [
        { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
        { model: db.Doctor_Assignment, as: 'assignmentData', attributes: ['id', 'priceId', 'commissionRate', 'roomNumber'] },
      ],
    });
    if (!booking) throw new Error('Không tìm thấy Booking nào có đủ clinicId và doctorAssignmentId!');
    if (!booking.clinicData) throw new Error('Association Booking -> Clinic thất bại!');
    if (!booking.assignmentData) throw new Error('Association Booking -> Doctor_Assignment thất bại!');
    console.log(`   ✓ PASS Test 2: Booking ID ${booking.id} thuộc Cơ sở: "${booking.clinicData.name}", Assignment ID: ${booking.assignmentData.id}, Phòng khám: ${booking.assignmentData.roomNumber || 'P.Khám'}\n`);

    // 3. Kiểm tra Clinic -> Schedules (hasMany)
    console.log('⏳ Test 3: Kiểm tra Clinic.hasMany(Schedule, as: clinicSchedules)...');
    const clinicWithSchedules = await db.Clinic.findOne({
      include: [{ model: db.Schedule, as: 'clinicSchedules', limit: 3 }],
    });
    if (!clinicWithSchedules) throw new Error('Không tìm thấy Clinic nào có lịch khám!');
    console.log(`   ✓ PASS Test 3: Clinic "${clinicWithSchedules.name}" có liên kết clinicSchedules (mẫu: ${clinicWithSchedules.clinicSchedules.length} slots)\n`);

    // 4. Kiểm tra Doctor_Assignment -> Bookings (hasMany)
    console.log('⏳ Test 4: Kiểm tra Doctor_Assignment.hasMany(Booking, as: assignmentBookings)...');
    const assignmentWithBookings = await db.Doctor_Assignment.findOne({
      include: [{ model: db.Booking, as: 'assignmentBookings', limit: 3 }],
    });
    if (!assignmentWithBookings) throw new Error('Không tìm thấy Assignment nào có bookings!');
    console.log(`   ✓ PASS Test 4: Assignment ID ${assignmentWithBookings.id} có liên kết assignmentBookings (mẫu: ${assignmentWithBookings.assignmentBookings.length} bookings)\n`);

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🎉 100% CÁC KIỂM THỬ XÁC MINH PHASE 1 ĐỀU THÀNH CÔNG RỰC RỠ!');
    console.log('═══════════════════════════════════════════════════════════════════');
    process.exit(0);
  } catch (err) {
    console.error('❌ FAIL kiểm thử Phase 1:', err);
    process.exit(1);
  }
}

verify();
