// src/services/authService.js
// Phase 9 — Auth Service: register, forgotPassword, resetPassword
// [v3.0] Final Security Hardened — One-Time Token + Strict Session Revocation
const db = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('./emailService');

// ═══════════════════════════════════════════════════════════════════════
// 1. REGISTER PATIENT — Đăng ký bệnh nhân (R3)
// ═══════════════════════════════════════════════════════════════════════
// Security Rule: Guest Hijack Prevention (v2.0 SECURITY FIX #4)
//   - Email tồn tại + password IS NULL → KHÔNG update password ở đây
//   - Bắt buộc dùng "Quên mật khẩu" để xác minh quyền sở hữu email
// ═══════════════════════════════════════════════════════════════════════
const registerPatient = async (data) => {
  try {
    // 1. Validate đầu vào
    if (!data.firstName || !data.lastName || !data.email || !data.password) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc (firstName, lastName, email, password)!' };
    }

    // 2. Tìm user theo email
    const existingUser = await db.User.findOne({ where: { email: data.email } });

    // 3. Xử lý các trường hợp email đã tồn tại
    if (existingUser) {
      // 3a. Email đã đăng ký đầy đủ (có password) → reject
      if (existingUser.password) {
        return { errCode: 2, message: 'Email đã tồn tại trong hệ thống!' };
      }

      // ═══════════════════════════════════════════════════════════
      // 3b. [SECURITY] Guest Hijack Prevention — Edge Case Guest cũ
      // Email tồn tại nhưng password IS NULL → guest từ luồng Guest Checkout cũ
      // TUYỆT ĐỐI KHÔNG update mật khẩu trực tiếp ở đây vì:
      //   - Kẻ tấn công có thể nhập email người khác → chiếm đoạt tài khoản
      //   - Vi phạm HIPAA/GDPR: truy cập lịch sử khám bệnh người khác
      // → Yêu cầu xác minh email qua "Quên mật khẩu"
      // ═══════════════════════════════════════════════════════════
      return {
        errCode: 10,
        message: 'Email này đã được sử dụng để đặt lịch. Vui lòng sử dụng chức năng "Quên mật khẩu" để xác minh và tạo mật khẩu.',
      };
    }

    // 4. Email chưa tồn tại → Tạo user mới với role Patient (R3)
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await db.User.create({
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber || '',
      roleId: 'R3',  // Bệnh nhân
      tokenVersion: 0,
    });

    return { errCode: 0, message: 'Đăng ký tài khoản thành công!' };
  } catch (err) {
    console.error('>>> registerPatient error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 2. FORGOT PASSWORD — Gửi email link reset mật khẩu
// ═══════════════════════════════════════════════════════════════════════
// Security Rule (v2.0 FIX #5): One-Time Reset Token
//   - JWT payload chứa pwFingerprint (10 ký tự cuối password hash)
//   - Token tự vô hiệu hóa khi mật khẩu đã đổi
// Security Rule (v3.0 FIX #1a): Bắt buộc lưu tokenHash vào bảng Tokens
//   - Hash JWT bằng SHA256 → lưu vào DB → đảm bảo one-time use
// Chống Email Enumeration: Luôn trả errCode: 0 dù email có tồn tại hay không
// ═══════════════════════════════════════════════════════════════════════
const forgotPassword = async (data) => {
  try {
    if (!data.email) {
      return { errCode: 1, message: 'Vui lòng nhập email!' };
    }

    // 1. Tìm user theo email
    const user = await db.User.findOne({ where: { email: data.email } });

    // Chống Email Enumeration: Nếu không tìm thấy → vẫn trả success
    if (!user) {
      return { errCode: 0, message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu.' };
    }

    // 2. Tạo JWT token với payload đặc biệt (15 phút)
    // [v2.0] pwFingerprint = 10 ký tự cuối password hash → token tự vô hiệu hóa khi MK đã đổi
    const pwFingerprint = user.password ? user.password.slice(-10) : 'NO_PW';
    const resetToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        pwFingerprint,  // Lớp bảo vệ phụ: detect nếu MK đã thay đổi
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // 3. [v3.0] Hash JWT bằng SHA256 → lưu vào bảng Tokens
    // Không lưu plaintext JWT vào DB để tránh token leak
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    await db.Token.create({
      tokenHash,
      userId: user.id,
      type: 'RESET_PW',
      isUsed: false,
      expiredAt: new Date(Date.now() + 15 * 60 * 1000), // 15 phút
    });

    // 4. Gửi email chứa link reset password
    // TODO: [Phase 9.3] Sẽ code nội dung email chi tiết sau
    const resetLink = `${process.env.URL_REACT}/reset-password?token=${resetToken}`;
    try {
      await emailService.sendEmailResetPassword({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        resetLink,
        language: data.language || 'vi',
      });
    } catch (emailErr) {
      // Log lỗi email nhưng vẫn trả success (chống enumeration)
      console.error('>>> sendEmailResetPassword error:', emailErr);
    }

    return { errCode: 0, message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu.' };
  } catch (err) {
    console.error('>>> forgotPassword error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 3. RESET PASSWORD — Đặt mật khẩu mới
// ═══════════════════════════════════════════════════════════════════════
// Security Layers (Defense in Depth):
//   Layer 1: JWT.verify() → kiểm tra chữ ký + hết hạn
//   Layer 2: [v3.0] One-Time Token Check → query bảng Tokens (isUsed: false)
//   Layer 3: [v2.0] pwFingerprint Check → so sánh với password hash hiện tại
//   Layer 4: [v3.0] Sequelize Transaction → atomic: đổi MK + đánh dấu token + revoke sessions
//
// Token Revocation: user.tokenVersion++ → MỌI JWT đăng nhập cũ bị reject ngay lập tức
// ═══════════════════════════════════════════════════════════════════════
const resetPassword = async (data) => {
  try {
    if (!data.token || !data.newPassword) {
      return { errCode: 1, message: 'Thiếu thông tin bắt buộc!' };
    }

    // ─── Layer 1: Verify JWT signature + expiration ───
    let decoded;
    try {
      decoded = jwt.verify(data.token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return { errCode: 2, message: 'Link đặt lại mật khẩu đã hết hạn!' };
      }
      return { errCode: 2, message: 'Link đặt lại mật khẩu không hợp lệ!' };
    }

    // ─── Layer 2/3/4: [v3.0] Atomic Transaction + Row Lock ───
    // Đưa token check + user check + update vào cùng transaction để chặn replay đồng thời.
    const tokenHash = crypto.createHash('sha256').update(data.token).digest('hex');
    const t = await db.sequelize.transaction();
    try {
      // 2a. Khóa token row (FOR UPDATE) và kiểm tra one-time
      const tokenRecord = await db.Token.findOne({
        where: { tokenHash, type: 'RESET_PW', isUsed: false },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!tokenRecord) {
        await t.rollback();
        return { errCode: 4, message: 'Link đặt lại mật khẩu đã được sử dụng hoặc không hợp lệ!' };
      }

      // 2b. Ràng buộc token phải thuộc đúng user đã decode từ JWT
      if (tokenRecord.userId !== decoded.id) {
        await t.rollback();
        return { errCode: 4, message: 'Link đặt lại mật khẩu đã được sử dụng hoặc không hợp lệ!' };
      }

      // 3a. Khóa user row (FOR UPDATE) để đồng bộ fingerprint + tokenVersion update
      const user = await db.User.findByPk(decoded.id, {
        raw: false,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!user) {
        await t.rollback();
        return { errCode: 3, message: 'Người dùng không tồn tại!' };
      }

      // 3b. pwFingerprint check (lớp bảo vệ phụ)
      const currentFingerprint = user.password ? user.password.slice(-10) : 'NO_PW';
      if (decoded.pwFingerprint !== currentFingerprint) {
        await t.rollback();
        return { errCode: 4, message: 'Link đặt lại mật khẩu đã được sử dụng hoặc không hợp lệ!' };
      }

      // 4a. Hash mật khẩu mới + tăng tokenVersion để revoke mọi session cũ
      const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);
      user.password = hashedNewPassword;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save({ transaction: t });

      // 4b. Đánh dấu token đã dùng (one-time)
      tokenRecord.isUsed = true;
      await tokenRecord.save({ transaction: t });

      await t.commit();
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }

    return { errCode: 0, message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.' };
  } catch (err) {
    console.error('>>> resetPassword error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = {
  registerPatient,
  forgotPassword,
  resetPassword,
};
