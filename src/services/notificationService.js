'use strict';

const notificationRepository = require('../repositories/notificationRepository');

/**
 * NotificationService — Business logic & Real-time Dispatch for Global Notifications
 */
class NotificationService {
  /**
   * Persist canonical notification and emit to user room via Socket.IO
   */
  async createAndSendNotification({
    recipientId,
    type,
    title,
    message,
    entityType = null,
    entityId = null,
    data = null,
  }) {
    if (!recipientId || !type || !title || !message) {
      console.warn('[NOTIFICATION SERVICE] Missing required fields for notification:', { recipientId, type });
      return null;
    }

    try {
      // 1. Persist to database (Source of Truth)
      const notification = await notificationRepository.create({
        recipientId: Number(recipientId),
        type,
        title,
        message,
        entityType,
        entityId: entityId ? String(entityId) : null,
        data,
        isRead: false,
      });

      // 2. Compute current unread count
      const unreadCount = await notificationRepository.getUnreadCount(Number(recipientId));

      // 3. Emit Real-time Socket event to exact recipient room
      try {
        const { getIO } = require('../realtime');
        const io = getIO();
        const roomName = `user_${recipientId}`;
        io.to(roomName).emit('notification:new', {
          notification,
          unreadCount,
        });
      } catch (ioErr) {
        // Socket may not be initialized in test runner or worker process
        console.warn('[NOTIFICATION REALTIME WARNING] Unable to emit notification:new:', ioErr.message);
      }

      return notification;
    } catch (err) {
      console.error('[NOTIFICATION SERVICE ERROR] Failed to create notification:', err);
      return null;
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(userId, query = {}) {
    try {
      const recipientId = Number(userId);
      const limit = parseInt(query.limit, 10) || 20;
      const offset = parseInt(query.offset, 10) || 0;
      const isRead = query.isRead !== undefined ? query.isRead === 'true' : null;

      const result = await notificationRepository.getUserNotifications(recipientId, {
        limit,
        offset,
        isRead,
      });

      return {
        errCode: 0,
        errMessage: 'OK',
        data: result,
      };
    } catch (err) {
      console.error('[NOTIFICATION SERVICE ERROR] getUserNotifications error:', err);
      return {
        errCode: -1,
        errMessage: 'Lỗi máy chủ khi lấy danh sách thông báo.',
      };
    }
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId) {
    try {
      const recipientId = Number(userId);
      const count = await notificationRepository.getUnreadCount(recipientId);
      return {
        errCode: 0,
        errMessage: 'OK',
        data: { unreadCount: count },
      };
    } catch (err) {
      console.error('[NOTIFICATION SERVICE ERROR] getUnreadCount error:', err);
      return {
        errCode: -1,
        errMessage: 'Lỗi máy chủ khi đếm thông báo chưa đọc.',
      };
    }
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const id = parseInt(notificationId, 10);
      const recipientId = Number(userId);

      if (!id || isNaN(id)) {
        return { errCode: 1, errMessage: 'Mã thông báo không hợp lệ.' };
      }

      const result = await notificationRepository.markAsRead(id, recipientId);

      // Emit realtime sync across multiple tabs of the same user
      try {
        const { getIO } = require('../realtime');
        const io = getIO();
        io.to(`user_${recipientId}`).emit('notification:updated', {
          id,
          isRead: true,
          unreadCount: result.unreadCount,
        });
      } catch (ioErr) {
        // Safe fallback
      }

      return {
        errCode: 0,
        errMessage: 'OK',
        data: result,
      };
    } catch (err) {
      console.error('[NOTIFICATION SERVICE ERROR] markAsRead error:', err);
      return {
        errCode: -1,
        errMessage: 'Lỗi máy chủ khi đánh dấu đã đọc.',
      };
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    try {
      const recipientId = Number(userId);
      const result = await notificationRepository.markAllAsRead(recipientId);

      // Emit realtime sync across multiple tabs
      try {
        const { getIO } = require('../realtime');
        const io = getIO();
        io.to(`user_${recipientId}`).emit('notification:read-all', {
          unreadCount: 0,
        });
      } catch (ioErr) {
        // Safe fallback
      }

      return {
        errCode: 0,
        errMessage: 'OK',
        data: result,
      };
    } catch (err) {
      console.error('[NOTIFICATION SERVICE ERROR] markAllAsRead error:', err);
      return {
        errCode: -1,
        errMessage: 'Lỗi máy chủ khi đánh dấu tất cả đã đọc.',
      };
    }
  }
}

module.exports = new NotificationService();
