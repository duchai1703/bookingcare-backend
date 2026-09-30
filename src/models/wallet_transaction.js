// bookingcare-backend/src/models/wallet_transaction.js
// Sổ cái giao dịch ví bất biến (Immutable Financial Ledger)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Wallet_Transaction = sequelize.define(
    'Wallet_Transaction',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      walletId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID của ví liên kết',
      },
      direction: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: {
          isIn: [['CREDIT', 'DEBIT']],
        },
        comment: 'CREDIT: Tiền vào (+), DEBIT: Tiền ra (-)',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        validate: {
          min: 0.01,
        },
        comment: 'Số tiền biến động (luôn dương)',
      },
      balanceAfter: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: 'Snapshot số dư khả dụng ngay sau khi giao dịch hoàn tất',
      },
      transactionType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        comment: 'DEPOSIT, BOOKING_PAYMENT, REFUND, DOCTOR_SHARE, PLATFORM_FEE, WITHDRAWAL, ADJUSTMENT, REVERSAL',
      },
      referenceType: {
        type: DataTypes.STRING(40),
        allowNull: true,
        comment: 'PAYMENT_TRANSACTION, BOOKING, DOCTOR_SETTLEMENT, WITHDRAWAL_REQUEST',
      },
      referenceId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Mã tham chiếu đối tượng nguồn (bookingId, paymentId...)',
      },
      idempotencyKey: {
        type: DataTypes.STRING(160),
        allowNull: false,
        comment: 'Khóa chống trùng lặp giao dịch (Idempotency Guard)',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Mô tả diễn giải chi tiết giao dịch',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'COMPLETED', // COMPLETED, REVERSED
      },
    },
    {
      tableName: 'Wallet_Transactions',
      timestamps: true,
      updatedAt: false, // Bất biến (Immutable) — Không bao giờ cập nhật dòng lịch sử
      indexes: [
        {
          fields: ['walletId'],
          name: 'idx_wallet_tx_wallet_id',
        },
        {
          unique: true,
          fields: ['idempotencyKey'],
          name: 'idx_wallet_tx_idempotency_unique',
        },
        {
          fields: ['referenceType', 'referenceId'],
          name: 'idx_wallet_tx_reference',
        },
        {
          fields: ['createdAt'],
          name: 'idx_wallet_tx_created_at',
        },
      ],
    }
  );

  return Wallet_Transaction;
};
