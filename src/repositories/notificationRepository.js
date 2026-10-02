'use strict';

const { Op } = require('sequelize');
const db = require('../models');

/**
 * NotificationRepository — Data Access Layer for Global Notifications
 */
class NotificationRepository {
  /**
   * Create a new notification record
   */
  async create(data, transaction = null) {
    const options = transaction ? { transaction } : {};
    const notification = await db.Notification.create(data, options);
    return notification ? notification.get({ plain: true }) : null;
  }

  /**
   * Find notification by ID scoped to recipient
   */
  async findById(id, recipientId) {
    const notification = await db.Notification.findOne({
      where: {
        id,
        recipientId,
      },
    });
    return notification ? notification.get({ plain: true }) : null;
  }

  /**
   * Get paginated notifications for a recipient
   */
  async getUserNotifications(recipientId, { limit = 20, offset = 0, isRead = null } = {}) {
    const where = { recipientId };
    if (isRead !== null && isRead !== undefined) {
      where.isRead = Boolean(isRead);
    }

    const { count, rows } = await db.Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(Math.max(1, parseInt(limit, 10) || 20), 50),
      offset: Math.max(0, parseInt(offset, 10) || 0),
    });

    const plainRows = rows.map((r) => r.get({ plain: true }));
    const unreadCount = await this.getUnreadCount(recipientId);

    return {
      total: count,
      count,
      unreadCount,
      rows: plainRows,
      notifications: plainRows,
    };
  }

  /**
   * Get unread notification count for a recipient
   */
  async getUnreadCount(recipientId) {
    return await db.Notification.count({
      where: {
        recipientId,
        isRead: false,
      },
    });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id, recipientId) {
    const [affectedRows] = await db.Notification.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: {
          id,
          recipientId,
          isRead: false,
        },
      }
    );

    const updated = await this.findById(id, recipientId);
    const unreadCount = await this.getUnreadCount(recipientId);

    return {
      success: affectedRows > 0 || Boolean(updated && updated.isRead),
      notification: updated,
      unreadCount,
    };
  }

  /**
   * Mark all notifications as read for a recipient
   */
  async markAllAsRead(recipientId) {
    const [affectedCount] = await db.Notification.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: {
          recipientId,
          isRead: false,
        },
      }
    );

    return {
      success: true,
      affectedCount,
      unreadCount: 0,
    };
  }
}

module.exports = new NotificationRepository();
