// ═══════════════════════════════════════════════════════════════════════
// Verification Script: verify-ai-patient-assistant-parity.js
// Tests Full Patient Capability Parity & Assistant Integration
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../src/models');
const {
  handleGetFamilyMembers,
  handleCreateFamilyMember,
  handleGetWalletTransactions,
  handleGetAppointmentDetail,
  handleGetMyNotifications,
  handleGetMyBookings,
  handlePrepareBookingDraft,
} = require('../src/services/aiFunctionHandlers');
const { classifyIntent } = require('../src/services/aiIntentRouter');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL]: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ [PASS]: ${message}`);
    passedTests++;
  }
}

async function runParityVerification() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 RUNNING: AI Patient Assistant Parity & Regression Test Suite');
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    // 1. Authenticate DB connection
    await db.sequelize.authenticate();
    console.log('📦 Database connected successfully.\n');

    // 2. Find a valid patient user
    const patientUser = await db.User.findOne({
      where: { roleId: 'R3' },
      order: [['id', 'ASC']],
    });

    if (!patientUser) {
      console.warn('⚠️ No patient user found in DB. Skipping live DB interaction tests.');
      return;
    }
    const patientId = patientUser.id;
    console.log(`👤 Using Patient ID: ${patientId} (${patientUser.email || patientUser.id})\n`);

    // ─── TEST 1: Intent Routing Parity ───
    console.log('--- TEST 1: Intent Classification & Routing ---');
    const intent1 = await classifyIntent('cho tôi xem lịch sử biến động số dư ví');
    assert(intent1.intent === 'WALLET_TRANSACTIONS_QUERY', 'Maps "biến động số dư ví" to WALLET_TRANSACTIONS_QUERY');

    const intent2 = await classifyIntent('chi tiết lịch khám mã #BK-123 của tôi');
    assert(intent2.intent === 'APPOINTMENT_DETAIL_QUERY', 'Maps "chi tiết lịch khám" to APPOINTMENT_DETAIL_QUERY');

    const intent3 = await classifyIntent('kiểm tra xem tôi có thông báo mới nào không');
    assert(intent3.intent === 'NOTIFICATION_QUERY', 'Maps "thông báo mới" to NOTIFICATION_QUERY');

    const intent4 = await classifyIntent('thêm người thân con gái Nguyễn Ngọc Ánh');
    assert(intent4.intent === 'FAMILY_QUERY', 'Maps adding family member to FAMILY_QUERY');

    const intent5 = await classifyIntent('xem lịch khám hôm nay của tôi');
    assert(intent5.intent === 'MY_BOOKING_QUERY', 'Maps today appointments query to MY_BOOKING_QUERY');
    console.log('');

    // ─── TEST 2: Family Member Resolution & Name Field Fix ───
    console.log('--- TEST 2: Family Member Resolution & Model Parity ---');
    const familyMembersRes = await handleGetFamilyMembers({}, patientId);
    assert(familyMembersRes.status === 'success' || familyMembersRes.status === 'empty', 'handleGetFamilyMembers returns valid response');
    if (familyMembersRes.status === 'success' && familyMembersRes.members.length > 0) {
      const firstMember = familyMembersRes.members[0];
      assert(typeof firstMember.name === 'string' && firstMember.name.length > 0, `Family member name is populated correctly: "${firstMember.name}" (not undefined)`);
      assert(firstMember.id > 0, 'Family member id is valid');
    }
    console.log('');

    // ─── TEST 3: Create Family Member Handler & Validation ───
    console.log('--- TEST 3: Create Family Member Handler Validation ---');
    // Test validation: short name
    const invalidNameRes = await handleCreateFamilyMember({ fullName: 'A' }, patientId);
    assert(invalidNameRes.status === 'error', 'Rejects family member with 1-character name');

    // Test validation: invalid phone
    const invalidPhoneRes = await handleCreateFamilyMember({ fullName: 'Nguyễn Văn Test', phoneNumber: '123' }, patientId);
    assert(invalidPhoneRes.status === 'error', 'Rejects family member with invalid phone number format');

    // Test unauthenticated access
    const unauthFamilyRes = await handleCreateFamilyMember({ fullName: 'Nguyễn Văn Test' }, null);
    assert(unauthFamilyRes.error !== undefined, 'Blocks unauthenticated family member creation');
    console.log('');

    // ─── TEST 4: Wallet Transactions Handler & IDOR Protection ───
    console.log('--- TEST 4: Wallet Transactions & IDOR Security ---');
    const unauthWalletRes = await handleGetWalletTransactions({}, null);
    assert(unauthWalletRes.error !== undefined, 'Blocks unauthenticated wallet transactions query');

    const walletTxRes = await handleGetWalletTransactions({ limit: 5 }, patientId);
    assert(walletTxRes.status === 'success' || walletTxRes.status === 'empty', 'handleGetWalletTransactions returns success or empty');
    if (walletTxRes.status === 'success') {
      assert(Array.isArray(walletTxRes.transactions), 'Transactions array is returned');
      assert(walletTxRes.balance !== undefined, 'Wallet balance is included');
    }
    console.log('');

    // ─── TEST 5: Appointment Detail Handler & IDOR Check ───
    console.log('--- TEST 5: Appointment Detail & Clinical Parity ---');
    // Unauthenticated
    const unauthDetailRes = await handleGetAppointmentDetail({ bookingId: 1 }, null);
    assert(unauthDetailRes.error !== undefined, 'Blocks unauthenticated appointment detail access');

    // Find any booking belonging to another user to test IDOR blocking
    const otherBooking = await db.Booking.findOne({
      where: {
        patientId: { [db.Sequelize.Op.ne]: patientId },
      },
    });

    if (otherBooking) {
      const idorDetailRes = await handleGetAppointmentDetail({ bookingId: otherBooking.id }, patientId);
      assert(idorDetailRes.status === 'empty' || idorDetailRes.error === 'unauthorized', 'Prevents IDOR cross-patient appointment detail access');
    }

    // Check patient's own booking if exists
    const myBooking = await db.Booking.findOne({
      where: { patientId },
      order: [['createdAt', 'DESC']],
    });

    if (myBooking) {
      const myDetailRes = await handleGetAppointmentDetail({ bookingId: myBooking.id }, patientId);
      assert(myDetailRes.status === 'success', `Successfully retrieved own appointment detail #${myBooking.id}`);
      assert(myDetailRes.bookingId === myBooking.id, 'Booking ID matches query');
      assert(myDetailRes.doctor !== undefined, 'Doctor info is populated');
      assert(myDetailRes.schedule !== undefined, 'Schedule info is populated');
      assert(myDetailRes.status !== undefined, 'Status info is populated');
      assert(myDetailRes.financial !== undefined, 'Financial info is populated');
      assert(myDetailRes.clinical !== undefined, 'Clinical info is populated');
    }
    console.log('');

    // ─── TEST 6: Notifications Query Handler ───
    console.log('--- TEST 6: Patient Notifications Query ---');
    const unauthNotifRes = await handleGetMyNotifications({}, null);
    assert(unauthNotifRes.error !== undefined, 'Blocks unauthenticated notifications query');

    const notifRes = await handleGetMyNotifications({ limit: 5 }, patientId);
    assert(notifRes.status === 'success', 'handleGetMyNotifications succeeds for authenticated patient');
    assert(typeof notifRes.unreadCount === 'number', 'Unread count is returned as number');
    assert(Array.isArray(notifRes.notifications), 'Notifications array is returned');
    console.log('');

    // ─── TEST 7: Appointment History with Date Filter ───
    console.log('--- TEST 7: Appointment History Filter Parity ---');
    const todayBookingsRes = await handleGetMyBookings({ date: 'today' }, patientId);
    assert(todayBookingsRes.status === 'success' || todayBookingsRes.status === 'empty', 'Supports date: "today" filter');

    const tomorrowBookingsRes = await handleGetMyBookings({ date: 'tomorrow' }, patientId);
    assert(tomorrowBookingsRes.status === 'success' || tomorrowBookingsRes.status === 'empty', 'Supports date: "tomorrow" filter');
    console.log('');

    // ─── SUMMARY ───
    console.log('════════════════════════════════════════════════════════════');
    console.log(`🎉 ALL PARITY TESTS COMPLETED: ${passedTests} passed, ${failedTests} failed.`);
    console.log('════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('💥 Fatal error in verification suite:', err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

runParityVerification();
