const db = require('../src/models');
(async () => {
  try {
    const [constraints] = await db.sequelize.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = '"Booking_Attachments"'::regclass
    `);
    console.log('Constraints on Booking_Attachments:', constraints);

    const [bookingConstraints] = await db.sequelize.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = '"Bookings"'::regclass
    `);
    console.log('Constraints on Bookings:', bookingConstraints);
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    process.exit(0);
  }
})();
