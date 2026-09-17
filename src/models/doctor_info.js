// SRS Section 4.2 – Bảng Doctor_Info
module.exports = (sequelize, DataTypes) => {
  const Doctor_Info = sequelize.define('Doctor_Info', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId:        { type: DataTypes.INTEGER, allowNull: false },
    specialtyId:     { type: DataTypes.INTEGER, allowNull: true },
    clinicId:        { type: DataTypes.INTEGER, allowNull: true },
    priceId:         { type: DataTypes.STRING(10), allowNull: true },
    provinceId:      { type: DataTypes.STRING(10), allowNull: true },
    paymentId:       { type: DataTypes.STRING(10), allowNull: true },
    contentHTML:     { type: DataTypes.TEXT, allowNull: true },
    contentMarkdown: { type: DataTypes.TEXT, allowNull: true },
    description:     { type: DataTypes.TEXT, allowNull: true },
    note:            { type: DataTypes.TEXT, allowNull: true },
    count:           { type: DataTypes.INTEGER, defaultValue: 0 },
    // [Doctor Operations Center] Tùy chỉnh hoa hồng, trạng thái hoạt động & ngân hàng nhận thanh toán
    commissionRate:    { type: DataTypes.DECIMAL(5, 2), defaultValue: 15.00 },
    workingStatus:     { type: DataTypes.STRING(20), defaultValue: 'active' }, // 'active', 'paused', 'suspended'
    bankAccountNumber: { type: DataTypes.STRING(50), allowNull: true },
    bankName:          { type: DataTypes.STRING(100), allowNull: true },
    bankAccountName:   { type: DataTypes.STRING(100), allowNull: true },
  });
  return Doctor_Info;
};
