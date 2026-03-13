// SRS Section 4.2 – Bảng Specialty
module.exports = (sequelize, DataTypes) => {
  const Specialty = sequelize.define('Specialty', {
    id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:                { type: DataTypes.STRING(255), allowNull: false },
    image:               { type: DataTypes.BLOB('long'), allowNull: true },
    descriptionHTML:     { type: DataTypes.TEXT, allowNull: true },
    descriptionMarkdown: { type: DataTypes.TEXT, allowNull: true },
  });
  return Specialty;
};
