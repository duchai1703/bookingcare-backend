// bookingcare-backend/src/models/withdrawal_request.js
// Quản lý yêu cầu rút tiền từ ví nội bộ về tài khoản ngân hàng chính chủ (Phase 3)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Withdrawal_Request = sequelize.define(
    'Withdrawal_Request',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      walletId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID của ví yêu cầu rút tiền',
      },
      patientBankAccountId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID tài khoản ngân hàng của bệnh nhân (nếu là bệnh nhân rút)',
      },
      bankName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Tên ngân hàng thụ hưởng (Snapshot)',
      },
      accountNumber: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Số tài khoản ngân hàng thụ hưởng (Snapshot)',
      },
      accountHolderName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Tên chủ tài khoản thụ hưởng (Snapshot)',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        validate: {
          min: 50000,
        },
        comment: 'Số tiền yêu cầu rút (tối thiểu 50.000 VNĐ)',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: {
          isIn: [['PENDING', 'APPROVED', 'TRANSFERRED', 'REJECTED', 'CANCELLED']],
        },
        comment: 'PENDING, APPROVED, TRANSFERRED, REJECTED, CANCELLED',
      },
      adminId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID của Quản trị viên xử lý',
      },
      adminNote: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Ghi chú phê duyệt hoặc lý do từ chối của Admin',
      },
      userNote: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Ghi chú của người dùng khi tạo yêu cầu',
      },
      bankTransactionRef: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: 'Mã giao dịch ngân hàng / Ủy nhiệm chi khi chuyển khoản thành công',
      },
      receiptImage: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Ảnh chứng từ chuyển khoản ngân hàng (Base64 / URL)',
      },
      requestedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: 'Thời điểm gửi yêu cầu rút tiền',
      },
      transferredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm Admin hoàn tất chuyển khoản',
      },
      rejectedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm Admin từ chối yêu cầu',
      },
      cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm người dùng tự hủy yêu cầu',
      },
    },
    {
      tableName: 'Withdrawal_Requests',
      timestamps: true,
      indexes: [
        {
          fields: ['walletId'],
          name: 'idx_withdrawal_requests_wallet_id',
        },
        {
          fields: ['status'],
          name: 'idx_withdrawal_requests_status',
        },
        {
          fields: ['adminId'],
          name: 'idx_withdrawal_requests_admin_id',
        },
        {
          fields: ['createdAt'],
          name: 'idx_withdrawal_requests_created_at',
        },
      ],
    }
  );

  return Withdrawal_Request;
};
