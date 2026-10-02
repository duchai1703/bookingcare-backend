require('dotenv').config();
const db = require('../src/models');

async function syncDb() {
  console.log('🔄 Checking and syncing family_members and bookings table...');
  try {
    await db.sequelize.authenticate();
    console.log('✅ Database connected.');

    // 1. Sync family_members table
    await db.Family_Member.sync({ alter: true });
    console.log('✅ Table family_members synced.');

    // 2. Sync bookings columns (bookingFor, familyMemberId, relationship)
    await db.Booking.sync({ alter: true });
    console.log('✅ Table bookings synced.');

    console.log('🎉 Schema sync for Family Booking completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema sync failed:', error);
    process.exit(1);
  }
}

syncDb();
