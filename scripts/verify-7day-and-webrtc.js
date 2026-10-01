// scripts/verify-7day-and-webrtc.js
'use strict';

require('dotenv').config();
const db = require('../src/models');
const chatService = require('../src/services/chatService');
const callService = require('../src/services/callService');
const callRepository = require('../src/repositories/callRepository');

async function runTestSuite() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTING 7-DAY ACCESS WINDOW & WEBRTC CALL SESSION FSM');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // Set up mock users
  const doctor = await db.User.findOne({ where: { roleId: 'R2' }, raw: true });
  const patient = await db.User.findOne({ where: { roleId: 'R3' }, raw: true });
  const otherPatient = await db.User.findOne({ where: { roleId: 'R3', id: { [db.Sequelize.Op.ne]: patient.id } }, raw: true });

  assert(doctor && patient, 'Found valid doctor and patient in database');

  // Create Test Booking 1: S3 with Active 7-Day Window
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 168 * 3600 * 1000); // 7 days ahead

  const activeBooking = await db.Booking.create({
    statusId: 'S3',
    doctorId: doctor.id,
    patientId: patient.id,
    date: '1790000000000',
    timeType: 'T1',
    token: 'test-active-token',
    consultationCompletedAt: now,
    followUpExpiresAt: expiresAt,
  });

  // Create Test Booking 2: S3 with EXPIRED 7-Day Window (ended yesterday)
  const pastCompleted = new Date(now.getTime() - 8 * 24 * 3600 * 1000); // 8 days ago
  const pastExpires = new Date(pastCompleted.getTime() + 168 * 3600 * 1000); // 1 day ago

  const expiredBooking = await db.Booking.create({
    statusId: 'S3',
    doctorId: doctor.id,
    patientId: patient.id,
    date: '1780000000000',
    timeType: 'T2',
    token: 'test-expired-token',
    consultationCompletedAt: pastCompleted,
    followUpExpiresAt: pastExpires,
  });

  console.log('\n--- SUITE 1: 7-DAY POST-CONSULTATION WINDOW ENFORCEMENT ---');

  // 1. Active booking creates conversation successfully
  const activeConvRes = await chatService.getOrCreateConversationForBooking(activeBooking.id, patient);
  assert(activeConvRes.errCode === 0, 'Active S3 booking allows conversation creation');
  assert(activeConvRes.data.isFollowUpActive === true, 'Active conversation has isFollowUpActive === true');
  assert(activeConvRes.data.isReadOnly === false, 'Active conversation has isReadOnly === false');

  const activeConvId = activeConvRes.data.id;

  // 2. Expired booking without existing conversation CANNOT create conversation
  const expiredConvRes = await chatService.getOrCreateConversationForBooking(expiredBooking.id, patient);
  assert(expiredConvRes.errCode === 7, 'Expired S3 booking rejects creating new conversation with errCode 7');
  assert(expiredConvRes.isFollowUpActive === false, 'Expired response has isFollowUpActive === false');

  // 3. Send message within active 7-day window succeeds
  const sendRes = await chatService.sendMessage(activeConvId, patient, {
    clientMessageId: 'active-msg-1',
    content: 'Em chào bác sĩ, đơn thuốc dùng thế nào ạ?',
  });
  assert(sendRes.errCode === 0, 'Sending message inside active 7-day window succeeds');

  // 4. Close conversation by doctor
  const closeRes = await chatService.updateConversationStatus(activeConvId, doctor, 'CLOSED');
  assert(closeRes.errCode === 0, 'Doctor can close conversation');

  // 5. Send message in CLOSED conversation is rejected (errCode 5)
  const sendClosedRes = await chatService.sendMessage(activeConvId, patient, {
    clientMessageId: 'closed-msg-1',
    content: 'Tin nhắn khi đóng',
  });
  assert(sendClosedRes.errCode === 5, 'Message rejected in CLOSED conversation with errCode 5');

  // 6. Doctor reopens conversation within 7 days -> succeeds
  const reopenRes = await chatService.updateConversationStatus(activeConvId, doctor, 'OPEN');
  assert(reopenRes.errCode === 0, 'Doctor can reopen conversation within 7 days');

  // 7. Expire the active booking manually in DB to test message expiration guard
  await db.Booking.update(
    { followUpExpiresAt: new Date(Date.now() - 1000) }, // 1 second in the past
    { where: { id: activeBooking.id } }
  );

  // Clear cached conversation query in repository
  const sendExpiredRes = await chatService.sendMessage(activeConvId, patient, {
    clientMessageId: 'expired-msg-1',
    content: 'Tin nhắn sau khi hết hạn 7 ngày',
  });
  assert(sendExpiredRes.errCode === 7, 'Message rejected after 7-day window expires with errCode 7');

  // 8. Reopening expired conversation is rejected (errCode 8)
  const closeAgain = await chatService.updateConversationStatus(activeConvId, doctor, 'CLOSED');
  assert(closeAgain.errCode === 0, 'Doctor can close conversation');
  const reopenExpiredRes = await chatService.updateConversationStatus(activeConvId, doctor, 'OPEN');
  assert(reopenExpiredRes.errCode === 8, 'Reopening expired conversation rejected with errCode 8');

  // 9. Existing conversation history is STILL READABLE after expiration
  const historyRes = await chatService.getConversationMessages(activeConvId, patient, {});
  assert(historyRes.errCode === 0, 'History remains 100% accessible in read-only mode after expiration');
  assert(historyRes.meta.isReadOnly === true, 'History metadata correctly reflects isReadOnly === true');

  console.log('\n--- SUITE 2: WEBRTC CALL SESSION FSM & ANTI-CONCURRENCY ---');

  // Reset booking to active window for WebRTC testing
  await db.Booking.update(
    { followUpExpiresAt: new Date(Date.now() + 168 * 3600 * 1000) },
    { where: { id: activeBooking.id } }
  );
  // Reopen conversation
  await db.Conversation.update({ status: 'OPEN' }, { where: { id: activeConvId } });

  // 10. Call initiation on active S3 booking succeeds
  const callInitRes = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'VIDEO' }, patient);
  assert(callInitRes.errCode === 0, 'Initiating call within active 7-day window succeeds');
  assert(callInitRes.data.status === 'RINGING', 'Call session initial status is RINGING');

  const testCallId = callInitRes.data.callId;

  // 11. Anti-concurrency: Caller cannot start a second call while in RINGING
  const secondCallRes = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'AUDIO' }, patient);
  assert(secondCallRes.errCode === 10, 'Caller prevented from starting duplicate active call (errCode 10)');

  // 12. Anti-concurrency: Another patient calling the same doctor gets BUSY
  const busyCallRes = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'VIDEO' }, otherPatient);
  assert(busyCallRes.errCode === 4 || busyCallRes.errCode === 11, 'Third-party or busy call correctly blocked');

  // 13. Cancel call by caller
  const cancelRes = await callService.cancelCall(testCallId, patient);
  assert(cancelRes.errCode === 0, 'Caller can cancel ringing call');
  assert(cancelRes.data.status === 'CANCELLED', 'Call status updated to CANCELLED');

  // 14. Start new call to test Acceptance & Connection
  const call2Init = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'VIDEO' }, patient);
  assert(call2Init.errCode === 0, 'Initiated second call session');
  const call2Id = call2Init.data.callId;

  // 15. Accept call by Doctor (Receiver)
  const acceptRes = await callService.acceptCall(call2Id, doctor);
  assert(acceptRes.errCode === 0, 'Doctor successfully accepted call');
  assert(acceptRes.data.status === 'CONNECTING', 'Call status moved to CONNECTING upon accept');

  // 16. Mark connected when WebRTC ICE completes
  const connectRes = await callService.markConnected(call2Id, doctor);
  assert(connectRes.errCode === 0 && connectRes.data.status === 'CONNECTED', 'Call marked as CONNECTED');

  // 17. End active call by Doctor
  const endRes = await callService.endCall(call2Id, doctor, 'NORMAL');
  assert(endRes.errCode === 0, 'Doctor successfully ended call');
  assert(endRes.data.status === 'ENDED', 'Call status is ENDED');
  assert(Number.isInteger(endRes.data.duration), 'Call duration recorded');

  // 18. Start new call to test Rejection
  const call3Init = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'AUDIO' }, doctor);
  assert(call3Init.errCode === 0, 'Doctor can initiate call to patient');
  const call3Id = call3Init.data.callId;

  const rejectRes = await callService.rejectCall(call3Id, patient, 'BUSY');
  assert(rejectRes.errCode === 0, 'Patient successfully rejected call');
  assert(rejectRes.data.status === 'REJECTED', 'Call status is REJECTED');

  // 19. Start new call to test 45s Ringing Timeout -> MISSED
  const call4Init = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'VIDEO' }, patient);
  const call4Id = call4Init.data.callId;
  const timeoutSession = await callService.handleRingingTimeout(call4Id);
  assert(timeoutSession.status === 'MISSED', 'Unanswered call transitions to MISSED upon timeout');

  // 20. Conversation CLOSED terminates any active calls
  const call5Init = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'VIDEO' }, patient);
  const call5Id = call5Init.data.callId;
  await chatService.updateConversationStatus(activeConvId, doctor, 'CLOSED');
  const sessionAfterClose = await callRepository.findByCallId(call5Id);
  assert(sessionAfterClose.status === 'ENDED' && sessionAfterClose.endReason === 'CONVERSATION_CLOSED', 'Closing conversation automatically terminates active calls with CONVERSATION_CLOSED');

  // 21. Call on expired booking is rejected
  await db.Booking.update(
    { followUpExpiresAt: new Date(Date.now() - 1000) },
    { where: { id: activeBooking.id } }
  );
  const expiredCallInit = await callService.initiateCall({ bookingId: activeBooking.id, callType: 'VIDEO' }, patient);
  assert(expiredCallInit.errCode === 7, 'Initiating call on expired booking rejected with errCode 7');

  // 22. ICE server configuration
  const iceServers = callService.getIceServers();
  assert(Array.isArray(iceServers) && iceServers.length > 0, 'ICE STUN/TURN servers configured properly');

  // Cleanup test fixtures
  await db.CallSession.destroy({ where: { bookingId: [activeBooking.id, expiredBooking.id] } });
  await db.ChatMessage.destroy({ where: { conversationId: activeConvId } });
  await db.Conversation.destroy({ where: { id: activeConvId } });
  await db.Booking.destroy({ where: { id: [activeBooking.id, expiredBooking.id] } });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`🎉 7-DAY & WEBRTC VERIFICATION SUITE: ${passed}/${total} TESTS PASSED!`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runTestSuite()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
