// bookingcare-backend/src/models/refund_case.js
// Quản trị Hồ sơ Hoàn tiền Bệnh nhân độc lập (Refund Governance)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Refund_Case = sequelize.define(
    'Refund_Case',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID của ca khám liên quan',
      },
      patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID của Bệnh nhân nhận hoàn tiền',
      },
      doctorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID Bác sĩ phụ trách ca khám',
      },
      cancelledByRole: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'PATIENT',
        comment: 'PATIENT | DOCTOR | CLINIC | SYSTEM | ADMIN',
      },
      cancelledById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID người bấm hủy lịch',
      },
      cancellationReason: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment:
          'PATIENT_ON_TIME | PATIENT_LATE | PATIENT_NO_SHOW | DOCTOR_UNAVAILABLE | CLINIC_FORCE_MAJEURE | SYSTEM_DUPLICATE_PAYMENT | ADMIN_DISPUTE_RESOLUTION | OTHER',
      },
      cancellationNote: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Lý do chi tiết nhập khi hủy lịch',
      },
      cancelledAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Thời điểm hủy lịch',
      },
      appointmentTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm hẹn khám ban đầu',
      },
      hoursBeforeAppointment: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
        comment: 'Số giờ chênh lệch trước giờ khám',
      },
      policyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID chính sách hoàn tiền áp dụng',
      },
      policyVersion: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
        comment: 'Phiên bản chính sách hoàn tiền',
      },
      paidAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Số tiền thực tế bệnh nhân đã thanh toán / cọc',
      },
      refundRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Tỷ lệ hoàn tiền được áp dụng (%)',
      },
      refundAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Số tiền hoàn trả dự kiến hoặc thực tế',
      },
      nonRefundableAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Phí phạt / Khoản giữ lại không hoàn',
      },
      calculationSnapshot: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON snapshot chi tiết phép tính hoàn tiền tại thời điểm hủy',
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'PENDING',
        comment: 'PENDING | APPROVED | COMPLETED | REJECTED | DISPUTED',
      },
      refundMethod: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'WALLET',
        comment: 'WALLET | BANK_TRANSFER | ORIGINAL_PAYMENT',
      },
      reviewedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Admin thẩm định (nếu có ngoại lệ)',
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reviewNote: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      walletTransactionId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'ID bút toán Sổ cái Wallet_Transaction hoàn tiền',
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm hoàn tiền thành công',
      },
    },
    {
      tableName: 'Refund_Cases',
      timestamps: true,
      indexes: [
        { fields: ['bookingId'] },
        { fields: ['patientId'] },
        { fields: ['status'] },
        { fields: ['cancelledAt'] },
      ],
    }
  );

  return Refund_Case;
};
