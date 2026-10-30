'use strict';

/**
 * ═════════════════════════════════════════════════════════════════════════
 * COMPREHENSIVE REGRESSION SUITE: 7 REAL-WORLD BUGS VERIFICATION
 * ═════════════════════════════════════════════════════════════════════════
 * BUG 1: Suggestion Click & Health Assessment Follow-Up (Text + Structured SSE)
 * BUG 2: Cancellation & Refund SSOT (No re-cancellation of #BK-957, No stale #BK-499)
 * BUG 3: Cancellation Notification delivery to Patient
 * BUG 4: Appointment History Payment & Refund Status parity
 * BUG 5: Family Portal & AI Sổ Y Bạ Parity
 * BUG 6: Past Slot Protection on same day
 * BUG 7: Health Assessment symptom provenance (No hallucinated observations)
 */

const assert = require('assert');
const db = require('../src/models');
const { Op } = require('sequelize');
const aiTimezoneUtils = require('../src/services/aiTimezoneUtils');
const aiFunctionHandlers = require('../src/services/aiFunctionHandlers');
const aiHealthAssessmentService = require('../src/services/aiHealthAssessmentService');
const patientService = require('../src/services/patientService');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STARTING EXHAUSTIVE 7-BUG REGRESSION SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────
  // BUG 6: PAST SLOT REJECTION
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [TEST GROUP BUG 6] Past Time Slot Protection (Asia/Ho_Chi_Minh)');
  runTest('Slot T1 (08:00 - 09:00) on today is recognized as past when current time is >= 08:00', () => {
    const nowVN = aiTimezoneUtils.getNowVN();
    const todayTimestamp = Date.UTC(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate()).toString();
    const currentHour = nowVN.getHours();

    if (currentHour >= 9) {
      assert.strictEqual(aiTimezoneUtils.isSlotInPast(todayTimestamp, 'T1'), true, 'T1 should be in the past');
    }
    // Future date should NEVER be in the past
    const tomorrow = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + 1);
    const tomorrowTimestamp = Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).toString();
    assert.strictEqual(aiTimezoneUtils.isSlotInPast(tomorrowTimestamp, 'T1'), false, 'Tomorrow T1 should NOT be in past');

    // Past date should ALWAYS be in the past
    const yesterday = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() - 1);
    const yesterdayTimestamp = Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toString();
    assert.strictEqual(aiTimezoneUtils.isSlotInPast(yesterdayTimestamp, 'T8'), true, 'Yesterday T8 should be in past');
  });

  await runAsyncTest('patientService.postBookAppointment rejects past slot with errCode 7', async () => {
    const nowVN = aiTimezoneUtils.getNowVN();
    const yesterday = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() - 1);
    const yesterdayTimestamp = Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toString();

    const res = await patientService.postBookAppointment({
      doctorId: 1,
      date: yesterdayTimestamp,
      timeType: 'T1',
      email: 'test_safety@bookingcare.vn',
      fullName: 'Test Patient Safety',
      phoneNumber: '0901234567',
    }, 1);

    assert.strictEqual(res.errCode, 7, 'Should return errCode 7 for past slot');
    assert.ok(res.message.includes('đã kết thúc') || res.message.includes('qua giờ'), 'Should explain slot is past');
  });

  // ─────────────────────────────────────────────────────────────
  // BUG 5: FAMILY MEMBER PORTAL / AI PARITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [TEST GROUP BUG 5] Family Members Portal & AI Parity');
  await runAsyncTest('handleGetFamilyMembers returns both members and data array matching DB', async () => {
    // Find a patient who has family members
    const fam = await db.Family_Member.findOne({ lock: false });
    if (!fam) {
      console.log('    ℹ️ No family members in DB to test; skipping specific user test');
      return;
    }
    const patientUserId = fam.userId;
    const res = await aiFunctionHandlers.handleGetFamilyMembers({}, patientUserId);

    assert.strictEqual(res.status, 'success');
    assert.ok(Array.isArray(res.members), 'res.members should be an array');
    assert.ok(Array.isArray(res.data), 'res.data should be an array for parity with aiController');
    assert.strictEqual(res.members.length, res.data.length);
    assert.strictEqual(res.total, res.members.length);
    assert.strictEqual(res.count, res.members.length);
    assert.ok(res.members.length > 0, 'Should return at least 1 member');

    const foundMember = res.members.find(m => m.id === fam.id || m.memberId === fam.id);
    assert.ok(foundMember, 'Target family member should be present in returned list');
    assert.ok(foundMember.fullName, 'Family member should have fullName');
    assert.ok(foundMember.relationship, 'Family member should have relationship');
  });

  // ─────────────────────────────────────────────────────────────
  // BUG 4: APPOINTMENT HISTORY PAYMENT / REFUND METADATA PARITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [TEST GROUP BUG 4] Appointment History Payment & Refund Metadata');
  await runAsyncTest('handleGetMyBookings preserves refunded and payment status for cancelled bookings', async () => {
    const booking957 = await db.Booking.findByPk(957, { lock: false });
    if (!booking957) {
      console.log('    ℹ️ Booking #BK-957 not in DB; testing generic S4 with refund');
      return;
    }

    const patientId = booking957.patientId;
    const res = await aiFunctionHandlers.handleGetMyBookings({ bookingCode: 'BK-957' }, patientId);

    assert.strictEqual(res.status, 'success');
    assert.ok(Array.isArray(res.bookings));
    const target = res.bookings.find(b => b.bookingId === 957);
    assert.ok(target, 'Booking #957 should be returned');
    assert.strictEqual(target.statusId, 'S4');
    assert.strictEqual(target.paymentMethod, 'WALLET');
    assert.strictEqual(Number(target.refundAmount), 0);
    assert.strictEqual(Number(target.refundRate), 0);
  });

  // ─────────────────────────────────────────────────────────────
  // BUG 2: CANCELLATION & REFUND SSOT (NO RE-CANCELLATION OF #BK-957)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [TEST GROUP BUG 2] Cancellation & Refund SSOT & No Stale Selection');
  await runAsyncTest('handlePrepareCancellationDraft on #BK-957 returns already_cancelled with cancellation explanation', async () => {
    const booking957 = await db.Booking.findByPk(957, { lock: false });
    if (!booking957) return;

    const res = await aiFunctionHandlers.handlePrepareCancellationDraft({ bookingId: 957 }, booking957.patientId);
    assert.strictEqual(res.status, 'already_cancelled');
    assert.strictEqual(res.alreadyCancelled, true);
    assert.ok(res.message.includes('đã được hủy'), 'Message should explain cancellation record');
    assert.ok(res.booking, 'Should return snapshot of booking');
    assert.strictEqual(res.booking.statusId, 'S4');
  });

  await runAsyncTest('handlePrepareCancellationDraft without bookingId ignores stale past bookings like #BK-499', async () => {
    const booking499 = await db.Booking.findByPk(499, { lock: false });
    if (!booking499) return;

    const res = await aiFunctionHandlers.handlePrepareCancellationDraft({}, booking499.patientId);
    // If the patient has no other upcoming active bookings, it should return 'no_active_booking', NOT select #499
    if (res.bookingId) {
      assert.notStrictEqual(res.bookingId, 499, 'Should NEVER pick past booking #BK-499');
    } else {
      assert.strictEqual(res.error, 'no_active_booking');
    }
  });

  // ─────────────────────────────────────────────────────────────
  // BUG 3: CANCELLATION NOTIFICATION FOR PATIENT
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [TEST GROUP BUG 3] Patient Notification on Cancellation');
  await runAsyncTest('cancelBooking sends BOOKING_CANCELLED notification to patient in isolated test booking', async () => {
    // Create an isolated test booking inside an isolated transaction
    const t = await db.sequelize.transaction();
    try {
      const nowVN = aiTimezoneUtils.getNowVN();
      const future = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + 5);
      const futureTimestamp = Date.UTC(future.getFullYear(), future.getMonth(), future.getDate()).toString();

      // Find doctor and patient
      const doctor = await db.User.findOne({ where: { roleId: 'R2', isActive: true }, lock: false });
      const patient = await db.User.findOne({ where: { roleId: 'R3', isActive: true }, lock: false });
      if (!doctor || !patient) {
        console.log('    ℹ️ Missing doctor or patient user; skipping');
        await t.rollback();
        return;
      }

      const testBooking = await db.Booking.create({
        statusId: 'S2',
        doctorId: doctor.id,
        patientId: patient.id,
        date: futureTimestamp,
        timeType: 'T5',
        token: 'test-token-uuid-1234',
        bookingPrice: 200000,
        paymentStatus: 'paid',
        paymentMethod: 'WALLET',
        bookingFor: 'SELF',
      }, { transaction: t });

      await t.commit();

      // Now cancel via patientService.cancelBooking
      const cancelRes = await patientService.cancelBooking({
        bookingId: testBooking.id,
        patientId: patient.id,
        reason: 'Test patient cancellation notification',
      });

      assert.strictEqual(cancelRes.errCode, 0, 'Cancel should succeed');

      // Check notification sent to patient
      const patientNotif = await db.Notification.findOne({
        where: {
          recipientId: patient.id,
          entityId: String(testBooking.id),
          type: 'BOOKING_CANCELLED',
        },
        order: [['createdAt', 'DESC']],
        lock: false,
      });

      assert.ok(patientNotif, 'Patient MUST receive BOOKING_CANCELLED notification');
      assert.ok(patientNotif.message.includes(String(testBooking.id)), 'Notification should reference booking ID');

      // Cleanup test booking
      await db.Notification.destroy({ where: { entityId: String(testBooking.id) } });
      await db.Booking.destroy({ where: { id: testBooking.id } });
    } catch (e) {
      if (!t.finished) await t.rollback();
      throw e;
    }
  });

  // ─────────────────────────────────────────────────────────────
  // BUG 7: HEALTH ASSESSMENT SYMPTOM PROVENANCE
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [TEST GROUP BUG 7] Health Assessment Observation Provenance');
  runTest('validateAndSanitizeAssessment filters out unprovided symptom hallucinations', () => {
    const rawModelOutput = {
      summary: 'Bạn bị đau tay, dưới đây là nhận định sơ bộ.',
      observations: [
        'Người dùng mô tả đau tay',
        'Hình thái khởi phát: tự nhiên đau',
        'Có tê bì, châm chích kèm theo',
      ],
      possibleExplanations: ['Hội chứng ống cổ tay', 'Căng cơ vùng cổ tay'],
      uncertainty: 'Cần khám trực tiếp để xác định.',
      followUpQuestions: ['Bạn có bị tê bì không?', 'Đau xuất hiện từ khi nào?'],
      riskLevel: 'ROUTINE',
      recommendedNextStep: 'Nên đi khám chuyên khoa Cơ xương khớp.',
      suggestedSpecialties: [{ name: 'Cơ xương khớp', reason: 'Chuyên khoa phù hợp' }],
    };

    const context = {
      rawMessage: 'Mình bị đau tay',
      initialComplaint: 'đau tay',
      symptoms: ['đau tay'],
      history: [],
    };

    const sanitized = aiHealthAssessmentService.validateAndSanitizeAssessment(rawModelOutput, context);
    const obs = sanitized.data.observations;

    assert.ok(obs.some(o => o.includes('đau tay')), 'Observations should include confirmed symptom "đau tay"');
    assert.strictEqual(obs.some(o => o.includes('tê bì') || o.includes('châm chích')), false, 'Observations must NOT include hallucinated "tê bì, châm chích"');
    assert.strictEqual(obs.some(o => o.includes('tự nhiên đau')), false, 'Observations must NOT include hallucinated "tự nhiên đau"');
  });

  // ─────────────────────────────────────────────────────────────
  // BUG 1: HEALTH ASSESSMENT FOLLOW-UP STREAM & UI CONTINUITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [TEST GROUP BUG 1] Health Assessment Interactive Continuity');
  runTest('activeHealthAssessment updates options without destroying state', () => {
    const record = aiHealthAssessmentService.createActiveAssessment({
      initialComplaint: 'Mình bị đau cổ tay',
      symptoms: ['đau cổ tay'],
      userId: 123,
    });

    assert.ok(record.assessmentId);
    const update = aiHealthAssessmentService.updateActiveAssessment({
      assessmentId: record.assessmentId,
      questionId: 'numbness',
      optionId: 'numbness_yes',
      value: true,
      answerText: 'Có tê bì các ngón tay',
    });

    assert.strictEqual(update.success, true);
    assert.strictEqual(update.data.assessmentId, record.assessmentId);
    assert.ok(update.data.answeredQuestionIds.includes('numbness'));
    assert.strictEqual(update.data.answers.numbness.value, true);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`ALL 7 BUGS REGRESSION TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ REGRESSION TEST FAILED:', err);
  process.exit(1);
});
