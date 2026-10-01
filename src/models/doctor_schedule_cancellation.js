// src/models/doctor_schedule_cancellation.js
// Doctor Schedule Cancellation & Compensation Engine — Quản lý sự kiện Bác sĩ báo bận / hủy lịch khám
module.exports = (sequelize, DataTypes) => {
  const Doctor_Schedule_Cancellation = sequelize.define('Doctor_Schedule_Cancellation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    doctorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    clinicId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    scope: {
      type: DataTypes.STRING(20),
      allowNull: false, // 'BOOKING' | 'SLOT' | 'DAY' | 'DATE_RANGE'
    },
    cancellationDate: {
      type: DataTypes.STRING(20),
      allowNull: true, // Timestamp unix hoặc YYYY-MM-DD
    },
    fromDate: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    toDate: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    cancelledBy: {
      type: DataTypes.INTEGER,
      allowNull: false, // userId thực hiện hủy
    },
    cancelledByRole: {
      type: DataTypes.STRING(20),
      allowNull: false, // 'DOCTOR' | 'ADMIN'
      defaultValue: 'DOCTOR',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'COMPLETED', // 'PROCESSING' | 'COMPLETED' | 'FAILED'
    },
    affectedSlotsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    affectedBookingsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalRefundAmount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
    },
  }, {
    tableName: 'Doctor_Schedule_Cancellations',
    indexes: [
      { fields: ['doctorId', 'cancellationDate'], name: 'idx_doc_cancel_doc_date' },
      { fields: ['cancelledBy'], name: 'idx_doc_cancel_cancelledBy' },
      { fields: ['scope'], name: 'idx_doc_cancel_scope' },
      { fields: ['status'], name: 'idx_doc_cancel_status' },
      { fields: ['createdAt'], name: 'idx_doc_cancel_createdAt' },
    ],
  });

  return Doctor_Schedule_Cancellation;
};
