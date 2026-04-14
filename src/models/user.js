// SRS Section 4.2 – Bảng User
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email:       { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password:      { type: DataTypes.STRING(255), allowNull: true },  // [Phase 9] allowNull: true để hỗ trợ guest cũ (password = null)
    firstName:     { type: DataTypes.STRING(255), allowNull: false },
    lastName:      { type: DataTypes.STRING(255), allowNull: false },
    address:       { type: DataTypes.STRING(255), allowNull: true },
    phoneNumber:   { type: DataTypes.STRING(20), allowNull: true },
    gender:        { type: DataTypes.STRING(10), allowNull: true },
    roleId:        { type: DataTypes.STRING(10), allowNull: false },
    image:         { type: DataTypes.BLOB('long'), allowNull: true },
    positionId:    { type: DataTypes.STRING(10), allowNull: true },
    // [v3.0] tokenVersion: Tăng khi đổi mật khẩu → vô hiệu hóa mọi JWT đăng nhập cũ
    tokenVersion:  { type: DataTypes.INTEGER, defaultValue: 0 },
  });
  return User;
};
