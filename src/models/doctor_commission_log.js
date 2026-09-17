// src/models/doctor_commission_log.js
// Lịch sử kiểm toán thay đổi tỷ lệ hoa hồng của từng bác sĩ
module.exports = (sequelize, DataTypes) => {
  const Doctor_Commission_Log = sequelize.define('Doctor_Commission_Log', {
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId:          { type: DataTypes.INTEGER, allowNull: false },
    oldRate:           { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    newRate:           { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    reason:            { type: DataTypes.TEXT, allowNull: true },
    updatedByAdminId:  { type: DataTypes.INTEGER, allowNull: true },
  });
  return Doctor_Commission_Log;
};
