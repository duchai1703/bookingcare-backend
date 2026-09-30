// bookingcare-backend/src/models/wallet.js
// Quản lý ví người dùng trong hệ thống BookingCare
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Wallet = sequelize.define(
    'Wallet',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'User ID sở hữu ví (Patient, Doctor, hoặc Admin)',
      },
      walletType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'PATIENT', // PATIENT, DOCTOR, PLATFORM_REVENUE, ESCROW
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'VND',
      },
      availableBalance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.0,
        validate: {
          min: 0,
        },
        comment: 'Số dư khả dụng có thể chi tiêu hoặc rút',
      },
      reservedBalance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.0,
        validate: {
          min: 0,
        },
        comment: 'Số dư đang bị tạm giữ (Hold) cho các lịch hẹn chờ khám',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ACTIVE', // ACTIVE, LOCKED, SUSPENDED
      },
    },
    {
      tableName: 'Wallets',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['ownerId', 'walletType'],
          name: 'idx_wallets_owner_type_unique',
        },
        {
          fields: ['status'],
          name: 'idx_wallets_status',
        },
      ],
    }
  );

  return Wallet;
};
