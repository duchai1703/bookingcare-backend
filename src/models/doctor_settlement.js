// src/models/doctor_settlement.js
// Quản lý các đợt đối soát & thanh toán tiền cho bác sĩ (Doctor Payouts)
module.exports = (sequelize, DataTypes) => {
  const Doctor_Settlement = sequelize.define('Doctor_Settlement', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId:        { type: DataTypes.INTEGER, allowNull: false },
    periodFrom:      { type: DataTypes.DATE, allowNull: true },
    periodTo:        { type: DataTypes.DATE, allowNull: true },
    grossRevenue:    { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    commissionRate:  { type: DataTypes.DECIMAL(5, 2), defaultValue: 15.00 },
    platformFee:     { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    netPayout:       { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }, // Số tiền chuyển khoản thực nhận
    payoutStatus:    { type: DataTypes.STRING(20), defaultValue: 'paid' }, // 'pending', 'paid', 'cancelled'
    paymentMethod:   { type: DataTypes.STRING(50), defaultValue: 'bank_transfer' },
    transactionRef:  { type: DataTypes.STRING(100), allowNull: true }, // Mã giao dịch ngân hàng
    receiptImage:    { type: DataTypes.TEXT, allowNull: true }, // Ảnh ủy nhiệm chi / biên lai base64
    note:            { type: DataTypes.TEXT, allowNull: true },
    adminId:         { type: DataTypes.INTEGER, allowNull: true },
    paidAt:          { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });
  return Doctor_Settlement;
};
