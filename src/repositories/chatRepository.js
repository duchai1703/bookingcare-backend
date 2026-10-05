'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');

/**
 * ChatRepository — Data Access Layer for Conversations and ChatMessages
 * Completely decouples Sequelize ORM operations from Business Services and Socket Handlers.
 */
class ChatRepository {
  /**
   * Helper: format conversation and decode user avatar images
   */
  formatConversation(conv) {
    if (!conv) return null;
    const plain = typeof conv.get === 'function' ? conv.get({ plain: true }) : { ...conv };
    if (plain.patientUser && plain.patientUser.image) {
      plain.patientUser.image = convertBlobToBase64(plain.patientUser.image);
    }
    if (plain.doctorUser && plain.doctorUser.image) {
      plain.doctorUser.image = convertBlobToBase64(plain.doctorUser.image);
    }
    return plain;
  }

  /**
   * Helper: format message and decode sender avatar image
   */
  formatMessage(msg) {
    if (!msg) return null;
    const plain = typeof msg.get === 'function' ? msg.get({ plain: true }) : { ...msg };
    if (plain.sender && plain.sender.image) {
      plain.sender.image = convertBlobToBase64(plain.sender.image);
    }
    return plain;
  }

  /**
   * Find conversation by ID with optional associations
   */
  async findConversationById(conversationId, options = {}) {
    const queryOptions = {
      where: { id: conversationId },
      include: [
        {
          model: db.User,
          as: 'patientUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'phoneNumber'],
        },
        {
          model: db.User,
          as: 'doctorUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image'],
          include: [
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['specialtyId', 'clinicId'],
              include: [
                { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
                { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
              ],
            },
          ],
        },
        {
          model: db.Booking,
          as: 'bookingData',
          attributes: [
            'id',
            'statusId',
            'date',
            'timeType',
            'patientName',
            'patientPhoneNumber',
            'diagnosis',
            'treatmentPlan',
            'careInstructions',
            'encounterStatus',
            'consultationCompletedAt',
            'followUpExpiresAt',
          ],
          include: [
            {
              model: db.Allcode,
              as: 'timeTypeBooking',
              attributes: ['valueEn', 'valueVi'],
            },
          ],
        },
      ],
      ...options,
    };

    const conv = await db.Conversation.findOne(queryOptions);
    return conv ? this.formatConversation(conv) : null;
  }

  /**
   * Find conversation by Booking ID
   */
  async findConversationByBookingId(bookingId) {
    const conv = await db.Conversation.findOne({
      where: { bookingId },
      include: [
        {
          model: db.User,
          as: 'patientUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image'],
        },
        {
          model: db.User,
          as: 'doctorUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image'],
        },
        {
          model: db.Booking,
          as: 'bookingData',
          attributes: ['id', 'statusId', 'date', 'timeType', 'patientName', 'encounterStatus', 'consultationCompletedAt', 'followUpExpiresAt'],
        },
      ],
    });
    return conv ? this.formatConversation(conv) : null;
  }

  /**
   * Idempotent Get or Create Conversation for a Booking
   * [Phase 3] Nhận familyMemberId để gắn với người thân cụ thể khi booking là FAMILY
   */
  async getOrCreateConversation({ bookingId, patientId, doctorId, familyMemberId = null }) {
    const existing = await this.findConversationByBookingId(bookingId);
    if (existing) {
      return { conversation: existing, created: false };
    }

    try {
      const [record, created] = await db.Conversation.findOrCreate({
        where: { bookingId },
        defaults: {
          bookingId,
          patientId,
          doctorId,
          familyMemberId: familyMemberId || null,
          status: 'OPEN',
          lastMessageAt: new Date(),
        },
      });

      const fullConv = await this.findConversationById(record.id);
      return { conversation: fullConv, created };
    } catch (err) {
      // In case of race condition on unique bookingId constraint
      const fallback = await this.findConversationByBookingId(bookingId);
      if (fallback) {
        return { conversation: fallback, created: false };
      }
      throw err;
    }
  }

  /**
   * Get list of conversations for a user (patient or doctor)
   */
  async getConversationsByUser(userId, roleId) {
    const where = {};
    if (roleId === 'R2') {
      // Doctor
      where.doctorId = userId;
    } else if (roleId === 'R3') {
      // Patient
      where.patientId = userId;
    } else {
      // Admin or specific query
      where[Op.or] = [{ patientId: userId }, { doctorId: userId }];
    }

    const conversations = await db.Conversation.findAll({
      where,
      include: [
        {
          model: db.User,
          as: 'patientUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'phoneNumber'],
        },
        {
          model: db.User,
          as: 'doctorUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image'],
          include: [
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['specialtyId', 'clinicId'],
              include: [
                { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
              ],
            },
          ],
        },
        {
          model: db.Booking,
          as: 'bookingData',
          attributes: [
            'id',
            'statusId',
            'date',
            'timeType',
            'patientName',
            'patientPhoneNumber',
            'bookingFor',
            'familyMemberId',
            'relationship',
            'diagnosis',
            'encounterStatus',
            'consultationCompletedAt',
            'followUpExpiresAt',
          ],
          include: [
            {
              model: db.Allcode,
              as: 'timeTypeBooking',
              attributes: ['valueEn', 'valueVi'],
            },
            {
              model: db.Family_Member,
              as: 'familyMemberData',
              attributes: ['id', 'fullName', 'relationship', 'gender', 'birthday', 'phoneNumber'],
              required: false,
            },
          ],
        },
      ],
      order: [
        ['lastMessageAt', 'DESC NULLS LAST'],
        ['updatedAt', 'DESC'],
      ],
    });

    const plainConversations = conversations.map(c => this.formatConversation(c));

    // Attach latest message, unread count and enriched patient identity for each conversation
    for (const conv of plainConversations) {
      const latestMsg = await db.ChatMessage.findOne({
        where: { conversationId: conv.id },
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'senderId', 'content', 'messageType', 'createdAt', 'readAt'],
      });
      conv.latestMessage = latestMsg ? latestMsg.get({ plain: true }) : null;

      const unreadCount = await db.ChatMessage.count({
        where: {
          conversationId: conv.id,
          senderId: { [Op.ne]: userId },
          readAt: null,
        },
      });
      conv.unreadCount = unreadCount;

      // Enrich 3-tier patient identity for list view
      const booking = conv.bookingData;
      const isFamily = Boolean(booking?.familyMemberId || booking?.bookingFor === 'FAMILY');
      const accountOwnerName = conv.patientUser
        ? `${conv.patientUser.lastName || ''} ${conv.patientUser.firstName || ''}`.trim() || conv.patientUser.email
        : 'Chủ tài khoản';

      const actualPatientName = isFamily && booking?.familyMemberData?.fullName
        ? booking.familyMemberData.fullName
        : (booking?.patientName || accountOwnerName);

      conv.patientIdentity = {
        isFamilyMember: isFamily,
        actualPatientName,
        accountOwnerName,
        relationship: booking?.familyMemberData?.relationship || booking?.relationship || (isFamily ? 'NGUOI_THAN' : 'SELF'),
        gender: booking?.familyMemberData?.gender || booking?.patientGender,
        birthday: booking?.familyMemberData?.birthday,
      };
    }

    return plainConversations;
  }

  /**
   * Save a chat message with idempotency safety & update conversation.lastMessageAt in a transaction
   */
  async saveMessage({ conversationId, senderId, clientMessageId, messageType = 'TEXT', content }) {
    const existing = await db.ChatMessage.findOne({
      where: { conversationId, senderId, clientMessageId },
    });
    if (existing) {
      return { message: existing.get({ plain: true }), isDuplicate: true };
    }

    const t = await db.sequelize.transaction();
    try {
      const newMsg = await db.ChatMessage.create(
        {
          conversationId,
          senderId,
          clientMessageId,
          messageType,
          content,
          readAt: null,
        },
        { transaction: t }
      );

      await db.Conversation.update(
        { lastMessageAt: newMsg.createdAt },
        { where: { id: conversationId }, transaction: t }
      );

      await t.commit();

      const messageWithSender = await db.ChatMessage.findOne({
        where: { id: newMsg.id },
        include: [
          {
            model: db.User,
            as: 'sender',
            attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
          },
        ],
      });

      return {
        message: messageWithSender ? this.formatMessage(messageWithSender) : this.formatMessage(newMsg),
        isDuplicate: false,
      };
    } catch (err) {
      await t.rollback();

      // If duplicate key error occurred due to concurrent insert
      if (err.name === 'SequelizeUniqueConstraintError') {
        const raceExisting = await db.ChatMessage.findOne({
          where: { conversationId, senderId, clientMessageId },
          include: [
            {
              model: db.User,
              as: 'sender',
              attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
            },
          ],
        });
        if (raceExisting) {
          return { message: this.formatMessage(raceExisting), isDuplicate: true };
        }
      }
      throw err;
    }
  }

  /**
   * Cursor-based message pagination
   * Returns messages chronologically ordered (ASC) up to limit
   */
  async findMessagesByCursor(conversationId, { beforeCursor = null, limit = 30 }) {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const where = { conversationId };

    if (beforeCursor) {
      const cursorDate = new Date(beforeCursor);
      if (!isNaN(cursorDate.getTime())) {
        where.createdAt = { [Op.lt]: cursorDate };
      }
    }

    const messages = await db.ChatMessage.findAll({
      where,
      limit: parsedLimit + 1, // fetch 1 extra to check hasMore
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: db.User,
          as: 'sender',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
        },
      ],
    });

    const hasMore = messages.length > parsedLimit;
    const resultMessages = hasMore ? messages.slice(0, parsedLimit) : messages;

    // Convert to plain and sort ASC for client chronological render
    const plainMessages = resultMessages
      .map(m => this.formatMessage(m))
      .reverse();

    const nextCursor = hasMore && plainMessages.length > 0 ? plainMessages[0].createdAt : null;

    return {
      messages: plainMessages,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Mark messages as read by reader
   */
  async markMessagesAsRead(conversationId, readerId) {
    const now = new Date();
    const [updatedCount] = await db.ChatMessage.update(
      { readAt: now },
      {
        where: {
          conversationId,
          senderId: { [Op.ne]: readerId },
          readAt: null,
        },
      }
    );

    return { updatedCount, readAt: now };
  }

  /**
   * Update conversation status (OPEN / CLOSED)
   */
  async updateConversationStatus(conversationId, status) {
    await db.Conversation.update(
      { status },
      { where: { id: conversationId } }
    );
    return this.findConversationById(conversationId);
  }

  /**
   * Get unread count for user in conversation
   */
  async getUnreadCount(conversationId, userId) {
    return db.ChatMessage.count({
      where: {
        conversationId,
        senderId: { [Op.ne]: userId },
        readAt: null,
      },
    });
  }
}

module.exports = new ChatRepository();
