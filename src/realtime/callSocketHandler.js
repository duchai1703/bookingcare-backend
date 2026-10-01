'use strict';

const db = require('../models');
const callService = require('../services/callService');
const callRepository = require('../repositories/callRepository');

// In-memory timer registries for timeouts (safely managed per process)
const activeRingingTimers = new Map();
const activeCallMaxTimers = new Map();

/**
 * Helper: Broadcast finalized CallHistory record to conversation and user rooms
 */
async function broadcastCallHistoryRecord(io, sessionData) {
  if (!sessionData) return;
  try {
    let conversationId = sessionData.conversationId;
    if (!conversationId && sessionData.bookingId) {
      const conv = await db.Conversation.findOne({
        where: { bookingId: sessionData.bookingId },
        attributes: ['id'],
      });
      if (conv) {
        conversationId = conv.id;
        await db.CallSession.update(
          { conversationId: conv.id },
          { where: { callId: sessionData.callId } }
        );
      }
    }

    const payload = {
      callId: sessionData.callId,
      callSessionId: sessionData.id,
      conversationId: conversationId || null,
      bookingId: sessionData.bookingId,
      callerId: sessionData.callerId,
      receiverId: sessionData.receiverId,
      callType: sessionData.callType,
      status: sessionData.status,
      duration: sessionData.duration || 0,
      startedAt: sessionData.startedAt,
      endedAt: sessionData.endedAt,
      createdAt: sessionData.createdAt,
      caller: sessionData.caller,
      receiver: sessionData.receiver,
    };

    if (conversationId) {
      io.to(`conversation_${conversationId}`).emit('call:history:record', payload);
    }
    if (sessionData.callId) {
      io.to(`call_${sessionData.callId}`).emit('call:history:record', payload);
    }
    if (sessionData.callerId) {
      io.to(`user_${sessionData.callerId}`).emit('call:history:record', payload);
    }
    if (sessionData.receiverId) {
      io.to(`user_${sessionData.receiverId}`).emit('call:history:record', payload);
    }
  } catch (err) {
    console.error('Error broadcasting call history record:', err);
  }
}

/**
 * Register WebRTC Call Signaling Handlers on Socket.IO
 */
function registerCallSocketHandlers(io, socket) {
  const user = socket.user;

  // ─────────────────────────────────────────────────────
  // 1. INITIATE CALL (Audio / Video)
  // ─────────────────────────────────────────────────────
  socket.on('call:initiate', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const bookingId = parseInt(payload?.bookingId, 10);
      const callType = payload?.callType || 'VIDEO';

      const result = await callService.initiateCall({ bookingId, callType }, user);
      if (result.errCode !== 0) {
        ack({
          success: false,
          error: result.message,
          errCode: result.errCode,
          reason: result.reason,
          activeCallId: result.activeCallId,
        });
        return;
      }

      const callId = result.data.callId;
      const callRoom = `call_${callId}`;
      socket.join(callRoom);

      // Acknowledge caller with full session info
      ack({ success: true, data: result.data });

      // Ring the recipient via their private user room
      io.to(`user_${result.receiverId}`).emit('call:incoming', {
        callId,
        bookingId,
        callType,
        caller: result.data.caller,
        booking: result.data.booking,
      });

      // 45-Second Ringing Timeout: If unanswered -> transition to MISSED
      const ringingTimer = setTimeout(async () => {
        try {
          const missedSession = await callService.handleRingingTimeout(callId);
          if (missedSession && missedSession.status === 'MISSED') {
            const timeoutPayload = {
              callId,
              reason: 'MISSED',
              message: 'Cuộc gọi không có phản hồi.',
            };
            io.to(callRoom).emit('call:missed', timeoutPayload);
            io.to(callRoom).emit('call:timeout', timeoutPayload);
            if (result?.receiverId) {
              io.to(`user_${result.receiverId}`).emit('call:missed', timeoutPayload);
              io.to(`user_${result.receiverId}`).emit('call:timeout', timeoutPayload);
            }
            if (result?.callerId || user?.id) {
              const callerId = result?.callerId || user?.id;
              io.to(`user_${callerId}`).emit('call:missed', timeoutPayload);
              io.to(`user_${callerId}`).emit('call:timeout', timeoutPayload);
            }
            await broadcastCallHistoryRecord(io, missedSession);
          }
        } catch (timerErr) {
          console.error('Error handling ringing timeout for call:', callId, timerErr);
        } finally {
          activeRingingTimers.delete(callId);
        }
      }, 45000); // 45 seconds

      activeRingingTimers.set(callId, ringingTimer);
    } catch (err) {
      console.error('Error in call:initiate handler:', err);
      ack({ success: false, error: 'Lỗi hệ thống khi bắt đầu cuộc gọi.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 2. ACCEPT CALL
  // ─────────────────────────────────────────────────────
  socket.on('call:accept', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const callId = payload?.callId;
      if (!callId) {
        ack({ success: false, error: 'Thiếu mã cuộc gọi (callId).' });
        return;
      }

      // Clear ringing timer
      if (activeRingingTimers.has(callId)) {
        clearTimeout(activeRingingTimers.get(callId));
        activeRingingTimers.delete(callId);
      }

      const result = await callService.acceptCall(callId, user);
      if (result.errCode !== 0) {
        ack({ success: false, error: result.message, errCode: result.errCode });
        return;
      }

      const callRoom = `call_${callId}`;
      socket.join(callRoom);

      ack({ success: true, data: result.data });

      // Notify caller that call was accepted
      socket.to(callRoom).emit('call:accepted', {
        callId,
        acceptedBy: user.id,
        session: result.data,
      });

      // Max Call Duration Timeout: Default 60 minutes
      const maxDurationTimer = setTimeout(async () => {
        try {
          const endedSession = await callService.endCall(callId, user, 'MAX_DURATION_EXCEEDED');
          io.to(callRoom).emit('call:ended', {
            callId,
            reason: 'MAX_DURATION_EXCEEDED',
            duration: endedSession.data?.duration,
          });
          if (endedSession?.data) {
            await broadcastCallHistoryRecord(io, endedSession.data);
          }
        } catch (maxErr) {
          console.error('Error handling max duration for call:', callId, maxErr);
        } finally {
          activeCallMaxTimers.delete(callId);
        }
      }, 60 * 60 * 1000); // 60 minutes

      activeCallMaxTimers.set(callId, maxDurationTimer);
    } catch (err) {
      console.error('Error in call:accept handler:', err);
      ack({ success: false, error: 'Lỗi hệ thống khi chấp nhận cuộc gọi.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 3. REJECT CALL
  // ─────────────────────────────────────────────────────
  socket.on('call:reject', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const callId = payload?.callId;
      const reason = payload?.reason || 'REJECTED';

      if (!callId) {
        ack({ success: false, error: 'Thiếu mã cuộc gọi.' });
        return;
      }

      // Clear ringing timer
      if (activeRingingTimers.has(callId)) {
        clearTimeout(activeRingingTimers.get(callId));
        activeRingingTimers.delete(callId);
      }

      const result = await callService.rejectCall(callId, user, reason);
      const callRoom = `call_${callId}`;

      const rejectPayload = {
        callId,
        reason,
        rejectedBy: user.id,
      };

      io.to(callRoom).emit('call:rejected', rejectPayload);
      if (result?.data?.callerId) {
        io.to(`user_${result.data.callerId}`).emit('call:rejected', rejectPayload);
      }
      if (result?.data?.receiverId) {
        io.to(`user_${result.data.receiverId}`).emit('call:rejected', rejectPayload);
      }

      if (result?.data) {
        await broadcastCallHistoryRecord(io, result.data);
      }

      ack({ success: true });
    } catch (err) {
      console.error('Error in call:reject handler:', err);
      ack({ success: false, error: 'Lỗi hệ thống khi từ chối cuộc gọi.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 4. CANCEL CALL (by caller while ringing)
  // ─────────────────────────────────────────────────────
  socket.on('call:cancel', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const callId = payload?.callId;
      if (!callId) {
        ack({ success: false, error: 'Thiếu mã cuộc gọi.' });
        return;
      }

      // Clear ringing timer
      if (activeRingingTimers.has(callId)) {
        clearTimeout(activeRingingTimers.get(callId));
        activeRingingTimers.delete(callId);
      }

      const session = await callRepository.findByCallId(callId);
      const result = await callService.cancelCall(callId, user);

      const callRoom = `call_${callId}`;
      const cancelPayload = { callId, reason: 'CANCELLED' };

      io.to(callRoom).emit('call:cancelled', cancelPayload);
      if (session?.receiverId || result?.data?.receiverId) {
        io.to(`user_${session?.receiverId || result.data.receiverId}`).emit('call:cancelled', cancelPayload);
      }
      if (session?.callerId || result?.data?.callerId) {
        io.to(`user_${session?.callerId || result.data.callerId}`).emit('call:cancelled', cancelPayload);
      }

      if (result?.data) {
        await broadcastCallHistoryRecord(io, result.data);
      }

      ack({ success: true });
    } catch (err) {
      console.error('Error in call:cancel handler:', err);
      ack({ success: false, error: 'Lỗi hệ thống khi hủy cuộc gọi.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 5. END CALL (active call ended by either peer)
  // ─────────────────────────────────────────────────────
  socket.on('call:end', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const callId = payload?.callId;
      const reason = payload?.reason || 'NORMAL';

      if (!callId) {
        ack({ success: false, error: 'Thiếu mã cuộc gọi.' });
        return;
      }

      // Clear timers
      if (activeRingingTimers.has(callId)) {
        clearTimeout(activeRingingTimers.get(callId));
        activeRingingTimers.delete(callId);
      }
      if (activeCallMaxTimers.has(callId)) {
        clearTimeout(activeCallMaxTimers.get(callId));
        activeCallMaxTimers.delete(callId);
      }

      const result = await callService.endCall(callId, user, reason);

      const callRoom = `call_${callId}`;
      const endPayload = {
        callId,
        reason,
        endedBy: user.id,
        duration: result.data?.duration,
      };

      io.to(callRoom).emit('call:ended', endPayload);
      if (result?.data?.callerId) {
        io.to(`user_${result.data.callerId}`).emit('call:ended', endPayload);
      }
      if (result?.data?.receiverId) {
        io.to(`user_${result.data.receiverId}`).emit('call:ended', endPayload);
      }

      if (result?.data) {
        await broadcastCallHistoryRecord(io, result.data);
      }

      ack({ success: true, data: result.data });
    } catch (err) {
      console.error('Error in call:end handler:', err);
      ack({ success: false, error: 'Lỗi hệ thống khi kết thúc cuộc gọi.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 6. WEBRTC SIGNALING: SDP Offer
  // ─────────────────────────────────────────────────────
  socket.on('call:signal:offer', (payload) => {
    try {
      const { callId, sdp } = payload || {};
      if (callId && sdp) {
        socket.to(`call_${callId}`).emit('call:signal:offer', {
          callId,
          sdp,
          senderId: user.id,
        });
      }
    } catch (err) {
      console.error('Error forwarding offer:', err);
    }
  });

  // ─────────────────────────────────────────────────────
  // 7. WEBRTC SIGNALING: SDP Answer
  // ─────────────────────────────────────────────────────
  socket.on('call:signal:answer', (payload) => {
    try {
      const { callId, sdp } = payload || {};
      if (callId && sdp) {
        socket.to(`call_${callId}`).emit('call:signal:answer', {
          callId,
          sdp,
          senderId: user.id,
        });
      }
    } catch (err) {
      console.error('Error forwarding answer:', err);
    }
  });

  // ─────────────────────────────────────────────────────
  // 8. WEBRTC SIGNALING: Trickle ICE Candidate
  // ─────────────────────────────────────────────────────
  socket.on('call:signal:ice-candidate', (payload) => {
    try {
      const { callId, candidate } = payload || {};
      if (callId && candidate) {
        socket.to(`call_${callId}`).emit('call:signal:ice-candidate', {
          callId,
          candidate,
          senderId: user.id,
        });
      }
    } catch (err) {
      console.error('Error forwarding ICE candidate:', err);
    }
  });

  // ─────────────────────────────────────────────────────
  // 9. WEBRTC SIGNALING: Mark Connected
  // ─────────────────────────────────────────────────────
  socket.on('call:signal:connected', async (payload) => {
    try {
      const { callId } = payload || {};
      if (callId) {
        await callService.markConnected(callId, user);
      }
    } catch (err) {
      console.error('Error in call:signal:connected:', err);
    }
  });

  // ─────────────────────────────────────────────────────
  // 10. WEBRTC SIGNALING: Media State (Mute / Cam Off)
  // ─────────────────────────────────────────────────────
  socket.on('call:signal:media-state', (payload) => {
    try {
      const { callId, isAudioMuted, isVideoOff } = payload || {};
      if (callId) {
        socket.to(`call_${callId}`).emit('call:signal:media-state', {
          callId,
          senderId: user.id,
          isAudioMuted: Boolean(isAudioMuted),
          isVideoOff: Boolean(isVideoOff),
        });
      }
    } catch (err) {
      console.error('Error in media state broadcast:', err);
    }
  });

  // ─────────────────────────────────────────────────────
  // 11. DISCONNECT HANDLING
  // ─────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      // Find if user was in any active call
      const activeCall = await callRepository.findActiveCallForUser(user.id);
      if (activeCall) {
        socket.to(`call_${activeCall.callId}`).emit('call:peer-disconnected', {
          callId: activeCall.callId,
          disconnectedUserId: user.id,
        });
      }
    } catch (dErr) {
      // Ignore cleanup error on socket close
    }
  });
}

module.exports = registerCallSocketHandlers;
