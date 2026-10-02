'use strict';

const chatService = require('../services/chatService');
const notificationService = require('../services/notificationService');

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

    if (result.errCode === 0) {
      try {
        const { getIO } = require('../realtime');
        const io = getIO();
        const conv = result.data;
        const convIdNum = parseInt(conversationId, 10);
        io.to(`conversation_${convIdNum}`).emit('chat:conversation:status', {
          conversationId: convIdNum,
          status: convStatus,
        });
        if (conv?.patientId) {
          io.to(`user_${conv.patientId}`).emit('chat:conversation:status', {
            conversationId: convIdNum,
            status: convStatus,
          });
        }
        if (conv?.doctorId) {
          io.to(`user_${conv.doctorId}`).emit('chat:conversation:status', {
            conversationId: convIdNum,
            status: convStatus,
          });
        }

        // Nếu bác sĩ mở lại cuộc trò chuyện (status === 'OPEN'), gửi thông báo cho Bệnh nhân
        if (convStatus === 'OPEN' && conv?.patientId) {
          try {
            await notificationService.createAndSendNotification({
              recipientId: conv.patientId,
              type: 'CONVERSATION_REOPENED',
              title: 'Cuộc trò chuyện đã được mở lại',
              message: 'Bác sĩ đã mở lại cuộc hội thoại tư vấn sau khám với bạn.',
              entityType: 'CONVERSATION',
              entityId: convIdNum,
              data: {
                conversationId: convIdNum,
                doctorId: conv.doctorId,
              },
            });
          } catch (notifErr) {
            console.warn('>>> [NOTIFICATION_WARNING] Không gửi được thông báo mở lại hội thoại:', notifErr.message);
          }
        }
      } catch (ioErr) {
        console.error('Socket broadcast error in updateConversationStatus:', ioErr);
      }
    }

    return res.status(status).json(result);
  } catch (err) {
    console.error('>>> updateConversationStatus error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi cập nhật trạng thái cuộc trò chuyện!' });
  }
};

const callService = require('../services/callService');
const callRepository = require('../repositories/callRepository');

const getIceServers = async (req, res) => {
  try {
    const iceServers = callService.getIceServers();
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy cấu hình máy chủ WebRTC ICE thành công.',
      data: { iceServers },
    });
  } catch (err) {
    console.error('>>> getIceServers error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi lấy cấu hình ICE.' });
  }
};

const getBookingCallHistory = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const history = await callRepository.getCallHistoryByBooking(bookingId);
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy lịch sử cuộc gọi thành công.',
      data: history,
    });
  } catch (err) {
    console.error('>>> getBookingCallHistory error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi lấy lịch sử cuộc gọi.' });
  }
};

const getActiveCall = async (req, res) => {
  try {
    const active = await callRepository.findActiveCallForUser(req.user.id);
    return res.status(200).json({
      errCode: 0,
      message: 'Kiểm tra cuộc gọi hiện tại thành công.',
      data: active,
    });
  } catch (err) {
    console.error('>>> getActiveCall error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server khi kiểm tra cuộc gọi hiện tại.' });
  }
};

module.exports = {
  getUserConversations,
  getOrCreateConversationForBooking,
  getConversationMessages,
  markMessagesAsRead,
  updateConversationStatus,
  getIceServers,
  getBookingCallHistory,
  getActiveCall,
};
