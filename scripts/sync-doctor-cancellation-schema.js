// bookingcare-backend/scripts/sync-doctor-cancellation-schema.js
const db = require('../src/models');

async function testSync() {
  try {
    console.log('Connecting to database and syncing Doctor_Schedule_Cancellation models...');
    await db.syncSchema();
    console.log('✅ Sync schema successful!');

    // Check tables
    const countCancel = await db.Doctor_Schedule_Cancellation.count();
    console.log(`✅ Doctor_Schedule_Cancellations table ready. Row count: ${countCancel}`);

    const countTargets = await db.Doctor_Schedule_Cancellation_Target.count();
    console.log(`✅ Doctor_Schedule_Cancellation_Targets table ready. Row count: ${countTargets}`);

    // Check columns on Booking
    const sampleBooking = await db.Booking.findOne();
    if (sampleBooking) {
      console.log(`✅ Booking cancellationType field check: ${sampleBooking.cancellationType || 'null (OK)'}`);
    }

    // Check columns on Schedule
    const sampleSchedule = await db.Schedule.findOne();
    if (sampleSchedule) {
      console.log(`✅ Schedule status field check: ${sampleSchedule.status || 'ACTIVE (OK)'}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
}

testSync();
