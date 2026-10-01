'use strict';

const { Op } = require('sequelize');
const db = require('../models');

/**
 * CallRepository — Data Access Layer for WebRTC Call Sessions
 */
class CallRepository {
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
    return session ? session.get({ plain: true }) : null;
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

      return session.get({ plain: true });
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
    const session = await db.CallSession.findOne({ where: { callId }, transaction });
    if (!session) return null;

    await session.update(updateData, { transaction });
    return session.get({ plain: true });
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
    return sessions.map(s => s.get({ plain: true }));
  }
}

module.exports = new CallRepository();
