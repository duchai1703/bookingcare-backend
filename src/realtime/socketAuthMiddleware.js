'use strict';

const jwt = require('jsonwebtoken');
const db = require('../models');

/**
 * Socket.IO Authentication Middleware
 * Validates JWT during handshake and verifies tokenVersion against database for session revocation.
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;
    if (!token && socket.handshake.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    }

    if (!token) {
      return next(new Error('AUTHENTICATION_ERROR: Token xác thực không được cung cấp.'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('AUTHENTICATION_ERROR: Phiên đăng nhập đã hết hạn.'));
      }
      return next(new Error('AUTHENTICATION_ERROR: Token xác thực không hợp lệ.'));
    }

    // Strict Database verification & Session Revocation check
    const user = await db.User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'roleId', 'tokenVersion', 'firstName', 'lastName'],
      raw: true,
    });

    if (!user) {
      return next(new Error('AUTHENTICATION_ERROR: Tài khoản không tồn tại trên hệ thống.'));
    }

    const currentTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
    const decodedVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;

    if (decodedVersion !== currentTokenVersion) {
      return next(new Error('AUTHENTICATION_ERROR: Phiên đăng nhập đã bị thu hồi.'));
    }

    // Attach validated identity to socket
    socket.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      tokenVersion: currentTokenVersion,
      fullName: `${user.lastName || ''} ${user.firstName || ''}`.trim() || user.email,
    };

    next();
  } catch (err) {
    console.error('Socket authentication middleware fatal error:', err);
    return next(new Error('AUTHENTICATION_ERROR: Lỗi xác thực socket.'));
  }
};

module.exports = socketAuthMiddleware;
