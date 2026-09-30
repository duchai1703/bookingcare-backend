// bookingcare-backend/src/models/wallet_hold.js
// Quản lý việc tạm giữ tiền (Hold / Two-phase Commit) khi bệnh nhân đặt lịch
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Wallet_Hold = sequelize.define(
    'Wallet_Hold',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      walletId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID của ví bị hold tiền',
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID của Booking phát sinh hold tiền',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        validate: {
          min: 0.01,
        },
        comment: 'Số tiền bị tạm khóa (chuyển sang reservedBalance)',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'HELD', // HELD, CAPTURED, RELEASED, EXPIRED
        comment: 'HELD: Đang giữ, CAPTURED: Đã trừ vĩnh viễn sau khám, RELEASED: Đã hoàn lại vào ví, EXPIRED: Hết hạn',
      },
      reason: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: 'BOOKING_RESERVATION',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm hết hạn giữ chỗ nếu có',
      },
    },
    {
      tableName: 'Wallet_Holds',
      timestamps: true,
      indexes: [
        {
          fields: ['walletId'],
          name: 'idx_wallet_holds_wallet_id',
        },
        {
          fields: ['bookingId'],
          name: 'idx_wallet_holds_booking_id',
        },
        {
          fields: ['status'],
          name: 'idx_wallet_holds_status',
        },
      ],
    }
  );

  return Wallet_Hold;
};
