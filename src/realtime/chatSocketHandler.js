'use strict';

const chatService = require('../services/chatService');

/**
 * ChatSocketHandler — Manages real-time Socket.IO events for Post-Consultation Chat
 * strictly enforces server-side authorization before room membership or message dispatch.
 */
function registerChatSocketHandlers(io, socket) {
  const user = socket.user;
  const userRoom = `user_${user.id}`;
  socket.join(userRoom);

  // ─────────────────────────────────────────────────────
  // 1. Join Conversation Room
  // ─────────────────────────────────────────────────────
  socket.on('chat:conversation:join', async (payload, callback) => {
    try {
      const ack = typeof callback === 'function' ? callback : () => {};
      const conversationId = parseInt(payload?.conversationId, 10);

      if (!conversationId || isNaN(conversationId)) {
        ack({ success: false, error: 'Mã cuộc trò chuyện (conversationId) không hợp lệ.' });
        return;
      }

      // Verify access before allowing room entry
      const access = await chatService.verifyConversationAccess(conversationId, user);
      if (!access.authorized) {
        ack({ success: false, error: access.error?.message || 'Không có quyền tham gia cuộc trò chuyện này.' });
        socket.emit('chat:error', { message: access.error?.message, conversationId });
        return;
      }

      const roomName = `conversation_${conversationId}`;
      socket.join(roomName);
      ack({ success: true, conversationId, status: access.conversation.status });
    } catch (err) {
      console.error('Error in chat:conversation:join:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Lỗi máy chủ khi tham gia phòng trò chuyện.' });
      }
    }
  });

  // ─────────────────────────────────────────────────────
  // 2. Leave Conversation Room
  // ─────────────────────────────────────────────────────
  socket.on('chat:conversation:leave', (payload, callback) => {
    try {
      const ack = typeof callback === 'function' ? callback : () => {};
      const conversationId = parseInt(payload?.conversationId, 10);

      if (conversationId && !isNaN(conversationId)) {
        const roomName = `conversation_${conversationId}`;
        socket.leave(roomName);
      }
      ack({ success: true });
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ success: false });
      }
    }
  });

  // ─────────────────────────────────────────────────────
  // 3. Send Message: Persist Before Broadcast
  // ─────────────────────────────────────────────────────
  socket.on('chat:message:send', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const conversationId = parseInt(payload?.conversationId, 10);
      const clientMessageId = payload?.clientMessageId;
      const content = payload?.content;
      const messageType = payload?.messageType || 'TEXT';

      if (!conversationId || isNaN(conversationId)) {
        ack({ success: false, error: 'Mã cuộc trò chuyện không hợp lệ.' });
        return;
      }

      // Persist through ChatService (validates access, status, content length, idempotency)
      const result = await chatService.sendMessage(conversationId, user, {
        clientMessageId,
        content,
        messageType,
      });

      if (result.errCode !== 0) {
        ack({ success: false, error: result.message, errCode: result.errCode });
        socket.emit('chat:error', { message: result.message, conversationId });
        return;
      }

      const roomName = `conversation_${conversationId}`;

      // Broadcast new message to everyone in the room
      io.to(roomName).emit('chat:message:new', {
        conversationId,
        message: result.data,
      });

      // Also notify individual user rooms of conversation participants to update preview/unread in list
      if (result.conversation) {
        const recipientUserId = user.id === result.conversation.patientId
          ? result.conversation.doctorId
          : result.conversation.patientId;

        io.to(`user_${recipientUserId}`).emit('chat:conversation:updated', {
          conversationId,
          latestMessage: result.data,
        });
      }

      // Acknowledge sender with saved message
      ack({ success: true, data: result.data, isDuplicate: result.isDuplicate });
    } catch (err) {
      console.error('Error in chat:message:send handler:', err);
      ack({ success: false, error: 'Lỗi hệ thống khi gửi tin nhắn.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 4. Mark Messages as Read
  // ─────────────────────────────────────────────────────
  socket.on('chat:message:read', async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const conversationId = parseInt(payload?.conversationId, 10);
      if (!conversationId || isNaN(conversationId)) {
        ack({ success: false, error: 'Mã cuộc trò chuyện không hợp lệ.' });
        return;
      }

      const result = await chatService.markAsRead(conversationId, user);
      if (result.errCode !== 0) {
        ack({ success: false, error: result.message });
        return;
      }

      const roomName = `conversation_${conversationId}`;
      socket.to(roomName).emit('chat:message:read', {
        conversationId,
        readerId: user.id,
        readAt: result.data.readAt,
      });

      ack({ success: true, data: result.data });
    } catch (err) {
      console.error('Error in chat:message:read handler:', err);
      ack({ success: false, error: 'Lỗi khi cập nhật trạng thái đọc.' });
    }
  });

  // ─────────────────────────────────────────────────────
  // 5. Typing Indicator
  // ─────────────────────────────────────────────────────
  socket.on('chat:typing', (payload) => {
    try {
      const conversationId = parseInt(payload?.conversationId, 10);
      const isTyping = Boolean(payload?.isTyping);

      if (conversationId && !isNaN(conversationId)) {
        const roomName = `conversation_${conversationId}`;
        socket.to(roomName).emit('chat:typing', {
          conversationId,
          userId: user.id,
          userName: user.fullName,
          isTyping,
        });
      }
    } catch (err) {
      // Ignored for typing micro-event
    }
  });

  // ─────────────────────────────────────────────────────
  // 6. Disconnect
  // ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Clean socket room memberships handled automatically by Socket.IO
  });
}

module.exports = registerChatSocketHandlers;
