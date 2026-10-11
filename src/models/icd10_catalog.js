// bookingcare-backend/src/models/icd10_catalog.js
// [Clinical Smart Assistant] Danh mục chẩn đoán chuẩn ICD-10 (WHO & Bộ Y Tế)
module.exports = (sequelize, DataTypes) => {
  const ICD10Catalog = sequelize.define('ICD10Catalog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    nameVi: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nameEn: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    synonyms: {
      type: DataTypes.TEXT,
      allowNull: true, // Ví dụ: "thoái hóa khớp gối, gonarthrosis, OA knee"
    },
    chapter: {
      type: DataTypes.STRING(20),
      allowNull: true, // Ví dụ: "XIII" (Bệnh hệ cơ xương và mô liên kết)
    },
    specialtyId: {
      type: DataTypes.INTEGER,
      allowNull: true, // FK liên kết Specialty nếu có
    },
    commonRank: {
      type: DataTypes.INTEGER,
      defaultValue: 0, // Điểm phổ biến lâm sàng (cao hơn -> ưu tiên hơn)
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'ICD10_Catalogs',
    timestamps: true,
    indexes: [
      { fields: ['code'], name: 'idx_icd10_code' },
      { fields: ['specialtyId'], name: 'idx_icd10_specialty' },
      { fields: ['isActive'], name: 'idx_icd10_active' },
    ],
  });

  ICD10Catalog.associate = (models) => {
    if (models.Specialty) {
      ICD10Catalog.belongsTo(models.Specialty, { foreignKey: 'specialtyId', as: 'specialtyData' });
    }
  };

  return ICD10Catalog;
};
