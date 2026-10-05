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
   * [Phase 3] Tự động truyền familyMemberId nếu booking là cho người thân
   */
  async getOrCreateConversationForBooking(bookingId, user) {
    try {
      if (!bookingId) {
        return { errCode: 1, message: 'Thiếu mã lịch khám (bookingId).' };
      }

      // 1. Fetch Booking + family member data
      const booking = await db.Booking.findOne({
        where: { id: bookingId },
        include: [
          {
            model: db.Allcode,
            as: 'statusData',
            attributes: ['valueEn', 'valueVi'],
          },
          {
            model: db.Family_Member,
            as: 'familyMemberData',
            attributes: ['id', 'fullName', 'relationship', 'gender', 'birthday', 'phoneNumber', 'medicalHistory'],
            required: false,
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

      // [Phase 3] Xây dựng familyContext để hiển thị Medical Banner
      const isFamilyBooking = booking.bookingFor === 'FAMILY' && booking.familyMemberId;
      const familyMember = booking.familyMemberData || null;
      const familyContext = isFamilyBooking && familyMember
        ? {
            isFamilyBooking: true,
            familyMemberId: booking.familyMemberId,
            patientName: familyMember.fullName || 'Người thân',
            relationship: familyMember.relationship || 'RELATIVE',
            gender: familyMember.gender || null,
            birthday: familyMember.birthday || null,
            medicalHistory: familyMember.medicalHistory || null,
          }
        : { isFamilyBooking: false };

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
            familyContext,
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

      // 6. Create new conversation — truyền familyMemberId nếu là family booking
      const { conversation, created } = await chatRepository.getOrCreateConversation({
        bookingId: booking.id,
        patientId: booking.patientId,
        doctorId: booking.doctorId,
        familyMemberId: isFamilyBooking ? booking.familyMemberId : null,
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
          familyContext,
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

  /**
   * [Post-Consultation Care Workspace]
   * Lấy toàn bộ ngữ cảnh lâm sàng (Clinical Encounter Context) cho Bác sĩ:
   * - Patient Identity (Bệnh nhân thực tế vs Chủ tài khoản)
   * - Encounter Snapshot (Chẩn đoán, Dặn dò, Kê đơn, Đính kèm)
   * - Follow-up Status (Đếm ngược thời gian)
   * - Call History
   */
  async getConversationWorkspace(conversationId, user) {
    try {
      const access = await this.verifyConversationAccess(conversationId, user);
      if (!access.authorized) {
        return access.error;
      }

      const conv = await db.Conversation.findOne({
        where: { id: conversationId },
        include: [
          {
            model: db.User,
            as: 'patientUser',
            attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'phoneNumber', 'gender', 'address'],
          },
          {
            model: db.User,
            as: 'doctorUser',
            attributes: ['id', 'email', 'firstName', 'lastName', 'image'],
          },
          {
            model: db.Booking,
            as: 'bookingData',
            include: [
              {
                model: db.Allcode,
                as: 'timeTypeBooking',
                attributes: ['valueEn', 'valueVi'],
              },
              {
                model: db.Allcode,
                as: 'statusData',
                attributes: ['valueEn', 'valueVi'],
              },
              {
                model: db.Family_Member,
                as: 'familyMemberData',
                required: false,
              },
              {
                model: db.Clinic,
                as: 'clinicData',
                attributes: ['id', 'name', 'address', 'image'],
                required: false,
              },
              {
                model: db.Doctor_Assignment,
                as: 'assignmentData',
                include: [
                  {
                    model: db.Specialty,
                    as: 'specialtyData',
                    attributes: ['id', 'name'],
                  },
                ],
                required: false,
              },
              {
                model: db.BookingMedicine,
                as: 'bookingMedicines',
                attributes: ['id', 'quantity', 'dosage', 'usageInstructions'],
                include: [
                  {
                    model: db.Medicine,
                    as: 'medicineData',
                    attributes: ['id', 'name', 'unit', 'concentration', 'activeIngredient'],
                  },
                ],
                required: false,
              },
              {
                model: db.BookingAttachment,
                as: 'attachments',
                attributes: ['id', 'fileName', 'fileType', 'fileSize', 'fileData', 'category', 'uploadedBy', 'examinationDate', 'note', 'createdAt'],
                required: false,
              },
              {
                model: db.CallSession,
                as: 'callSessions',
                attributes: ['id', 'callType', 'duration', 'status', 'createdAt', 'startedAt', 'endedAt', 'callerId', 'receiverId'],
                required: false,
              },
            ],
          },
        ],
      });

      if (!conv) {
        return { errCode: 2, message: 'Không tìm thấy cuộc trò chuyện.' };
      }

      const plain = typeof conv.get === 'function' ? conv.get({ plain: true }) : { ...conv };
      const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');
      if (plain.patientUser?.image) {
        plain.patientUser.image = convertBlobToBase64(plain.patientUser.image);
      }
      if (plain.doctorUser?.image) {
        plain.doctorUser.image = convertBlobToBase64(plain.doctorUser.image);
      }

      const booking = plain.bookingData || {};
      const familyMember = booking.familyMemberData;
      const patientUser = plain.patientUser || {};
      const isFamily = Boolean(booking.familyMemberId || booking.bookingFor === 'FAMILY');

      // 1. Phân giải Patient Identity (Bệnh nhân thực tế vs Chủ tài khoản)
      let actualPatient = {};
      const accountOwner = {
        id: patientUser.id,
        name: `${patientUser.lastName || ''} ${patientUser.firstName || ''}`.trim() || patientUser.email,
        phone: patientUser.phoneNumber || '',
        email: patientUser.email || '',
        address: patientUser.address || '',
        image: patientUser.image || null,
        relationshipLabel: isFamily ? (booking.relationship || familyMember?.relationship || 'Người thân') : 'Chính chủ tài khoản',
      };

      const genderMap = { G1: 'Nam', G2: 'Nữ', G3: 'Khác', M: 'Nam', F: 'Nữ' };

      if (isFamily && familyMember) {
        let age = null;
        if (familyMember.birthday) {
          const birthYear = parseInt(familyMember.birthday.split('-')[0], 10);
          if (!isNaN(birthYear)) age = new Date().getFullYear() - birthYear;
        }

        actualPatient = {
          id: familyMember.id,
          name: familyMember.fullName || booking.patientName || 'Bệnh nhân',
          relationship: familyMember.relationship,
          relationshipLabel: familyMember.relationship === 'CHILD' ? 'Con'
            : familyMember.relationship === 'PARENT' ? 'Bố/Mẹ'
            : familyMember.relationship === 'SPOUSE' ? 'Vợ/Chồng'
            : 'Người thân',
          gender: genderMap[familyMember.gender] || familyMember.gender || 'Chưa rõ',
          birthday: familyMember.birthday || '',
          age: age,
          phoneNumber: familyMember.phoneNumber || booking.patientPhoneNumber || '',
          address: familyMember.address || booking.patientAddress || '',
          medicalHistory: familyMember.medicalHistory || 'Chưa ghi nhận tiền sử dị ứng hoặc bệnh bẩm sinh đặc biệt',
          notes: familyMember.notes || '',
        };
      } else {
        let age = null;
        if (booking.patientBirthday) {
          const birthYear = parseInt(booking.patientBirthday.split('-')[0], 10);
          if (!isNaN(birthYear)) age = new Date().getFullYear() - birthYear;
        }
        actualPatient = {
          id: patientUser.id,
          name: `${patientUser.lastName || ''} ${patientUser.firstName || ''}`.trim() || booking.patientName || patientUser.email,
          relationship: 'SELF',
          relationshipLabel: 'Chính chủ tài khoản',
          gender: genderMap[booking.patientGender] || genderMap[patientUser.gender] || 'Chưa rõ',
          birthday: booking.patientBirthday || '',
          age: age,
          phoneNumber: booking.patientPhoneNumber || patientUser.phoneNumber || '',
          address: booking.patientAddress || patientUser.address || '',
          medicalHistory: booking.clinicalNotes || 'Khám cho bản thân',
          notes: '',
        };
      }

      // 2. Phân giải Encounter Context & Follow-up status
      const isFollowUpActive = this.isFollowUpWindowActive(booking);
      let remainingHours = 0;
      let remainingDays = 0;
      if (booking.followUpExpiresAt && isFollowUpActive) {
        const diffMs = new Date(booking.followUpExpiresAt) - new Date();
        remainingHours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
        remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      const medicines = (booking.bookingMedicines || []).map((bm) => ({
        id: bm.id,
        name: bm.medicineData?.name || 'Thuốc theo chỉ định',
        unit: bm.medicineData?.unit || 'viên',
        quantity: bm.quantity || 1,
        dosage: bm.dosage || '',
        frequency: bm.frequency || '',
        instructions: bm.instructions || bm.medicineData?.usageInstructions || '',
      }));

      const encounter = {
        bookingId: booking.id,
        date: booking.date,
        timeType: booking.timeType,
        timeLabel: booking.timeTypeBooking?.valueVi || booking.timeTypeBooking?.valueEn || booking.timeType,
        statusId: booking.statusId,
        statusLabel: booking.statusData?.valueVi || 'Đã hoàn tất khám',
        clinicName: booking.clinicData?.name || 'Cơ sở Y tế BookingCare',
        clinicAddress: booking.clinicData?.address || '',
        roomNumber: booking.assignmentData?.roomNumber || 'Phòng khám chuyên khoa',
        specialtyName: booking.assignmentData?.specialtyData?.name || 'Chuyên khoa Y tế',
        chiefComplaint: booking.chiefComplaint || booking.reason || 'Khám theo lịch hẹn',
        symptoms: booking.symptoms || '',
        clinicalNotes: booking.clinicalNotes || '',
        diagnosis: booking.diagnosis || 'Đang theo dõi sức khỏe tổng quát',
        treatmentPlan: booking.treatmentPlan || '',
        careInstructions: booking.careInstructions || 'Nghỉ ngơi, theo dõi sức khỏe và liên hệ lại bác sĩ nếu triệu chứng tiếp diễn.',
        followUpDate: booking.followUpDate || '',
        consultationCompletedAt: booking.consultationCompletedAt,
        followUpExpiresAt: booking.followUpExpiresAt,
        isFollowUpActive,
        remainingDays,
        remainingHours,
        medicines,
        attachments: booking.attachments || [],
      };

      return {
        errCode: 0,
        message: 'Lấy dữ liệu không gian chăm sóc sau khám thành công.',
        data: {
          conversation: {
            id: plain.id,
            bookingId: plain.bookingId,
            doctorId: plain.doctorId,
            patientId: plain.patientId,
            status: plain.status,
            lastMessageAt: plain.lastMessageAt,
            isFollowUpActive,
            isReadOnly: !isFollowUpActive || plain.status === 'CLOSED',
          },
          patientIdentity: {
            isFamilyMember: isFamily,
            actualPatient,
            accountOwner,
          },
          encounter,
          callHistory: booking.callSessions || [],
        },
      };
    } catch (err) {
      console.error('Error in getConversationWorkspace:', err);
      return {
        errCode: -1,
        message: 'Lỗi máy chủ khi lấy dữ liệu không gian chăm sóc sau khám.',
      };
    }
  }
}

module.exports = new ChatService();
