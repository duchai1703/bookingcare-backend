// src/models/doctor_schedule_cancellation_target.js
// Doctor Schedule Cancellation & Compensation Engine — Bảng chi tiết đối tượng bị ảnh hưởng
module.exports = (sequelize, DataTypes) => {
  const Doctor_Schedule_Cancellation_Target = sequelize.define('Doctor_Schedule_Cancellation_Target', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    cancellationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    targetType: {
      type: DataTypes.STRING(20),
      allowNull: false, // 'SCHEDULE' | 'BOOKING'
    },
    scheduleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    timeType: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    bookingPrice: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
    },
    refundAmount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
    },
    walletTxId: {
      type: DataTypes.UUID,
      allowNull: true, // ID giao dịch hoàn tiền trong Wallet_Transaction
    },
    refundStatus: {
      type: DataTypes.STRING(20),
      defaultValue: 'SUCCESS', // 'SUCCESS' | 'FAILED' | 'SKIPPED'
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  }, {
    tableName: 'Doctor_Schedule_Cancellation_Targets',
    indexes: [
      { fields: ['cancellationId'], name: 'idx_cancel_targets_cancellation' },
      { fields: ['bookingId'], name: 'idx_cancel_targets_booking' },
      { fields: ['scheduleId'], name: 'idx_cancel_targets_schedule' },
      { fields: ['patientId'], name: 'idx_cancel_targets_patient' },
    ],
  });

  return Doctor_Schedule_Cancellation_Target;
};
