const db = require('../src/models');

async function cleanupQrAndVerify() {
  try {
    // 1. Dọn constraint trùng qrToken nếu có
    const [qrRows] = await db.sequelize.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = '"Bookings"'::regclass 
        AND conname LIKE 'Bookings_qrToken_key%'
      ORDER BY conname;
    `);
    console.log(`Found ${qrRows.length} duplicate qrToken constraints on Bookings.`);
    for (const r of qrRows) {
      try {
        await db.sequelize.query(`ALTER TABLE "Bookings" DROP CONSTRAINT IF EXISTS "${r.conname}";`);
        console.log(`  Dropped: ${r.conname}`);
      } catch (err) {
        console.error(`  Error dropping ${r.conname}:`, err.message);
      }
    }

    // 2. Tạo partial unique index cho qrToken nếu chưa có
    await db.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_qrToken_unique" 
      ON "Bookings" ("qrToken") 
      WHERE "qrToken" IS NOT NULL;
    `);
    console.log('Created partial unique index for qrToken.');

    // 3. Kiểm tra tổng số constraint còn lại
    const [remaining] = await db.sequelize.query(`
      SELECT count(*) as cnt
      FROM pg_constraint 
      WHERE conrelid = '"Bookings"'::regclass AND contype = 'u';
    `);
    console.log(`\nRemaining UNIQUE constraints on Bookings: ${remaining[0].cnt}`);

    // 4. Chạy thử syncSchema để xác nhận không deadlock
    console.log('\nRunning db.syncSchema() to verify no deadlock...');
    await db.syncSchema();
    console.log('✅ syncSchema() completed successfully — no deadlock!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

cleanupQrAndVerify();
