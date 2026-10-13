// bookingcare-backend/src/models/financial_automation_log.js
// Nhật Ký Phiên Chạy Tự Động & Sơ Đồ Bóc Tách Luồng Tiền Đi - Đến (Financial Automation & Money Trace)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Financial_Automation_Log = sequelize.define(
    'Financial_Automation_Log',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      batchCode: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Mã phiên chạy duy nhất, vd: AUTO-BATCH-20261012-001',
      },
      jobType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'DOCTOR_SETTLEMENT_PAYOUT',
        comment: 'DOCTOR_SETTLEMENT_PAYOUT | REFUND_AUTO | SYSTEM_AUDIT',
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'SUCCESS',
        validate: {
          isIn: [['SUCCESS', 'PARTIAL', 'FAILED']],
        },
      },
      totalItems: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Tổng số ca khám / giao dịch xử lý trong phiên',
      },
      totalAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Tổng dòng tiền dịch chuyển trong phiên',
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON chi tiết bóc tách từng ca: Tiền từ đâu (From) -> Sàn thu bao nhiêu -> Vào ví Bác sĩ nào (To) -> Số dư trước/sau',
      },
      triggeredBy: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'SYSTEM_CRON',
        comment: 'SYSTEM_CRON | ADMIN_MANUAL',
      },
      adminId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      executionTimeMs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'Financial_Automation_Logs',
      timestamps: true,
      indexes: [
        {
          name: 'idx_financial_auto_batch_code',
          fields: ['batchCode'],
        },
      ],
    }
  );

  return Financial_Automation_Log;
};
