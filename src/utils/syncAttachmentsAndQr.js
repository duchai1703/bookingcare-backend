// src/utils/syncAttachmentsAndQr.js
require('dotenv').config();
const db = require('../models');
const crypto = require('crypto');

async function syncDb() {
  try {
    await db.sequelize.authenticate();
    console.log('>>> DB connected.');

    // 1. Thêm cột qrToken nếu chưa có
    await db.sequelize.query(`
      ALTER TABLE "Bookings" 
      ADD COLUMN IF NOT EXISTS "qrToken" VARCHAR(100);
    `);
    console.log('>>> "qrToken" column checked/added.');

    // 2. Tạo index cho qrToken nếu chưa có
    try {
      await db.sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_qrToken" 
        ON "Bookings" ("qrToken") 
        WHERE "qrToken" IS NOT NULL;
      `);
      console.log('>>> Index "idx_bookings_qrToken" created.');
    } catch (idxErr) {
      console.log('>>> Index note:', idxErr.message);
    }

    // 3. Đồng bộ bảng Booking_Attachments
    await db.BookingAttachment.sync({ alter: true });
    console.log('>>> Table "Booking_Attachments" synced.');

    // 4. Cấp qrToken cho các lịch hẹn cũ chưa có qrToken
    const bookingsWithoutQr = await db.Booking.findAll({
      where: { qrToken: null },
      attributes: ['id'],
    });
    console.log(`>>> Found ${bookingsWithoutQr.length} bookings without qrToken.`);
    for (const b of bookingsWithoutQr) {
      const token = `BKQ-${b.id}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      await b.update({ qrToken: token });
    }
    console.log('>>> Backfilled qrToken successfully.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Sync error:', err);
    process.exit(1);
  }
}

syncDb();
