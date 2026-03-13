// src/middleware/authMiddleware.js
// SRS REQ-AU-004, 008: Phân quyền và bảo vệ route
const jwt = require('jsonwebtoken');

// Verify JWT token từ header Authorization
const verifyToken = (req, res, next) => {
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
    req.user = decoded; // { id, email, roleId }
    next();
  } catch (err) {
    return res.status(403).json({
      errCode: -1,
      message: 'Token không hợp lệ hoặc đã hết hạn!',
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
  checkAdminOrDoctorRole,
};
