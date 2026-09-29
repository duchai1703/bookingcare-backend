// bookingcare-backend/scripts/verify-user-manage-flow.js
'use strict';
require('dotenv').config();
const db = require('../src/models');
const userService = require('../src/services/userService');

async function verify() {
  console.log('=== TEST USER MANAGEMENT FULL-STACK FLOW ===');
  try {
    await db.sequelize.authenticate();

    // 1. Lấy một user mẫu
    const testUser = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!testUser) {
      console.log('Không tìm thấy user test');
      process.exit(1);
    }
    console.log(`\n1. Target User: [ID: ${testUser.id}] ${testUser.lastName} ${testUser.firstName} (${testUser.email})`);
    console.log(`   Initial status: isActive = ${testUser.isActive}`);

    // 2. Test Lock User
    console.log('\n2. Testing Lock User (isActive = false)...');
    const lockRes = await userService.editUser({ id: testUser.id, isActive: false });
    console.log('   Lock result:', lockRes);

    const reloadedUser = await db.User.findByPk(testUser.id);
    console.log(`   Reloaded isActive: ${reloadedUser.isActive}`);
    if (reloadedUser.isActive !== false) throw new Error('Lock User failed!');

    // 3. Test Login with Locked User -> Should be rejected
    console.log('\n3. Testing Login with Locked User...');
    const loginRes = await userService.handleUserLogin(testUser.email, 'any_password');
    console.log('   Login attempt with locked account:', loginRes);
    if (loginRes.errCode !== 8) {
      throw new Error(`Expected errCode 8 for locked user, but got ${loginRes.errCode}`);
    }
    console.log('   PASS: Locked user is blocked from logging in!');

    // 4. Test Reset Password
    console.log('\n4. Testing Reset Password...');
    const resetRes = await userService.resetUserPassword(testUser.id, 'NewPass@2026');
    console.log('   Reset result:', resetRes);
    if (resetRes.errCode !== 0 || resetRes.newPassword !== 'NewPass@2026') {
      throw new Error('Reset password failed!');
    }
    console.log('   PASS: Password reset successfully!');

    // 5. Test Unlock User
    console.log('\n5. Testing Unlock User (isActive = true)...');
    const unlockRes = await userService.editUser({ id: testUser.id, isActive: true });
    console.log('   Unlock result:', unlockRes);

    const finalUser = await db.User.findByPk(testUser.id);
    console.log(`   Final isActive: ${finalUser.isActive}`);
    if (finalUser.isActive !== true) throw new Error('Unlock User failed!');
    console.log('   PASS: User successfully unlocked!');

    console.log('\n=== ALL USER MANAGEMENT BACKEND FLOWS VERIFIED SUCCESSFULLY ===');
    process.exit(0);
  } catch (err) {
    console.error('FAILED verify test:', err);
    process.exit(1);
  }
}

verify();
