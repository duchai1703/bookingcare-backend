// bookingcare-backend/src/models/medical_catalog.js
// [Phase A] Danh mục chỉ định / chẩn đoán y khoa (X-Quang, MRI, xét nghiệm, ...)
module.exports = (sequelize, DataTypes) => {
  const MedicalCatalog = sequelize.define('MedicalCatalog', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:        { type: DataTypes.STRING(255), allowNull: false },
    code:        { type: DataTypes.STRING(50),  allowNull: true },
    // type values: 'xray' | 'mri' | 'ultrasound' | 'blood_test' | 'urine_test' | 'other'
    type:        { type: DataTypes.STRING(50),  allowNull: false },
    description: { type: DataTypes.TEXT,        allowNull: true },
    isActive:    { type: DataTypes.BOOLEAN,     defaultValue: true },
    // JSON string: "[1,2,3]" — specialtyId nào được dùng catalog này
    allowedSpecialtyIds: { type: DataTypes.TEXT, allowNull: true },
  }, {
    indexes: [
      { fields: ['type'],     name: 'idx_medical_catalog_type' },
      { fields: ['isActive'], name: 'idx_medical_catalog_active' },
    ],
  });
  return MedicalCatalog;
};
