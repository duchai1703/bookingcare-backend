// src/middleware/authMiddleware.js
// SRS REQ-AU-004, 008: Phân quyền và bảo vệ route
// [v3.0] Strict Session Revocation via tokenVersion
const jwt = require('jsonwebtoken');
const db = require('../models');

// Verify JWT token từ header Authorization
// [v3.0] BẮT BUỘC kiểm tra tokenVersion để revoke session khi đổi mật khẩu
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Format: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      errCode: -1,
      message: 'Chưa đăng nhập! Vui lòng đăng nhập để tiếp tục.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ═══════════════════════════════════════════════════════════
    // [v3.0 STRICT REQUIREMENT] Token Version Check — Session Revocation
    // Khi user đổi mật khẩu → tokenVersion++ → JWT cũ chứa tokenVersion cũ bị reject
    // ═══════════════════════════════════════════════════════════
    const user = await db.User.findByPk(decoded.id, {
      attributes: ['id', 'tokenVersion'],
      raw: true,
    });

    if (!user) {
      return res.status(401).json({
        errCode: -2,
        message: 'Tài khoản không tồn tại!',
      });
    }

    // So sánh tokenVersion trong JWT với tokenVersion hiện tại trong DB
    // [v3.0 STRICT] Token thiếu tokenVersion hoặc mismatch đều phải bị reject
    const currentTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
    if (!Number.isInteger(decoded.tokenVersion) || decoded.tokenVersion !== currentTokenVersion) {
      return res.status(401).json({
        errCode: -2,
        message: 'Phiên đăng nhập đã bị thu hồi! Vui lòng đăng nhập lại.',
      });
    }

    req.user = decoded; // { id, email, roleId, tokenVersion }
    next();
  } catch (err) {
    // DS-02 FIX: phân biệt token hết hạn (401) vs token không hợp lệ (403)
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        errCode: -1,
        message: 'Phiên đăng nhập đã hết hạn! Vui lòng đăng nhập lại.',
      });
    }
    return res.status(403).json({
      errCode: -1,
      message: 'Token không hợp lệ!',
    });
  }
};

// REQ-AU-004: Chỉ Admin (R1) mới truy cập được
const checkAdminRole = (req, res, next) => {
  if (!req.user || req.user.roleId !== 'R1') {
    return res.status(403).json({
      errCode: -1,
      message: 'Bạn không có quyền Admin để truy cập chức năng này!',
    });
  }
  next();
};

// Chỉ Doctor (R2) mới truy cập được
const checkDoctorRole = (req, res, next) => {
  if (!req.user || req.user.roleId !== 'R2') {
    return res.status(403).json({
      errCode: -1,
      message: 'Bạn không có quyền Bác sĩ để truy cập chức năng này!',
    });
  }
  next();
};

// [Phase 9] Chỉ Patient (R3) mới truy cập được — checkPatientRole
const checkPatientRole = (req, res, next) => {
  if (!req.user || req.user.roleId !== 'R3') {
    return res.status(403).json({
      errCode: -1,
      message: 'Bạn không có quyền bệnh nhân!',
    });
  }
  next();
};

// Admin hoặc Doctor đều truy cập được
const checkAdminOrDoctorRole = (req, res, next) => {
  if (!req.user || (req.user.roleId !== 'R1' && req.user.roleId !== 'R2')) {
    return res.status(403).json({
      errCode: -1,
      message: 'Bạn không có quyền truy cập chức năng này!',
    });
  }
  next();
};

module.exports = {
  verifyToken,
  checkAdminRole,
  checkDoctorRole,
  checkPatientRole,
  checkAdminOrDoctorRole,
};

