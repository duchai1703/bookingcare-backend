// bookingcare-backend/scripts/migrate-user-is-active.js
'use strict';
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    console.log('>>> DB Authenticated.');

    // 1. Thêm cột isActive nếu chưa có
    await db.sequelize.query(`
      ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
    `);
    console.log('>>> Added column "isActive" to "Users" table.');

    // 2. Backfill dữ liệu cũ
    const [result] = await db.sequelize.query(`
      UPDATE "Users" SET "isActive" = true WHERE "isActive" IS NULL;
    `);
    console.log('>>> Backfilled existing users with isActive = true.');

    // 3. Kiểm tra số lượng users
    const [users] = await db.sequelize.query(`
      SELECT COUNT(*) as total, 
             COUNT(CASE WHEN "isActive" = true THEN 1 END) as active,
             COUNT(CASE WHEN "isActive" = false THEN 1 END) as inactive
      FROM "Users";
    `);
    console.log('>>> Stats:', users[0]);
    process.exit(0);
  } catch (err) {
    console.error('>>> Migration error:', err);
    process.exit(1);
  }
}

migrate();
