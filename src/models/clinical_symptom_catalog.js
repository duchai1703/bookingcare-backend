// bookingcare-backend/src/models/clinical_symptom_catalog.js
// [Clinical Smart Assistant] Danh mục triệu chứng cơ năng & thực thể lâm sàng
module.exports = (sequelize, DataTypes) => {
  const ClinicalSymptomCatalog = sequelize.define('ClinicalSymptomCatalog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
      allowNull: true, // Ví dụ: "đau nhức đầu gối, mỏi gối, lục cục khớp"
    },
    bodyPart: {
      type: DataTypes.STRING(100),
      allowNull: true, // Khớp gối, Cột sống thắt lưng, Cột sống cổ, Khớp vai...
    },
    specialtyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    suggestedIcdCodes: {
      type: DataTypes.TEXT,
      allowNull: true, // JSON hoặc chuỗi mã ICD-10 gợi ý: "M17,M25.5"
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'Clinical_Symptom_Catalogs',
    timestamps: true,
    indexes: [
      { fields: ['specialtyId'], name: 'idx_symptom_specialty' },
      { fields: ['bodyPart'], name: 'idx_symptom_body_part' },
      { fields: ['isActive'], name: 'idx_symptom_active' },
    ],
  });

  ClinicalSymptomCatalog.associate = (models) => {
    if (models.Specialty) {
      ClinicalSymptomCatalog.belongsTo(models.Specialty, { foreignKey: 'specialtyId', as: 'specialtyData' });
    }
  };

  return ClinicalSymptomCatalog;
};
