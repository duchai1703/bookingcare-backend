// bookingcare-backend/scripts/sync-wallet-schema.js
const db = require('../src/models');

async function syncWalletTables() {
  try {
    console.log('🔄 Đang đồng bộ cơ sở dữ liệu cho Phân hệ Ví & Sổ cái...');
    await db.syncSchema();
    console.log('✅ db.syncSchema() thành công!');

    // Kiểm tra đếm bảng
    const walletCount = await db.Wallet.count();
    const txCount = await db.Wallet_Transaction.count();
    const holdCount = await db.Wallet_Hold.count();
    const payTxCount = await db.Payment_Transaction.count();

    console.log(`📊 Trạng thái các bảng ví:`);
    console.log(`   - Wallets: ${walletCount} bản ghi`);
    console.log(`   - Wallet_Transactions: ${txCount} bản ghi`);
    console.log(`   - Wallet_Holds: ${holdCount} bản ghi`);
    console.log(`   - Payment_Transactions: ${payTxCount} bản ghi`);

    console.log('🚀 Tất cả 4 bảng ví và sổ cái đã sẵn sàng!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Đồng bộ cơ sở dữ liệu thất bại:', error);
    process.exit(1);
  }
}

syncWalletTables();
