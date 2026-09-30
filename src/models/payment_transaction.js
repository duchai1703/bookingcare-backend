// bookingcare-backend/src/models/payment_transaction.js
// Ghi nhận chi tiết giao dịch cổng thanh toán ngoài (VNPay)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Payment_Transaction = sequelize.define(
    'Payment_Transaction',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      walletId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Ví thụ hưởng hoặc thực hiện giao dịch',
      },
      gateway: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'VNPAY',
      },
      paymentType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'WALLET_DEPOSIT', // WALLET_DEPOSIT, BOOKING_PAYMENT
      },
      txnRef: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Mã tham chiếu đơn hàng gửi sang VNPay (vnp_TxnRef)',
      },
      gatewayTransactionNo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Mã giao dịch trả về từ VNPay (vnp_TransactionNo)',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: 'Số tiền nạp thực tế',
      },
      bankCode: {
        type: DataTypes.STRING(30),
        allowNull: true,
        comment: 'Mã ngân hàng thực hiện thanh toán (NCB, VCB, VISA...)',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PENDING', // PENDING, SUCCESS, FAILED
      },
      rawResponse: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Payload raw JSON từ VNPay IPN webhook',
      },
    },
    {
      tableName: 'Payment_Transactions',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['txnRef'],
          name: 'idx_payment_tx_txn_ref_unique',
        },
        {
          fields: ['walletId'],
          name: 'idx_payment_tx_wallet_id',
        },
        {
          fields: ['status'],
          name: 'idx_payment_tx_status',
        },
      ],
    }
  );

  return Payment_Transaction;
};
