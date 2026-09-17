// src/models/financial_policy.js
// Financial Policy Engine — Quản lý Chính sách Phân bổ Doanh thu & Quy định Hoàn tiền
module.exports = (sequelize, DataTypes) => {
  const Financial_Policy = sequelize.define('Financial_Policy', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code:          { type: DataTypes.STRING(50), allowNull: false }, // 'POL_REVENUE_SHARE' | 'POL_REFUND_RULE'
    policyType:    { type: DataTypes.STRING(30), allowNull: false }, // 'REVENUE_SHARE' | 'REFUND_RULE'
    name:          { type: DataTypes.STRING(255), allowNull: false }, // Tên hiển thị chính sách
    version:       { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, // v1, v2, v3...
    scopeType:     { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'GLOBAL' }, // 'GLOBAL' | 'CLINIC' | 'DOCTOR'
    scopeId:       { type: DataTypes.INTEGER, allowNull: true }, // ID đối tượng nếu scope là CLINIC hoặc DOCTOR
    effectiveFrom: { type: DataTypes.DATE, allowNull: false }, // Thời điểm bắt đầu hiệu lực
    effectiveTo:   { type: DataTypes.DATE, allowNull: true }, // Thời điểm kết thúc hiệu lực (NULL = vô thời hạn)
    status:        { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' }, // 'DRAFT' | 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'SUPERSEDED'
    rules:         { type: DataTypes.TEXT, allowNull: false }, // Cấu hình JSON string chi tiết các tỷ lệ hoặc bậc thang
    description:   { type: DataTypes.TEXT, allowNull: true }, // Ghi chú, điều khoản, lý do ban hành
    isLocked:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Khóa cứng khi đã có booking tham chiếu
    createdById:   { type: DataTypes.INTEGER, allowNull: true }, // Admin ban hành chính sách
  }, {
    tableName: 'Financial_Policies',
    indexes: [
      { fields: ['policyType', 'scopeType', 'status'], name: 'idx_finpolicy_type_scope_status' },
      { fields: ['effectiveFrom', 'effectiveTo'], name: 'idx_finpolicy_effective_dates' },
    ],
  });
  return Financial_Policy;
};
