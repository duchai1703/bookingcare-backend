// src/models/token.js
// Phase 9 — Bảng Tokens: One-Time Token Store (Design Document v3.0, Mục 3.5)
// Mục đích: Đảm bảo token reset mật khẩu chỉ dùng ĐÚNG 1 LẦN + audit trail
// tokenHash: SHA256 hash của JWT token (không lưu plaintext JWT)
// type: 'RESET_PW' hoặc 'VERIFY_EMAIL'
module.exports = (sequelize, DataTypes) => {
  const Token = sequelize.define('Token', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    userId:    { type: DataTypes.INTEGER, allowNull: false },
    type:      { type: DataTypes.STRING(20), allowNull: false },  // 'RESET_PW', 'VERIFY_EMAIL'
    isUsed:    { type: DataTypes.BOOLEAN, defaultValue: false },
    expiredAt: { type: DataTypes.DATE, allowNull: false },
  }, {
    indexes: [
      { fields: ['tokenHash'], name: 'idx_tokens_hash', unique: true },
      { fields: ['userId'], name: 'idx_tokens_userId' },
    ],
  });
  return Token;
};
