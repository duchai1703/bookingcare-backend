// SRS Section 4.2 – Bảng Allcode (bảng tra cứu chung)
module.exports = (sequelize, DataTypes) => {
  const Allcode = sequelize.define('Allcode', {
    id:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type:    { type: DataTypes.STRING(50), allowNull: false },
    keyMap:  { type: DataTypes.STRING(10), allowNull: false, unique: true },
    valueVi: { type: DataTypes.STRING(255), allowNull: false },
    valueEn: { type: DataTypes.STRING(255), allowNull: false },
  });
  return Allcode;
};
