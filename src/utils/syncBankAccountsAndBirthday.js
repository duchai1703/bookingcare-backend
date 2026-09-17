// src/utils/syncBankAccountsAndBirthday.js
require('dotenv').config();
const db = require('../models');

async function sync() {
  try {
    await db.sequelize.authenticate();
    console.log('>>> DB connected.');

    // 1. Add birthday column to Users table
    await db.sequelize.query(`
      ALTER TABLE "Users"
      ADD COLUMN IF NOT EXISTS "birthday" VARCHAR(20);
    `);
    console.log('>>> Column "birthday" added/verified on Users.');

    // 2. Sync Patient_Bank_Accounts table
    await db.PatientBankAccount.sync({ alter: true });
    console.log('>>> Table "Patient_Bank_Accounts" synced.');

    // 3. Create default primary bank account for test patient if empty
    const patients = await db.User.findAll({ where: { roleId: 'R3' } });
    for (const p of patients) {
      const existing = await db.PatientBankAccount.findOne({ where: { patientId: p.id } });
      if (!existing) {
        // Tìm xem bệnh nhân này đã từng đặt lịch với tài khoản ngân hàng nào chưa
        const prevBooking = await db.Booking.findOne({
          where: { patientId: p.id },
          order: [['id', 'DESC']],
        });
        const bankName = prevBooking?.bankName || 'Vietcombank';
        const accountNumber = prevBooking?.bankAccountNumber || '0123456789';
        const accountHolderName = prevBooking?.bankAccountName || `${p.lastName} ${p.firstName}`.toUpperCase();

        await db.PatientBankAccount.create({
          patientId: p.id,
          bankName,
          accountNumber,
          accountHolderName,
          isPrimary: true,
        });
        console.log(`>>> Created initial primary bank account for patient #${p.id} (${p.email}).`);
      }
      // Cập nhật birthday mẫu nếu chưa có
      if (!p.birthday) {
        await p.update({ birthday: '2005-03-17' });
        console.log(`>>> Backfilled sample birthday for patient #${p.id}.`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Sync error:', err);
    process.exit(1);
  }
}

sync();
