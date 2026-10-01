'use strict';

const chatService = require('../services/chatService');

const getUserConversations = async (req, res) => {
  try {
    const result = await chatService.getUserConversations(req.user);
    const status = result.errCode === 0 ? 200 : 500;
    return res.status(status).json(result);
  } catch (err) {
    console.error('>>> getUserConversations error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi lấy danh sách cuộc trò chuyện!' });
  }
};

const getOrCreateConversationForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await chatService.getOrCreateConversationForBooking(bookingId, req.user);
    let status = 200;
    if (result.errCode === 1 || result.errCode === 3) status = 400;
    else if (result.errCode === 2) status = 404;
    else if (result.errCode === 4 || result.errCode === 7 || result.errCode === 8) status = 403;
    else if (result.errCode !== 0) status = 400;

    return res.status(status).json(result);
  } catch (err) {
    console.error('>>> getOrCreateConversationForBooking error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi khởi tạo cuộc trò chuyện!' });
  }
};

const getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { beforeCursor, limit } = req.query;
    const result = await chatService.getConversationMessages(conversationId, req.user, {
      beforeCursor,
      limit,
    });

    let status = 200;
    if (result.errCode === 2) status = 404;
    else if (result.errCode === 4) status = 403;
    else if (result.errCode !== 0) status = 400;

    return res.status(status).json(result);
  } catch (err) {
    console.error('>>> getConversationMessages error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi lấy lịch sử tin nhắn!' });
  }
};

const markMessagesAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const result = await chatService.markAsRead(conversationId, req.user);

    let status = 200;
    if (result.errCode === 2) status = 404;
    else if (result.errCode === 4) status = 403;
    else if (result.errCode !== 0) status = 400;

    return res.status(status).json(result);
  } catch (err) {
    console.error('>>> markMessagesAsRead error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi đánh dấu tin nhắn đã đọc!' });
  }
};

const updateConversationStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status: convStatus } = req.body;
    const result = await chatService.updateConversationStatus(conversationId, req.user, convStatus);

    let status = 200;
    if (result.errCode === 2) status = 404;
    else if (result.errCode === 4) status = 403;
    else if (result.errCode !== 0) status = 400;

    return res.status(status).json(result);
  } catch (err) {
    console.error('>>> updateConversationStatus error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi cập nhật trạng thái cuộc trò chuyện!' });
  }
};

module.exports = {
  getUserConversations,
  getOrCreateConversationForBooking,
  getConversationMessages,
  markMessagesAsRead,
  updateConversationStatus,
};
