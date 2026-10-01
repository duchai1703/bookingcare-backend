'use strict';

const db = require('../models');
const chatRepository = require('../repositories/chatRepository');
const callRepository = require('../repositories/callRepository');

/**
 * ChatService — Domain business logic for Post-Consultation Doctor-Patient Chat
 * Enforces Booking S3 state machine constraints, participant ownership, idempotency,
 * and conversation lifecycle.
 */
class ChatService {
  /**
   * Helper: Check if 7-day follow-up consultation window is active
   * consultationCompletedAt is the immutable start, 168 hours duration.
   */
  isFollowUpWindowActive(booking) {
    if (!booking || booking.statusId !== 'S3') {
      return false;
    }
    if (!booking.consultationCompletedAt || !booking.followUpExpiresAt) {
      // Legacy S3 bookings without reliable completion timestamp are expired
      return false;
    }
    const now = new Date();
    return now < new Date(booking.followUpExpiresAt);
  }

  /**
   * Helper: verify user has access to this conversation
   */
  async verifyConversationAccess(conversationId, user) {
    const conv = await chatRepository.findConversationById(conversationId);
    if (!conv) {
      return { authorized: false, error: { errCode: 2, message: 'Không tìm thấy cuộc trò chuyện.' } };
    }

    // Admin R1 has supervisory access
    if (user.roleId === 'R1') {
      return { authorized: true, conversation: conv };
    }

    // Patient R3 check
    if (user.roleId === 'R3') {
      if (conv.patientId !== user.id) {
        return {
          authorized: false,
          error: { errCode: 4, message: 'Bạn không có quyền truy cập cuộc trò chuyện này.' },
        };
      }
      return { authorized: true, conversation: conv };
    }

    // Doctor R2 check
    if (user.roleId === 'R2') {
      if (conv.doctorId !== user.id) {
        return {
          authorized: false,
          error: { errCode: 4, message: 'Bạn không phải là bác sĩ phụ trách cuộc trò chuyện này.' },
        };
      }
      return { authorized: true, conversation: conv };
    }

    return {
      authorized: false,
      error: { errCode: 4, message: 'Không có quyền truy cập.' },
    };
  }

  /**
   * Get all conversations accessible to the authenticated user
   */
  async getUserConversations(user) {
    try {
      const conversations = await chatRepository.getConversationsByUser(user.id, user.roleId);
      const enhanced = conversations.map((conv) => {
        const isFollowUpActive = this.isFollowUpWindowActive(conv.bookingData);
        return {
          ...conv,
          isFollowUpActive,
          isReadOnly: !isFollowUpActive || conv.status === 'CLOSED',
        };
      });
      return {
        errCode: 0,
        message: 'Lấy danh sách cuộc trò chuyện thành công.',
        data: enhanced,
      };
    } catch (err) {
      console.error('Error in getUserConversations:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi lấy danh sách cuộc trò chuyện.',
      };
    }
  }

  /**
   * Idempotently get or create a conversation for a Booking
   * Bắt buộc Booking phải ở trạng thái S3 (Bác sĩ đã hoàn tất khám)
   */
  async getOrCreateConversationForBooking(bookingId, user) {
    try {
      if (!bookingId) {
        return { errCode: 1, message: 'Thiếu mã lịch khám (bookingId).' };
      }

      // 1. Fetch Booking
      const booking = await db.Booking.findOne({
        where: { id: bookingId },
        include: [
          {
            model: db.Allcode,
            as: 'statusData',
            attributes: ['valueEn', 'valueVi'],
          },
        ],
      });

      if (!booking) {
        return { errCode: 2, message: 'Lịch khám không tồn tại trên hệ thống.' };
      }

      // 2. Strict Business Rule: Only S3 (Completed Consultation) allows post-consultation chat
      if (booking.statusId !== 'S3') {
        return {
          errCode: 3,
          message: 'Chức năng nhắn tin sau khám chỉ khả dụng sau khi bác sĩ đã hoàn tất buổi khám (trạng thái S3).',
          currentStatus: booking.statusId,
        };
      }

      // 3. Authorization verification
      if (user.roleId === 'R3') {
        // Patient must be the patient of this booking
        if (booking.patientId !== user.id) {
          return {
            errCode: 4,
            message: 'Bạn chỉ có thể trò chuyện với bác sĩ về lịch khám của chính mình.',
          };
        }
      } else if (user.roleId === 'R2') {
        // Doctor must be the assigned doctor of this booking
        if (booking.doctorId !== user.id) {
          return {
            errCode: 4,
            message: 'Bạn chỉ có thể tham gia cuộc trò chuyện thuộc bệnh nhân do mình phụ trách.',
          };
        }
      } else if (user.roleId !== 'R1') {
        return { errCode: 4, message: 'Vai trò người dùng không hợp lệ.' };
      }

      // 4. Check if conversation already exists
      const existing = await chatRepository.findConversationByBookingId(booking.id);
      const isWindowActive = this.isFollowUpWindowActive(booking);

      if (existing) {
        return {
          errCode: 0,
          message: 'Lấy cuộc trò chuyện thành công.',
          data: {
            ...existing,
            consultationCompletedAt: booking.consultationCompletedAt,
            followUpExpiresAt: booking.followUpExpiresAt,
            isFollowUpActive: isWindowActive,
            isReadOnly: !isWindowActive || existing.status === 'CLOSED',
          },
          created: false,
        };
      }

      // 5. If conversation does NOT exist, only allow creation if within 7-day window
      if (!isWindowActive) {
        return {
          errCode: 7,
          message: 'Thời hạn hỗ trợ sau khám 7 ngày đã kết thúc. Không thể khởi tạo cuộc trò chuyện mới.',
          isFollowUpActive: false,
          consultationCompletedAt: booking.consultationCompletedAt,
          followUpExpiresAt: booking.followUpExpiresAt,
        };
      }

      // 6. Create new conversation
      const { conversation, created } = await chatRepository.getOrCreateConversation({
        bookingId: booking.id,
        patientId: booking.patientId,
        doctorId: booking.doctorId,
      });

      return {
        errCode: 0,
        message: created ? 'Khởi tạo cuộc trò chuyện thành công.' : 'Lấy cuộc trò chuyện thành công.',
        data: {
          ...conversation,
          consultationCompletedAt: booking.consultationCompletedAt,
          followUpExpiresAt: booking.followUpExpiresAt,
          isFollowUpActive: true,
          isReadOnly: false,
        },
        created,
      };
    } catch (err) {
      console.error('Error in getOrCreateConversationForBooking:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi mở cuộc trò chuyện.',
      };
    }
  }

  /**
   * Get cursor-paginated messages for a conversation
   */
  async getConversationMessages(conversationId, user, { beforeCursor, limit }) {
    try {
      const access = await this.verifyConversationAccess(conversationId, user);
      if (!access.authorized) {
        return access.error;
      }

      const result = await chatRepository.findMessagesByCursor(conversationId, {
        beforeCursor,
        limit,
      });

      // Fetch finalized call history for timeline integration
      const callHistory = await callRepository.getCallHistoryByConversation(
        conversationId,
        access.conversation.bookingId
      );
      result.callHistory = callHistory || [];

      const isFollowUpActive = this.isFollowUpWindowActive(access.conversation.bookingData);
      return {
        errCode: 0,
        message: 'Tải lịch sử tin nhắn thành công.',
        data: result,
        meta: {
          isFollowUpActive,
          isReadOnly: !isFollowUpActive || access.conversation.status === 'CLOSED',
          consultationCompletedAt: access.conversation.bookingData?.consultationCompletedAt,
          followUpExpiresAt: access.conversation.bookingData?.followUpExpiresAt,
          callHistory: callHistory || [],
        },
      };
    } catch (err) {
      console.error('Error in getConversationMessages:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi tải tin nhắn.',
      };
    }
  }

  /**
   * Send a chat message with idempotency & closed-conversation guards
   */
  async sendMessage(conversationId, user, { clientMessageId, content, messageType = 'TEXT' }) {
    try {
      // 1. Validate payload
      if (!clientMessageId || typeof clientMessageId !== 'string') {
        return { errCode: 1, message: 'Thiếu mã định danh tin nhắn phía máy khách (clientMessageId).' };
      }

      if (!content || typeof content !== 'string') {
        return { errCode: 1, message: 'Nội dung tin nhắn không được để trống.' };
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        return { errCode: 1, message: 'Nội dung tin nhắn không được để trống.' };
      }

      if (trimmedContent.length > 2000) {
        return { errCode: 1, message: 'Nội dung tin nhắn không được vượt quá 2000 ký tự.' };
      }

      // 2. Check conversation access
      const access = await this.verifyConversationAccess(conversationId, user);
      if (!access.authorized) {
        return access.error;
      }

      const conversation = access.conversation;

      // 3. Conversation lifecycle check: Can't send if CLOSED
      if (conversation.status === 'CLOSED') {
        return {
          errCode: 5,
          message: 'Cuộc trò chuyện đã được bác sĩ kết thúc. Bạn không thể gửi tin nhắn mới trừ khi cuộc trò chuyện được mở lại.',
        };
      }

      // 4. 7-Day Window check: Can't send new messages if expired
      const booking = conversation.bookingData || await db.Booking.findByPk(conversation.bookingId, {
        attributes: ['statusId', 'consultationCompletedAt', 'followUpExpiresAt'],
      });
      if (!this.isFollowUpWindowActive(booking)) {
        return {
          errCode: 7,
          message: 'Thời hạn hỗ trợ sau khám 7 ngày đã kết thúc. Bạn chỉ có thể xem lại lịch sử trò chuyện và không thể gửi tin nhắn mới.',
          isFollowUpActive: false,
        };
      }

      // 5. Persist message via repository
      const { message, isDuplicate } = await chatRepository.saveMessage({
        conversationId,
        senderId: user.id,
        clientMessageId: clientMessageId.trim().substring(0, 100),
        messageType: messageType || 'TEXT',
        content: trimmedContent,
      });

      return {
        errCode: 0,
        message: isDuplicate ? 'Tin nhắn đã tồn tại.' : 'Gửi tin nhắn thành công.',
        data: message,
        conversation,
        isDuplicate,
      };
    } catch (err) {
      console.error('Error in sendMessage:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi lưu tin nhắn.',
      };
    }
  }

  /**
   * Mark messages in conversation as read
   */
  async markAsRead(conversationId, user) {
    try {
      const access = await this.verifyConversationAccess(conversationId, user);
      if (!access.authorized) {
        return access.error;
      }

      const result = await chatRepository.markMessagesAsRead(conversationId, user.id);
      return {
        errCode: 0,
        message: 'Đã đánh dấu tin nhắn là đã đọc.',
        data: result,
      };
    } catch (err) {
      console.error('Error in markAsRead:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi cập nhật trạng thái đã đọc.',
      };
    }
  }

  /**
   * Update conversation status (OPEN / CLOSED)
   * Only the assigned doctor or admin can change the status
   */
  async updateConversationStatus(conversationId, user, status) {
    try {
      if (!['OPEN', 'CLOSED'].includes(status)) {
        return { errCode: 1, message: 'Trạng thái hội thoại không hợp lệ (phải là OPEN hoặc CLOSED).' };
      }

      const access = await this.verifyConversationAccess(conversationId, user);
      if (!access.authorized) {
        return access.error;
      }

      // Only Doctor or Admin can close/reopen
      if (user.roleId !== 'R2' && user.roleId !== 'R1') {
        return {
          errCode: 4,
          message: 'Chỉ bác sĩ phụ trách mới có quyền đóng hoặc mở lại cuộc trò chuyện.',
        };
      }

      const booking = access.conversation.bookingData || await db.Booking.findByPk(access.conversation.bookingId, {
        attributes: ['statusId', 'consultationCompletedAt', 'followUpExpiresAt'],
      });

      // If reopening, MUST be within 7-day window
      if (status === 'OPEN') {
        if (!this.isFollowUpWindowActive(booking)) {
          return {
            errCode: 8,
            message: 'Không thể mở lại cuộc trò chuyện vì thời hạn 7 ngày sau khám đã kết thúc.',
            followUpExpiresAt: booking.followUpExpiresAt,
          };
        }
      }

      const updated = await chatRepository.updateConversationStatus(conversationId, status);

      // If closing, terminate any active CallSessions for this booking
      if (status === 'CLOSED') {
        await callRepository.terminateActiveCallsForBooking(access.conversation.bookingId, 'CONVERSATION_CLOSED');
      }

      return {
        errCode: 0,
        message: `Đã ${status === 'CLOSED' ? 'đóng' : 'mở lại'} cuộc trò chuyện thành công.`,
        data: updated,
      };
    } catch (err) {
      console.error('Error in updateConversationStatus:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi cập nhật trạng thái hội thoại.',
      };
    }
  }
}

module.exports = new ChatService();
