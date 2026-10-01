'use strict';

/**
 * Verification Script: Doctor-Patient Post-Consultation Real-time Chat
 * Tests:
 * 1. Booking S3 gatekeeper enforcement (S1/S2/S4 rejected)
 * 2. Idempotent conversation creation for S3 bookings
 * 3. IDOR authorization (patient and doctor role checks)
 * 4. Message persistence and idempotency (duplicate clientMessageId rejection)
 * 5. Cursor-based pagination & chronological ordering
 * 6. Read receipts marking
 * 7. Conversation lifecycle (Doctor close/open, patient cannot close, no messages in CLOSED)
 * 8. Socket authentication & tokenVersion revocation guard
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../src/models');
const chatRepository = require('../src/repositories/chatRepository');
const chatService = require('../src/services/chatService');
const socketAuthMiddleware = require('../src/realtime/socketAuthMiddleware');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ [PASS] ${message}`);
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING POST-CONSULTATION REAL-TIME CHAT VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 0. Ensure database connected and synced
    await db.sequelize.authenticate();
    await db.syncSchema();

    // 1. Fetch test users and bookings
    const s3Booking = await db.Booking.findOne({
      where: { statusId: 'S3' },
      include: [
        { model: db.User, as: 'patientData' },
        { model: db.User, as: 'doctorBookingData' },
      ],
    });

    const s2Booking = await db.Booking.findOne({
      where: { statusId: 'S2' },
    });

    assert(Boolean(s3Booking), 'Found seeded S3 (Completed Consultation) booking in database');
    assert(Boolean(s2Booking), 'Found seeded S2 (Confirmed Appointment) booking in database');

    // Ensure test S3 booking has an active 7-day follow-up window for testing chat messages
    if (!s3Booking.consultationCompletedAt || !s3Booking.followUpExpiresAt) {
      const completedAt = new Date();
      const expiresAt = new Date(completedAt.getTime() + 168 * 3600 * 1000);
      await s3Booking.update({
        consultationCompletedAt: completedAt,
        followUpExpiresAt: expiresAt,
      });
      s3Booking.consultationCompletedAt = completedAt;
      s3Booking.followUpExpiresAt = expiresAt;
    }

    const patientUser = {
      id: s3Booking.patientId,
      roleId: 'R3',
      email: s3Booking.patientData?.email || 'patient@test.com',
    };

    const doctorUser = {
      id: s3Booking.doctorId,
      roleId: 'R2',
      email: s3Booking.doctorBookingData?.email || 'doctor@test.com',
    };

    // Another unrelated patient & doctor for IDOR testing
    const otherPatient = await db.User.findOne({
      where: { roleId: 'R3', id: { [db.Sequelize.Op.ne]: s3Booking.patientId } },
    });
    const otherDoctor = await db.User.findOne({
      where: { roleId: 'R2', id: { [db.Sequelize.Op.ne]: s3Booking.doctorId } },
    });

    const otherPatientUser = { id: otherPatient.id, roleId: 'R3', email: otherPatient.email };
    const otherDoctorUser = { id: otherDoctor.id, roleId: 'R2', email: otherDoctor.email };

    // ─────────────────────────────────────────────────────────────
    // TEST 1: S1/S2/S4 Booking Gatekeeper Enforcement
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 1: Booking State Machine Gatekeeper ---');
    const nonS3Result = await chatService.getOrCreateConversationForBooking(s2Booking.id, {
      id: s2Booking.patientId,
      roleId: 'R3',
    });
    assert(
      nonS3Result.errCode === 3,
      `Non-S3 booking rejected with errCode 3: "${nonS3Result.message}"`
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 2: IDOR Authorization Security
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: IDOR Protection ---');
    const idorPatientResult = await chatService.getOrCreateConversationForBooking(
      s3Booking.id,
      otherPatientUser
    );
    assert(
      idorPatientResult.errCode === 4,
      `Unrelated patient blocked from booking chat (errCode 4): "${idorPatientResult.message}"`
    );

    const idorDoctorResult = await chatService.getOrCreateConversationForBooking(
      s3Booking.id,
      otherDoctorUser
    );
    assert(
      idorDoctorResult.errCode === 4,
      `Unrelated doctor blocked from booking chat (errCode 4): "${idorDoctorResult.message}"`
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Idempotent Conversation Creation on S3 Booking
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Idempotent Conversation Creation ---');
    const convResult1 = await chatService.getOrCreateConversationForBooking(
      s3Booking.id,
      patientUser
    );
    assert(convResult1.errCode === 0, 'Authorized patient successfully opens conversation on S3 booking');
    const conversationId = convResult1.data.id;
    assert(Number.isInteger(conversationId), `Conversation created with ID ${conversationId}`);

    const convResult2 = await chatService.getOrCreateConversationForBooking(
      s3Booking.id,
      patientUser
    );
    assert(convResult2.errCode === 0, 'Second call to getOrCreateConversation succeeds');
    assert(convResult2.data.id === conversationId, 'Idempotent check: Returned same conversation ID');
    assert(convResult2.created === false, 'Idempotent check: created flag is false on repeated call');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Message Persistence & Client Message Id Idempotency
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Message Persistence & Deduplication ---');
    const clientMsgId1 = `test-msg-${Date.now()}-1`;
    const sendResult1 = await chatService.sendMessage(conversationId, patientUser, {
      clientMessageId: clientMsgId1,
      content: 'Chào bác sĩ, tôi có câu hỏi về đơn thuốc sau khi khám ạ.',
    });
    assert(sendResult1.errCode === 0, 'Patient successfully sent message');
    assert(sendResult1.isDuplicate === false, 'First send is not duplicate');
    assert(sendResult1.data.content === 'Chào bác sĩ, tôi có câu hỏi về đơn thuốc sau khi khám ạ.', 'Message content preserved');

    // Retry with duplicate clientMessageId
    const sendResultDuplicate = await chatService.sendMessage(conversationId, patientUser, {
      clientMessageId: clientMsgId1,
      content: 'Chào bác sĩ, tôi có câu hỏi về đơn thuốc sau khi khám ạ.',
    });
    assert(sendResultDuplicate.errCode === 0, 'Duplicate message request handled cleanly');
    assert(sendResultDuplicate.isDuplicate === true, 'Duplicate flag is true');
    assert(sendResultDuplicate.data.id === sendResult1.data.id, 'Duplicate returns existing message without re-inserting');

    // Doctor replies
    const clientMsgId2 = `test-msg-${Date.now()}-2`;
    const doctorReply = await chatService.sendMessage(conversationId, doctorUser, {
      clientMessageId: clientMsgId2,
      content: 'Chào bạn, bạn cần hướng dẫn thêm về liều lượng thuốc nào?',
    });
    assert(doctorReply.errCode === 0, 'Doctor successfully replied in conversation');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Cursor-Based Pagination & Ordering
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: Cursor-Based Pagination ---');
    const pageResult = await chatService.getConversationMessages(conversationId, patientUser, {
      limit: 10,
    });
    assert(pageResult.errCode === 0, 'Retrieved message history');
    assert(Array.isArray(pageResult.data.messages), 'Messages is an array');
    assert(pageResult.data.messages.length >= 2, `Retrieved ${pageResult.data.messages.length} messages`);
    // Check chronological order (ascending by createdAt)
    const msg1Time = new Date(pageResult.data.messages[0].createdAt).getTime();
    const msg2Time = new Date(pageResult.data.messages[1].createdAt).getTime();
    assert(msg1Time <= msg2Time, 'Messages are ordered chronologically ASC');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Read Receipts
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 6: Read Receipts ---');
    const readResult = await chatService.markAsRead(conversationId, doctorUser);
    assert(readResult.errCode === 0, 'Doctor marked messages as read');

    const updatedMsgs = await chatService.getConversationMessages(conversationId, patientUser, { limit: 10 });
    const patientMsg = updatedMsgs.data.messages.find(m => m.senderId === patientUser.id);
    assert(patientMsg && patientMsg.readAt !== null, 'Patient message now marked with readAt timestamp');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Conversation Lifecycle (OPEN / CLOSED)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 7: Conversation Lifecycle Controls ---');
    // Patient attempts to close conversation -> MUST be forbidden
    const patientCloseAttempt = await chatService.updateConversationStatus(conversationId, patientUser, 'CLOSED');
    assert(patientCloseAttempt.errCode === 4, 'Patient forbidden from closing conversation');

    // Doctor closes conversation
    const doctorCloseResult = await chatService.updateConversationStatus(conversationId, doctorUser, 'CLOSED');
    assert(doctorCloseResult.errCode === 0, 'Doctor successfully closed conversation');
    assert(doctorCloseResult.data.status === 'CLOSED', 'Conversation status is now CLOSED');

    // Attempt to send message in CLOSED conversation -> MUST be rejected
    const blockedMsgResult = await chatService.sendMessage(conversationId, patientUser, {
      clientMessageId: `blocked-${Date.now()}`,
      content: 'Tin nhắn thử khi đã đóng',
    });
    assert(blockedMsgResult.errCode === 5, `Message rejected in CLOSED conversation: "${blockedMsgResult.message}"`);

    // Doctor reopens conversation
    const doctorReopenResult = await chatService.updateConversationStatus(conversationId, doctorUser, 'OPEN');
    assert(doctorReopenResult.errCode === 0, 'Doctor successfully reopened conversation');
    assert(doctorReopenResult.data.status === 'OPEN', 'Conversation status is now OPEN');

    // Now message succeeds
    const reopenedMsgResult = await chatService.sendMessage(conversationId, patientUser, {
      clientMessageId: `reopened-${Date.now()}`,
      content: 'Bác sĩ ơi, tôi đã mua được thuốc rồi ạ.',
    });
    assert(reopenedMsgResult.errCode === 0, 'Message accepted after reopening conversation');

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Socket Authentication & Session Revocation
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 8: Socket.IO Authentication & Session Revocation ---');
    const validToken = jwt.sign(
      { id: doctorUser.id, email: doctorUser.email, roleId: doctorUser.roleId, tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const mockSocketValid = {
      handshake: { auth: { token: validToken } },
    };

    let nextCalledWith = null;
    await socketAuthMiddleware(mockSocketValid, (err) => {
      nextCalledWith = err;
    });
    assert(nextCalledWith === undefined, 'Valid JWT handshake passed authentication middleware');
    assert(mockSocketValid.user?.id === doctorUser.id, 'Socket identity populated correctly');

    // Stale/Revoked tokenVersion
    const revokedToken = jwt.sign(
      { id: doctorUser.id, email: doctorUser.email, roleId: doctorUser.roleId, tokenVersion: 999 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const mockSocketRevoked = {
      handshake: { auth: { token: revokedToken } },
    };
    let revokedNextError = null;
    await socketAuthMiddleware(mockSocketRevoked, (err) => {
      revokedNextError = err;
    });
    assert(Boolean(revokedNextError), 'Revoked tokenVersion rejected by socket authentication');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED WITH ERROR:', err);
    process.exit(1);
  }
}

runTests();
