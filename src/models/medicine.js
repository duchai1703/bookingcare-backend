// bookingcare-backend/src/models/medicine.js
// [Phase A] Danh mục thuốc
module.exports = (sequelize, DataTypes) => {
  const Medicine = sequelize.define('Medicine', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:             { type: DataTypes.STRING(255), allowNull: false },
    activeIngredient: { type: DataTypes.STRING(255), allowNull: true }, // Hoạt chất
    unit:             { type: DataTypes.STRING(50),  allowNull: true }, // Viên / Chai / Lọ / Gói
    dosageForm:       { type: DataTypes.STRING(100), allowNull: true }, // Dạng bào chế: viên nén, siro...
    concentration:    { type: DataTypes.STRING(100), allowNull: true }, // Hàm lượng: 500mg, 250ml
    isActive:         { type: DataTypes.BOOLEAN,     defaultValue: true },
  }, {
    indexes: [
      { fields: ['name'],     name: 'idx_medicine_name' },
      { fields: ['isActive'], name: 'idx_medicine_active' },
    ],
  });
  return Medicine;
};
