// bookingcare-backend/src/models/system_setting.js
// [Phase A] Key-value store cho cài đặt hệ thống (hoàn tiền, phí dịch vụ, ...)
module.exports = (sequelize, DataTypes) => {
  const SystemSetting = sequelize.define('SystemSetting', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key:         { type: DataTypes.STRING(100), allowNull: false, unique: true },
    value:       { type: DataTypes.TEXT, allowNull: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
  });
  return SystemSetting;
};

/*
Seed data — chạy sau khi bảng được tạo:
INSERT INTO "SystemSettings" (key, value, description, "createdAt", "updatedAt") VALUES
('refund_rate_cancel_before_24h', '100', 'Hủy trước 24h: hoàn 100% phí khám', NOW(), NOW()),
('refund_rate_cancel_after_24h',  '50',  'Hủy sau 24h: hoàn 50% phí khám',    NOW(), NOW()),
('service_fee_rate',              '5',   'Phí dịch vụ hệ thống: 5%',           NOW(), NOW());
*/
