// bookingcare-backend/src/models/policy_audit_log.js
// Nhật ký Kiểm toán Chính sách Bất biến (Immutable Policy Audit Trail)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Policy_Audit_Log = sequelize.define(
    'Policy_Audit_Log',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      policyType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Loại chính sách: WITHDRAWAL_SLA | REFUND_RULE | REVENUE_SHARE',
      },
      policyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID của chính sách tham chiếu trong Financial_Policies',
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Hành động: CREATE | UPDATE_SLA | UPDATE_CONFIG | STATUS_CHANGE | OVERRIDE',
      },
      oldValue: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Dữ liệu/Cấu hình cũ dạng JSON',
      },
      newValue: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Dữ liệu/Cấu hình mới dạng JSON',
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Lý do thay đổi chính sách bắt buộc Admin phải giải trình',
      },
      adminId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID của Quản trị viên thực hiện thay đổi',
      },
      ipAddress: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Địa chỉ IP của Admin khi thao tác',
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Thông tin trình duyệt/User Agent của Admin',
      },
    },
    {
      tableName: 'Policy_Audit_Logs',
      timestamps: true,
      updatedAt: false, // Bảng chỉ ghi nhận, không bao giờ cập nhật (Append-only)
      indexes: [
        {
          fields: ['policyType'],
          name: 'idx_policy_audit_logs_type',
        },
        {
          fields: ['policyId'],
          name: 'idx_policy_audit_logs_policy_id',
        },
        {
          fields: ['adminId'],
          name: 'idx_policy_audit_logs_admin_id',
        },
        {
          fields: ['createdAt'],
          name: 'idx_policy_audit_logs_created_at',
        },
      ],
    }
  );

  return Policy_Audit_Log;
};
