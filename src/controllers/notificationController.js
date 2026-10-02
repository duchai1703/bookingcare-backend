'use strict';

const notificationService = require('../services/notificationService');

const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: 401, errMessage: 'Chưa xác thực người dùng.' });
    }

    const result = await notificationService.getUserNotifications(userId, req.query);
    const status = result.errCode === 0 ? 200 : 500;
    return res.status(status).json(result);
  } catch (err) {
    console.error('getNotifications controller error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ.' });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: 401, errMessage: 'Chưa xác thực người dùng.' });
    }

    const result = await notificationService.getUnreadCount(userId);
    const status = result.errCode === 0 ? 200 : 500;
    return res.status(status).json(result);
  } catch (err) {
    console.error('getUnreadCount controller error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ.' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: 401, errMessage: 'Chưa xác thực người dùng.' });
    }

    const notificationId = req.params.id;
    const result = await notificationService.markAsRead(notificationId, userId);
    let status = 200;
    if (result.errCode === 1) status = 400;
    else if (result.errCode !== 0) status = 500;

    return res.status(status).json(result);
  } catch (err) {
    console.error('markAsRead controller error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ.' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ errCode: 401, errMessage: 'Chưa xác thực người dùng.' });
    }

    const result = await notificationService.markAllAsRead(userId);
    const status = result.errCode === 0 ? 200 : 500;
    return res.status(status).json(result);
  } catch (err) {
    console.error('markAllAsRead controller error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ.' });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
