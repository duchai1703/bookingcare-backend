'use strict';

const crypto = require('crypto');
const db = require('../models');
const callRepository = require('../repositories/callRepository');

/**
 * CallService — Domain Logic & FSM for WebRTC Audio/Video Consultations
 * Enforces S3 Booking Gatekeeper, 7-Day follow-up window, Anti-concurrency/Busy checks,
 * and state transitions.
 */
class CallService {
  /**
   * Helper: Check if follow-up 7-day window is active
   */
  isFollowUpActive(booking) {
    if (!booking || booking.statusId !== 'S3') {
      return false;
    }
    if (!booking.consultationCompletedAt || !booking.followUpExpiresAt) {
      return false;
    }
    const now = new Date();
    return now < new Date(booking.followUpExpiresAt);
  }

  /**
   * Initiate a new WebRTC Call (Audio or Video)
   */
  async initiateCall({ bookingId, callType = 'VIDEO' }, user) {
    const t = await db.sequelize.transaction();
    try {
      if (!bookingId) {
        await t.rollback();
        return { errCode: 1, message: 'Thiếu mã lịch khám (bookingId).' };
      }

      if (!['AUDIO', 'VIDEO'].includes(callType)) {
        await t.rollback();
        return { errCode: 1, message: 'Loại cuộc gọi không hợp lệ (phải là AUDIO hoặc VIDEO).' };
      }

      // 1. Fetch Booking
      const booking = await db.Booking.findByPk(bookingId, {
        attributes: [
          'id',
          'statusId',
          'patientId',
          'doctorId',
          'consultationCompletedAt',
          'followUpExpiresAt',
        ],
        transaction: t,
      });

      if (!booking) {
        await t.rollback();
        return { errCode: 2, message: 'Không tìm thấy lịch khám.' };
      }

      // 2. Gatekeeper: Must be S3
      if (booking.statusId !== 'S3') {
        await t.rollback();
        return {
          errCode: 3,
          message: 'Chức năng gọi thoại/video chỉ khả dụng sau khi bác sĩ đã hoàn tất khám (trạng thái S3).',
        };
      }

      // 3. Gatekeeper: 7-Day Window check
      if (!this.isFollowUpActive(booking)) {
        await t.rollback();
        return {
          errCode: 7,
          message: 'Thời hạn tư vấn hậu khám 7 ngày đã kết thúc. Không thể khởi tạo cuộc gọi mới.',
          followUpExpiresAt: booking.followUpExpiresAt,
        };
      }

      // 4. Verify participant ownership
      let receiverId = null;
      if (user.id === booking.patientId) {
        receiverId = booking.doctorId;
      } else if (user.id === booking.doctorId) {
        receiverId = booking.patientId;
      } else {
        await t.rollback();
        return { errCode: 4, message: 'Bạn không có quyền gọi cho lịch khám này.' };
      }

      // 5. Verify conversation is OPEN if exists
      const conversation = await db.Conversation.findOne({
        where: { bookingId: booking.id },
        transaction: t,
      });
      if (conversation && conversation.status === 'CLOSED') {
        await t.rollback();
        return {
          errCode: 5,
          message: 'Cuộc trò chuyện đã được bác sĩ kết thúc. Không thể thực hiện cuộc gọi mới.',
        };
      }

      // 6. Anti-concurrency: Check if caller is already in an active call
      const callerActive = await callRepository.findActiveCallForUser(user.id, t);
      if (callerActive) {
        await t.rollback();
        return {
          errCode: 10,
          message: 'Bạn hiện đang trong một cuộc gọi khác.',
          activeCallId: callerActive.callId,
        };
      }

      // 7. Anti-concurrency: Check if receiver is busy in another call
      const receiverActive = await callRepository.findActiveCallForUser(receiverId, t);
      if (receiverActive) {
        await t.rollback();
        return {
          errCode: 11,
          message: 'Đối phương hiện đang bận trong một cuộc gọi khác. Vui lòng thử lại sau.',
          reason: 'BUSY',
        };
      }

      // 8. Create CallSession in DB
      const callId = `call_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const session = await callRepository.createCallSession(
        {
          callId,
          bookingId: booking.id,
          conversationId: conversation ? conversation.id : null,
          callerId: user.id,
          receiverId,
          callType,
          status: 'RINGING',
        },
        t
      );

      await t.commit();

      // Fetch with full associations
      const fullSession = await callRepository.findByCallId(callId);

      return {
        errCode: 0,
        message: 'Khởi tạo cuộc gọi thành công.',
        data: fullSession,
        receiverId,
      };
    } catch (err) {
      if (!t.finished) await t.rollback();
      console.error('Error in initiateCall:', err);
      return { errCode: -1, message: 'Lỗi hệ thống khi khởi tạo cuộc gọi.' };
    }
  }

  /**
   * Accept an incoming call
   */
  async acceptCall(callId, user) {
    const session = await callRepository.findByCallId(callId);
    if (!session) {
      return { errCode: 2, message: 'Không tìm thấy phiên cuộc gọi.' };
    }

    if (session.receiverId !== user.id) {
      return { errCode: 4, message: 'Bạn không phải là người nhận của cuộc gọi này.' };
    }

    if (session.status !== 'RINGING') {
      return {
        errCode: 6,
        message: `Cuộc gọi không thể chấp nhận vì đang ở trạng thái ${session.status}.`,
        currentStatus: session.status,
      };
    }

    // Check 7-day window
    if (!this.isFollowUpActive(session.booking)) {
      await callRepository.updateCallStatus(callId, {
        status: 'EXPIRED',
        endReason: 'EXPIRED',
        endedAt: new Date(),
      });
      return { errCode: 7, message: 'Thời hạn hỗ trợ 7 ngày đã kết thúc.' };
    }

    const updated = await callRepository.updateCallStatus(callId, {
      status: 'CONNECTING',
      startedAt: new Date(),
    });

    return {
      errCode: 0,
      message: 'Chấp nhận cuộc gọi thành công.',
      data: updated,
    };
  }

  /**
   * Mark call as successfully connected (WebRTC peer connection active)
   */
  async markConnected(callId, user) {
    const session = await callRepository.findByCallId(callId);
    if (!session) return { errCode: 2, message: 'Không tìm thấy cuộc gọi.' };

    if (session.callerId !== user.id && session.receiverId !== user.id) {
      return { errCode: 4, message: 'Không có quyền truy cập cuộc gọi.' };
    }

    if (session.status === 'CONNECTING' || session.status === 'RINGING') {
      const updated = await callRepository.updateCallStatus(callId, {
        status: 'CONNECTED',
        startedAt: session.startedAt || new Date(),
      });
      return { errCode: 0, data: updated };
    }

    return { errCode: 0, data: session };
  }

  /**
   * Reject an incoming call (by Callee)
   */
  async rejectCall(callId, user, reason = 'REJECTED') {
    const session = await callRepository.findByCallId(callId);
    if (!session) {
      return { errCode: 2, message: 'Không tìm thấy cuộc gọi.' };
    }

    if (session.receiverId !== user.id) {
      return { errCode: 4, message: 'Bạn không phải là người nhận của cuộc gọi này.' };
    }

    if (session.status !== 'RINGING') {
      return { errCode: 6, message: 'Cuộc gọi đã kết thúc hoặc không ở trạng thái đổ chuông.' };
    }

    const updated = await callRepository.updateCallStatus(callId, {
      status: 'REJECTED',
      endReason: reason || 'REJECTED',
      endedAt: new Date(),
    });

    return { errCode: 0, message: 'Đã từ chối cuộc gọi.', data: updated };
  }

  /**
   * Cancel an outgoing call while still RINGING (by Caller)
   */
  async cancelCall(callId, user) {
    const session = await callRepository.findByCallId(callId);
    if (!session) {
      return { errCode: 2, message: 'Không tìm thấy cuộc gọi.' };
    }

    if (session.callerId !== user.id) {
      return { errCode: 4, message: 'Bạn không phải là người gọi của cuộc gọi này.' };
    }

    if (session.status !== 'RINGING') {
      return { errCode: 6, message: 'Cuộc gọi đã được phản hồi hoặc đã kết thúc.' };
    }

    const updated = await callRepository.updateCallStatus(callId, {
      status: 'CANCELLED',
      endReason: 'CANCELLED',
      endedAt: new Date(),
    });

    return { errCode: 0, message: 'Đã hủy cuộc gọi.', data: updated };
  }

  /**
   * End an active call (by either Participant)
   */
  async endCall(callId, user, reason = 'NORMAL') {
    const session = await callRepository.findByCallId(callId);
    if (!session) {
      return { errCode: 2, message: 'Không tìm thấy cuộc gọi.' };
    }

    if (session.callerId !== user.id && session.receiverId !== user.id) {
      return { errCode: 4, message: 'Bạn không phải là người tham gia cuộc gọi này.' };
    }

    const terminalStatuses = ['REJECTED', 'MISSED', 'CANCELLED', 'ENDED', 'FAILED', 'EXPIRED'];
    if (terminalStatuses.includes(session.status)) {
      return { errCode: 0, message: 'Cuộc gọi đã kết thúc trước đó.', data: session };
    }

    const endedAt = new Date();
    const duration = session.startedAt
      ? Math.max(0, Math.round((endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000))
      : 0;

    const updated = await callRepository.updateCallStatus(callId, {
      status: 'ENDED',
      endReason: reason || 'NORMAL',
      endedAt,
      duration,
    });

    return { errCode: 0, message: 'Cuộc gọi đã kết thúc.', data: updated };
  }

  /**
   * Ringing timeout (45 seconds with no answer)
   */
  async handleRingingTimeout(callId) {
    const session = await callRepository.findByCallId(callId);
    if (session && session.status === 'RINGING') {
      const updated = await callRepository.updateCallStatus(callId, {
        status: 'MISSED',
        endReason: 'MISSED',
        endedAt: new Date(),
      });
      return updated;
    }
    return session;
  }

  /**
   * Get ICE Servers Configuration (STUN / TURN)
   */
  getIceServers() {
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];

    if (process.env.TURN_SERVER_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: process.env.TURN_SERVER_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }

    return iceServers;
  }
}

module.exports = new CallService();
