// SRS Section 4.2 – Bảng Clinic
module.exports = (sequelize, DataTypes) => {
  const Clinic = sequelize.define('Clinic', {
    id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:                { type: DataTypes.STRING(255), allowNull: false },
    address:             { type: DataTypes.STRING(255), allowNull: false },
    image:               { type: DataTypes.BLOB('long'), allowNull: true },
    descriptionHTML:     { type: DataTypes.TEXT, allowNull: true },
    descriptionMarkdown: { type: DataTypes.TEXT, allowNull: true },
    phone:               { type: DataTypes.STRING(30), allowNull: true },
    email:               { type: DataTypes.STRING(100), allowNull: true },
    status:              { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    commissionRate:      { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 15.00 },
  });
  return Clinic;
};
