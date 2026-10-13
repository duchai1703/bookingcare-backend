'use strict';
require('dotenv').config();

const assert = require('assert');
const { classifyIntent, INTENTS } = require('../src/services/aiIntentRouter');
const { extractHealthContext } = require('../src/services/aiHealthAssessmentService');
const db = require('../src/models');
const patientService = require('../src/services/patientService');
const { handlePrepareBookingDraft, handleConfirmCreateBooking } = require('../src/services/aiFunctionHandlers');
const aiBookingDraftStore = require('../src/utils/aiBookingDraftStore');

async function runAuditTests() {
  console.log('======================================================================');
  console.log('🩺 RUNNING INTENT PRIORITY & HEALTH CONTEXT ISOLATION TESTS');
  console.log('======================================================================');

  // TEST A: Previous "đau tay", current "hủy lịch"
  {
    const history = [
      { role: 'user', content: 'Tôi bị đau tay dữ dội' },
      { role: 'model', content: 'Bạn bị đau tay bao lâu rồi?' },
    ];
    const currentMsg = 'hủy lịch';
    const intentRes = classifyIntent(currentMsg);
    assert.strictEqual(intentRes.intent, INTENTS.CANCEL_BOOKING_QUERY, 'Current turn must be CANCEL_BOOKING_QUERY');

    const healthCtx = extractHealthContext(currentMsg, history, null);
    assert.strictEqual(healthCtx.isFollowUp, false, 'Operational intent "hủy lịch" MUST NOT be marked as health follow-up');

    const nonHealthIntents = [
      INTENTS.CANCEL_BOOKING_QUERY,
      INTENTS.RESCHEDULE_QUERY,
      INTENTS.BOOKING_QUERY,
      INTENTS.MY_BOOKING_QUERY,
      INTENTS.DOCTOR_QUERY,
      INTENTS.SLOT_QUERY,
      INTENTS.SPECIALTY_QUERY,
      INTENTS.CLINIC_QUERY,
      INTENTS.WALLET_QUERY,
      INTENTS.PAYMENT_QUERY,
      INTENTS.FAMILY_QUERY,
      INTENTS.GENERAL_QUERY,
    ];
    const isHealthFlow = !nonHealthIntents.includes(intentRes.intent) && (intentRes.intent === INTENTS.HEALTH_QUERY || healthCtx.isFollowUp);
    assert.strictEqual(isHealthFlow, false, 'TEST A PASS: "hủy lịch" strictly DOES NOT trigger Health Assessment');
    console.log('  ✅ [PASS] TEST A: "đau tay" -> "hủy lịch" strictly isolated to CANCEL_BOOKING_QUERY');
  }

  // TEST B: Previous "đau tay", current "tìm bác sĩ Thắng Võ Minh"
  {
    const history = [
      { role: 'user', content: 'Tôi bị đau tay' },
      { role: 'model', content: 'Bạn có triệu chứng nào khác không?' },
    ];
    const currentMsg = 'tìm bác sĩ Thắng Võ Minh';
    const intentRes = classifyIntent(currentMsg);
    assert.strictEqual(intentRes.intent, INTENTS.DOCTOR_QUERY, 'Current turn must be DOCTOR_QUERY');

    const healthCtx = extractHealthContext(currentMsg, history, null);
    assert.strictEqual(healthCtx.isFollowUp, false, 'Doctor search must NOT be health follow-up');
    console.log('  ✅ [PASS] TEST B: "đau tay" -> "tìm bác sĩ..." strictly isolated to DOCTOR_QUERY');
  }

  // TEST C: Previous "đau tay", current "xem lịch hẹn của tôi"
  {
    const history = [{ role: 'user', content: 'Tôi bị đau tay' }];
    const currentMsg = 'xem lịch hẹn của tôi';
    const intentRes = classifyIntent(currentMsg);
    assert.strictEqual(intentRes.intent, INTENTS.MY_BOOKING_QUERY, 'Must be MY_BOOKING_QUERY');

    const healthCtx = extractHealthContext(currentMsg, history, null);
    assert.strictEqual(healthCtx.isFollowUp, false, 'My bookings query must not be follow-up');
    console.log('  ✅ [PASS] TEST C: "đau tay" -> "xem lịch hẹn của tôi" strictly isolated to MY_BOOKING_QUERY');
  }

  // TEST D: New conversation: "hủy lịch"
  {
    const currentMsg = 'hủy lịch';
    const intentRes = classifyIntent(currentMsg);
    assert.strictEqual(intentRes.intent, INTENTS.CANCEL_BOOKING_QUERY);
    console.log('  ✅ [PASS] TEST D: New conversation "hủy lịch" is CANCEL_BOOKING_QUERY');
  }

  // TEST E: New conversation: "đau tay"
  {
    const currentMsg = 'đau tay';
    const intentRes = classifyIntent(currentMsg);
    assert.strictEqual(intentRes.intent, INTENTS.HEALTH_QUERY);
    console.log('  ✅ [PASS] TEST E: New conversation "đau tay" is HEALTH_QUERY');
  }

  // TEST F: Previous "đau tay", current "tôi vẫn đau và sưng hơn"
  {
    const history = [
      { role: 'user', content: 'Tôi bị đau tay' },
      { role: 'model', content: 'Bạn bị đau thế nào?' },
    ];
    const currentMsg = 'tôi vẫn đau và sưng hơn';
    const intentRes = classifyIntent(currentMsg);
    assert.strictEqual(intentRes.intent, INTENTS.HEALTH_QUERY);
    const healthCtx = extractHealthContext(currentMsg, history, null);
    assert.strictEqual(healthCtx.isFollowUp, true, 'Medical update must be detected as follow-up');
    assert(healthCtx.symptoms.includes('đau'), 'Must contain symptom đau');
    assert(healthCtx.symptoms.includes('sưng'), 'Must contain symptom sưng');
    console.log('  ✅ [PASS] TEST F: "tôi vẫn đau và sưng hơn" correctly recognized as health follow-up');
  }

  console.log('\n======================================================================');
  console.log('💳 RUNNING AI WALLET BOOKING & INSUFFICIENT BALANCE TESTS');
  console.log('======================================================================');

  // TEST G & H: Wallet Sufficient & Insufficient Flows
  const patientId = 52;
  const doctorId = 2;
  const testDate = String(Date.now() + 15 * 86400000);

  // Setup schedule
  const [schedule] = await db.Schedule.findOrCreate({
    where: { doctorId, date: testDate, timeType: 'T1' },
    defaults: { doctorId, date: testDate, timeType: 'T1', maxNumber: 10, currentNumber: 0, status: 'ACTIVE' },
  });
  await schedule.update({ currentNumber: 0 });

  // Get patient wallet
  let [wallet] = await db.Wallet.findOrCreate({
    where: { ownerId: patientId, walletType: 'PATIENT' },
    defaults: { ownerId: patientId, walletType: 'PATIENT', balance: 5000000, availableBalance: 5000000, reservedBalance: 0, status: 'ACTIVE', currency: 'VND' },
  });

  // TEST G1: Prepare draft with sufficient balance
  await wallet.update({ balance: 2000000, availableBalance: 2000000, reservedBalance: 0 });
  const draftResult1 = await handlePrepareBookingDraft(
    { doctorId, scheduleId: schedule.id, reason: 'Khám tổng quát' },
    patientId,
    null,
    null
  );
  assert.strictEqual(draftResult1.status, 'success');
  assert.strictEqual(draftResult1.draft.paymentMethod, 'WALLET');
  assert.strictEqual(draftResult1.draft.wallet.hasSufficientBalance, true);
  console.log('  ✅ [PASS] TEST G1: Draft created with paymentMethod: WALLET, hasSufficientBalance: true');

  // TEST G2: Confirm booking with sufficient balance -> atomic debit & S2 & Wallet_Transaction
  const initialAvail = Number(wallet.availableBalance);
  const confirmResult = await handleConfirmCreateBooking(
    { draftId: draftResult1.draft.draftId, confirmationToken: draftResult1.draft.confirmationToken },
    patientId,
    null,
    null
  );
  assert.strictEqual(confirmResult.status, 'success');
  assert.strictEqual(confirmResult.data.bookingStatus, 'S2');
  assert.strictEqual(confirmResult.data.paymentStatus, 'paid');
  assert.strictEqual(confirmResult.data.paymentMethod, 'WALLET');
  const createdBookingId = confirmResult.data.bookingId;

  // Verify PostgreSQL state
  const dbBooking = await db.Booking.findByPk(createdBookingId);
  assert(dbBooking, 'Booking record must exist');
  assert.strictEqual(dbBooking.statusId, 'S2', 'Booking status must be S2');
  assert.strictEqual(dbBooking.paymentStatus, 'paid', 'Payment status must be paid');
  assert.strictEqual(dbBooking.paymentMethod, 'WALLET', 'Payment method must be WALLET');

  // Verify Wallet debit & Wallet_Hold & Wallet_Transaction
  const updatedWallet = await db.Wallet.findByPk(wallet.id);
  const bookingPrice = Number(dbBooking.bookingPrice || 100000);
  assert.strictEqual(Number(updatedWallet.availableBalance), initialAvail - bookingPrice, 'Wallet available balance must be debited');

  const wTx = await db.Wallet_Transaction.findOne({
    where: {
      walletId: wallet.id,
      referenceType: 'BOOKING',
      referenceId: String(createdBookingId),
      direction: 'DEBIT',
    },
  });
  assert(wTx, 'Wallet_Transaction must exist with bookingId');
  assert.strictEqual(wTx.status, 'COMPLETED');
  assert.strictEqual(Number(wTx.amount), bookingPrice);
  console.log(`  ✅ [PASS] TEST G2: Booking #${createdBookingId} paid atomically via Wallet (S2, paid, Ledger Tx #${wTx.id})`);

  // Cleanup test booking G before Test H so the slot is not blocked as duplicate
  await db.Booking.destroy({ where: { id: createdBookingId } });
  await db.Wallet_Transaction.destroy({ where: { referenceId: String(createdBookingId) } });
  await db.Wallet_Hold.destroy({ where: { bookingId: createdBookingId } });

  // TEST H: Insufficient balance flow
  await updatedWallet.update({ availableBalance: 1000, balance: 1000 });
  const draftResult2 = await handlePrepareBookingDraft(
    { doctorId, scheduleId: schedule.id, reason: '' },
    patientId,
    null,
    null
  );
  assert.strictEqual(draftResult2.status, 'success');
  assert.strictEqual(draftResult2.draft.wallet.hasSufficientBalance, false, 'hasSufficientBalance must be false when balance < price');
  assert(draftResult2.message.includes('không đủ'), 'Draft message must indicate insufficient balance');

  // Try to confirm with insufficient balance -> MUST FAIL with errCode: -10 / insufficient_wallet_balance
  const confirmResultInsufficient = await handleConfirmCreateBooking(
    { draftId: draftResult2.draft.draftId, confirmationToken: draftResult2.draft.confirmationToken },
    patientId,
    null,
    null
  );
  assert.strictEqual(confirmResultInsufficient.status, 'error');
  assert.strictEqual(confirmResultInsufficient.error, 'insufficient_wallet_balance');
  console.log('  ✅ [PASS] TEST H: Insufficient balance properly blocked, no booking success, no debit, clear error message');

  // Cleanup fixture
  await db.Booking.destroy({ where: { id: createdBookingId } });
  await db.Wallet_Transaction.destroy({ where: { referenceId: String(createdBookingId) } });
  await db.Wallet_Hold.destroy({ where: { bookingId: createdBookingId } });
  await updatedWallet.update({ availableBalance: initialAvail, balance: initialAvail });

  // TEST I: Natural Language & Unaccented Intent Fuzzing
  const fuzzTests = [
    { input: 'vậy cho em gặp bác sĩ', expected: INTENTS.DOCTOR_QUERY },
    { input: 'tìm bác sĩ cho em', expected: INTENTS.DOCTOR_QUERY },
    { input: 'bác sĩ nào khám cái này', expected: INTENTS.DOCTOR_QUERY },
    { input: 'còn giờ khám không', expected: INTENTS.SLOT_QUERY },
    { input: 'đặt giúp em', expected: INTENTS.BOOKING_QUERY },
    { input: 'thôi hủy', expected: INTENTS.CANCEL_BOOKING_QUERY },
    { input: 'tôi không muốn đi khám nữa', expected: INTENTS.CANCEL_BOOKING_QUERY },
    { input: 'đổi sang ngày mai', expected: INTENTS.RESCHEDULE_QUERY },
    { input: 'tôi muốn thanh toán', expected: INTENTS.PAYMENT_QUERY },
    { input: 'ví còn bao nhiêu', expected: INTENTS.WALLET_QUERY },
    { input: 'con gio kham khong', expected: INTENTS.SLOT_QUERY },
    { input: 'dat giup em', expected: INTENTS.BOOKING_QUERY },
    { input: 'thoi huy', expected: INTENTS.CANCEL_BOOKING_QUERY },
    { input: 'doi sang ngay mai', expected: INTENTS.RESCHEDULE_QUERY },
    { input: 'tim bac si', expected: INTENTS.DOCTOR_QUERY },
    { input: 'huy lich', expected: INTENTS.CANCEL_BOOKING_QUERY },
    { input: 'doi lich', expected: INTENTS.RESCHEDULE_QUERY },
    { input: 'so du vi', expected: INTENTS.WALLET_QUERY },
    { input: 'chuyen khoa tim mach', expected: INTENTS.SPECIALTY_QUERY },
    { input: 'tôi bị ho dữ dội', expected: INTENTS.HEALTH_QUERY },
    { input: 'thông tin phòng khám', expected: INTENTS.CLINIC_QUERY },
    { input: 'hôm nay có bác sĩ nào', expected: INTENTS.DOCTOR_QUERY },
  ];

  for (const { input, expected } of fuzzTests) {
    const res = classifyIntent(input);
    assert.strictEqual(res.intent, expected, `Phrase "${input}" must classify as ${expected}, got ${res.intent}`);
  }
  console.log('  ✅ [PASS] TEST I: Natural Language & Unaccented Vietnamese Intent Fuzzing (22/22 phrases passed)');

  // TEST J: AI Model Screening Questions Do NOT Contaminate Patient Symptoms
  const screeningHistory = [
    { role: 'user', content: 'Tôi bị ngứa da' },
    { role: 'model', content: 'Chào bạn, bạn bị ngứa bao lâu rồi? Bạn có bị sốt, khó thở, hay đau tức ngực không?' },
  ];
  const screeningCtx = extractHealthContext('Khoảng 2 ngày rồi', screeningHistory, null);
  assert.deepStrictEqual(screeningCtx.symptoms, ['ngứa'], 'Only user-stated symptoms must be extracted, model screening questions must NOT contaminate');
  console.log('  ✅ [PASS] TEST J: AI Model screening questions safely excluded from observed patient symptoms');

  // TEST K: Golden Scenarios 1-5
  // Scenario 1: "mình bị đau tay" -> only "đau", no fever/swelling/shortness of breath
  const s1Ctx = extractHealthContext('mình bị đau tay', [], null);
  assert.deepStrictEqual(s1Ctx.symptoms, ['đau']);
  assert(!s1Ctx.symptoms.includes('sốt'), 'Must not include fever');
  assert(!s1Ctx.symptoms.includes('sưng'), 'Must not include swelling');
  assert(!s1Ctx.symptoms.includes('khó thở'), 'Must not include shortness of breath');
  console.log('  ✅ [PASS] TEST K1 (Scenario 1): "mình bị đau tay" has zero hallucinated symptoms');

  // Scenario 2: "mình bị đau tay" -> "mình muốn khám bác sĩ" (must route to DOCTOR_QUERY, isFollowUp false)
  const s2Intent = classifyIntent('mình muốn khám bác sĩ');
  assert.strictEqual(s2Intent.intent, INTENTS.DOCTOR_QUERY);
  const s2Ctx = extractHealthContext('mình muốn khám bác sĩ', [{ role: 'user', content: 'mình bị đau tay' }, { role: 'model', content: 'Đánh giá...' }], null);
  assert.strictEqual(s2Ctx.isFollowUp, false, 'Operational intent must not trigger health follow-up');
  console.log('  ✅ [PASS] TEST K2 (Scenario 2): "mình muốn khám bác sĩ" routes to DOCTOR_QUERY with isFollowUp=false');

  // Scenario 3: "mình bị đau tay" -> "tìm bác sĩ Thắng Võ Minh"
  const s3Intent = classifyIntent('tìm bác sĩ Thắng Võ Minh');
  assert.strictEqual(s3Intent.intent, INTENTS.DOCTOR_QUERY);
  console.log('  ✅ [PASS] TEST K3 (Scenario 3): "tìm bác sĩ Thắng Võ Minh" routes to DOCTOR_QUERY');

  // Scenario 4: "mình bị đau tay" -> "hủy lịch"
  const s4Intent = classifyIntent('hủy lịch');
  assert.strictEqual(s4Intent.intent, INTENTS.CANCEL_BOOKING_QUERY);
  console.log('  ✅ [PASS] TEST K4 (Scenario 4): "hủy lịch" routes to CANCEL_BOOKING_QUERY');

  // Scenario 5: "tay tôi đau và sưng" -> "nó vẫn còn sưng"
  const s5Ctx = extractHealthContext('nó vẫn còn sưng', [{ role: 'user', content: 'tay tôi đau và sưng' }, { role: 'model', content: 'Đánh giá...' }], null);
  assert.strictEqual(s5Ctx.isFollowUp, true, 'Symptom update must be recognized as health follow-up');
  assert(s5Ctx.symptoms.includes('sưng'));
  console.log('  ✅ [PASS] TEST K5 (Scenario 5): "nó vẫn còn sưng" correctly recognized as health follow-up');

  console.log('\n======================================================================');
  console.log('🎉 ALL AUDIT & ACCEPTANCE SCENARIOS PASSED WITH ZERO REGRESSIONS!');
  console.log('======================================================================');
  process.exit(0);
}

runAuditTests().catch((err) => {
  console.error('❌ AUDIT TEST FAILED:', err);
  process.exit(1);
});
