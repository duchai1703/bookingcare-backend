// bookingcare-backend/scripts/sync-withdrawal-schema.js
const db = require('../src/models');

async function syncWithdrawalSchema() {
  try {
    console.log('🔄 Đang kiểm tra và chuẩn hóa dữ liệu ví trước khi đồng bộ...');

    // Đảm bảo Wallet id 1 tồn tại nếu có bản ghi Withdrawal_Requests tham chiếu
    const [existingWallet] = await db.sequelize.query('SELECT id FROM "Wallets" WHERE id = 1');
    if (!existingWallet || existingWallet.length === 0) {
      console.log('Tạo ví id=1 cho admin@bookingcare.vn để bảo toàn dữ liệu cũ...');
      await db.sequelize.query(`
        INSERT INTO "Wallets" (id, "ownerId", "walletType", currency, "availableBalance", "reservedBalance", status, "createdAt", "updatedAt")
        VALUES (1, 1, 'PATIENT', 'VND', 0, 0, 'ACTIVE', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
      // Đặt lại sequence của Wallets
      await db.sequelize.query(`SELECT setval(pg_get_serial_sequence('"Wallets"', 'id'), coalesce(max(id), 1)) FROM "Wallets";`);
    }

    console.log('🔄 Đang đồng bộ cơ sở dữ liệu cho Bảng Withdrawal_Requests...');
    await db.syncSchema();
    console.log('✅ db.syncSchema() thành công!');

    if (db.Withdrawal_Request) {
      await db.Withdrawal_Request.sync({ alter: true });
      const count = await db.Withdrawal_Request.count();
      console.log(`📊 Bảng Withdrawal_Requests đã sẵn sàng (${count} bản ghi)!`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Đồng bộ cơ sở dữ liệu thất bại:', error);
    process.exit(1);
  }
}

syncWithdrawalSchema();
