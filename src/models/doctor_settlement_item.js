// bookingcare-backend/src/models/doctor_settlement_item.js
// Quản trị Chi tiết Quyết toán Thù lao Bác sĩ theo từng Ca khám (Doctor Settlement Itemized Governance)
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Doctor_Settlement_Item = sequelize.define(
    'Doctor_Settlement_Item',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      settlementId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Liên kết tới kỳ quyết toán Doctor_Settlement nếu đã gom kỳ',
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true, // RÀNG BUỘC DUY NHẤT: Mỗi ca khám chỉ được tạo duy nhất 1 mục quyết toán, chống chi trùng
        comment: 'ID của ca khám đã hoàn thành',
      },
      doctorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID Bác sĩ thực hiện khám',
      },
      clinicId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Cơ sở y tế nơi diễn ra ca khám',
      },
      appointmentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Ngày khám thực tế',
      },
      grossAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Doanh thu gộp ca khám (Giá khám niêm yết)',
      },
      platformFeeRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 15.0,
        comment: 'Tỷ lệ chiết khấu sàn (%) theo snapshot ca khám',
      },
      platformFee: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Số tiền sàn thu phí nền tảng',
      },
      clinicShareRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Tỷ lệ trích cho phòng khám (%) nếu có',
      },
      clinicShare: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Phần cơ sở y tế hưởng',
      },
      adjustmentAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Khoản bù/trừ điều chỉnh nếu có tranh chấp hoặc khuyến mãi',
      },
      netAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Thù lao thực nhận của Bác sĩ = grossAmount - platformFee - clinicShare + adjustmentAmount',
      },
      policySnapshot: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Snapshot điều khoản tài chính đóng băng tại ca khám',
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'EARNED',
        validate: {
          isIn: [['EARNED', 'AVAILABLE', 'PAID', 'HELD', 'CANCELLED']],
        },
        comment:
          'EARNED (Đã khám, chờ T+24h khiếu nại) | AVAILABLE (Đủ điều kiện thanh toán) | PAID (Đã chi trả) | HELD (Tạm giữ do khiếu nại) | CANCELLED',
      },
      earnedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Thời điểm hoàn thành ca khám (S3)',
      },
      availableAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm hết hạn giữ tiền khiếu nại T+24h, sẵn sàng payout',
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thời điểm thực tế đã chi trả',
      },
      payoutMethod: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'WALLET | BANK_TRANSFER',
      },
      walletTransactionId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'ID bút toán Sổ cái Wallet_Transaction thù lao bác sĩ',
      },
      holdReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Lý do nếu bị tạm giữ HELD',
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Ghi chú nghiệp vụ',
      },
    },
    {
      tableName: 'Doctor_Settlement_Items',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['bookingId'] },
        { fields: ['doctorId'] },
        { fields: ['settlementId'] },
        { fields: ['status'] },
        { fields: ['earnedAt'] },
        { fields: ['availableAt'] },
      ],
    }
  );

  return Doctor_Settlement_Item;
};
