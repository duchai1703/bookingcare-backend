const db = require('../src/models');

async function cleanConstraints() {
  try {
    const [rows] = await db.sequelize.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = '"Bookings"'::regclass 
        AND (conname LIKE 'Bookings_paymentToken_key%' OR conname LIKE 'Bookings_publicReceiptToken_key%')
      ORDER BY conname;
    `);

    console.log(`Found ${rows.length} duplicate unique constraints on Bookings!`);

    for (const r of rows) {
      try {
        await db.sequelize.query(`ALTER TABLE "Bookings" DROP CONSTRAINT IF EXISTS "${r.conname}";`);
      } catch (err) {
        console.error(`Error dropping ${r.conname}:`, err.message);
      }
    }

    console.log(`Successfully cleaned up duplicate constraints.`);

    // Tạo lại 1 unique index duy nhất có tên cố định nếu chưa có
    await db.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_payment_token_unique" 
      ON "Bookings" ("paymentToken") 
      WHERE "paymentToken" IS NOT NULL;
    `);

    await db.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_public_receipt_token_unique" 
      ON "Bookings" ("publicReceiptToken") 
      WHERE "publicReceiptToken" IS NOT NULL;
    `);

    console.log('Fixed unique indexes with partial NULL filter.');
  } catch (err) {
    console.error('Fatal cleanup error:', err);
  } finally {
    process.exit(0);
  }
}

cleanConstraints();
