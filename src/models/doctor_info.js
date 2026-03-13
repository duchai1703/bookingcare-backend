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
  });
  return Doctor_Info;
};
