'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');

/**
 * CallRepository — Data Access Layer for WebRTC Call Sessions
 */
class CallRepository {
  /**
   * Helper: format call session and decode avatars
   */
  formatCallSession(session) {
    if (!session) return null;
    const plain = typeof session.get === 'function' ? session.get({ plain: true }) : { ...session };
    if (plain.caller && plain.caller.image) {
      plain.caller.image = convertBlobToBase64(plain.caller.image);
    }
    if (plain.receiver && plain.receiver.image) {
      plain.receiver.image = convertBlobToBase64(plain.receiver.image);
    }
    return plain;
  }

  /**
   * Find CallSession by UUID callId with associations
   */
  async findByCallId(callId, options = {}) {
    const query = {
      where: { callId },
      include: [
        {
          model: db.User,
          as: 'caller',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
        },
        {
          model: db.User,
          as: 'receiver',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
        },
        {
          model: db.Booking,
          as: 'booking',
          attributes: [
            'id',
            'statusId',
            'date',
            'timeType',
            'patientName',
            'patientPhoneNumber',
            'consultationCompletedAt',
            'followUpExpiresAt',
          ],
        },
      ],
      ...options,
    };

    const session = await db.CallSession.findOne(query);
    return session ? this.formatCallSession(session) : null;
  }

  /**
   * Check if a user currently has any active call session
   * Active statuses: RINGING, CONNECTING, CONNECTED
   */
  async findActiveCallForUser(userId, transaction = null) {
    const activeStatuses = ['RINGING', 'CONNECTING', 'CONNECTED'];
    const session = await db.CallSession.findOne({
      where: {
        [Op.or]: [{ callerId: userId }, { receiverId: userId }],
        status: { [Op.in]: activeStatuses },
      },
      order: [['createdAt', 'DESC']],
      transaction,
    });

    if (session) {
      const now = new Date();
      const ageMs = now.getTime() - new Date(session.createdAt).getTime();

      // Auto-expire stale RINGING call (> 50s)
      if (session.status === 'RINGING' && ageMs > 50 * 1000) {
        await session.update({ status: 'MISSED', endReason: 'TIMEOUT', endedAt: now }, { transaction });
        return null;
      }

      // Auto-expire stale CONNECTING call (> 60s)
      if (session.status === 'CONNECTING' && ageMs > 60 * 1000) {
        await session.update({ status: 'FAILED', endReason: 'CONNECT_TIMEOUT', endedAt: now }, { transaction });
        return null;
      }

      // Auto-expire session exceeding maximum duration (> 65m)
      if (session.status === 'CONNECTED' && ageMs > 65 * 60 * 1000) {
        await session.update({ status: 'EXPIRED', endReason: 'EXPIRED_MAX_DURATION', endedAt: now }, { transaction });
        return null;
      }

      return this.formatCallSession(session);
    }

    return null;
  }

  /**
   * Create a new CallSession with atomic concurrency lock
   */
  async createCallSession(data, transaction = null) {
    const session = await db.CallSession.create(data, { transaction });
    return session.get({ plain: true });
  }

  /**
   * Update CallSession status atomically
   */
  async updateCallStatus(callId, updateData, transaction = null) {
    const session = await db.CallSession.findOne({
      where: { callId },
      include: [
        {
          model: db.User,
          as: 'caller',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
        },
        {
          model: db.User,
          as: 'receiver',
          attributes: ['id', 'email', 'firstName', 'lastName', 'image', 'roleId'],
        },
      ],
      transaction,
    });
    if (!session) return null;

    await session.update(updateData, { transaction });
    return this.formatCallSession(session);
  }

  /**
   * Terminate all active calls for a booking or conversation (e.g. when conversation CLOSED)
   */
  async terminateActiveCallsForBooking(bookingId, endReason = 'CONVERSATION_CLOSED') {
    const activeStatuses = ['RINGING', 'CONNECTING', 'CONNECTED'];
    const now = new Date();

    const [updatedCount] = await db.CallSession.update(
      {
        status: 'ENDED',
        endReason,
        endedAt: now,
      },
      {
        where: {
          bookingId,
          status: { [Op.in]: activeStatuses },
        },
      }
    );

    return updatedCount;
  }

  /**
   * Get call history for a booking
   */
  async getCallHistoryByBooking(bookingId, limit = 20) {
    const sessions = await db.CallSession.findAll({
      where: { bookingId },
      include: [
        {
          model: db.User,
          as: 'caller',
          attributes: ['id', 'firstName', 'lastName', 'image', 'roleId'],
        },
        {
          model: db.User,
          as: 'receiver',
          attributes: ['id', 'firstName', 'lastName', 'image', 'roleId'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });
    return sessions.map(s => this.formatCallSession(s));
  }

  /**
   * Get finalized call history for a conversation / booking
   */
  async getCallHistoryByConversation(conversationId, bookingId = null, limit = 50) {
    const orConditions = [];
    if (conversationId) orConditions.push({ conversationId });
    if (bookingId) orConditions.push({ bookingId });

    if (orConditions.length === 0) return [];

    const terminalStatuses = ['CONNECTED', 'ENDED', 'REJECTED', 'MISSED', 'CANCELLED', 'FAILED', 'EXPIRED'];
    const sessions = await db.CallSession.findAll({
      where: {
        [Op.or]: orConditions,
        status: { [Op.in]: terminalStatuses },
      },
      include: [
        {
          model: db.User,
          as: 'caller',
          attributes: ['id', 'firstName', 'lastName', 'image', 'roleId'],
        },
        {
          model: db.User,
          as: 'receiver',
          attributes: ['id', 'firstName', 'lastName', 'image', 'roleId'],
        },
      ],
      order: [['createdAt', 'ASC']],
      limit,
    });
    return sessions.map(s => this.formatCallSession(s));
  }
}

module.exports = new CallRepository();
