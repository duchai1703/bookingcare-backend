// bookingcare-backend/src/models/clinical_snippet.js
// [Clinical Smart Assistant] Mẫu ghi chép lâm sàng & Snippet chèn nhanh (; hoặc /)
module.exports = (sequelize, DataTypes) => {
  const ClinicalSnippet = sequelize.define('ClinicalSnippet', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    triggerKey: {
      type: DataTypes.STRING(50),
      allowNull: false, // Ví dụ: ";kham-goi", ";tai-kham", ";sinh-hoat"
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false, // Tiêu đề hiển thị trong popup
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false, // Nội dung sẽ được chèn vào văn bản
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false, // 'clinical_exam' | 'treatment_plan' | 'care_instructions' | 'general'
      defaultValue: 'general',
    },
    scope: {
      type: DataTypes.STRING(20),
      defaultValue: 'SYSTEM', // 'SYSTEM' (hệ thống dùng chung) | 'DOCTOR' (mẫu cá nhân)
    },
    doctorId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Nếu scope === 'DOCTOR'
    },
    specialtyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'Clinical_Snippets',
    timestamps: true,
    indexes: [
      { fields: ['triggerKey'], name: 'idx_snippet_trigger' },
      { fields: ['doctorId'], name: 'idx_snippet_doctor' },
      { fields: ['specialtyId'], name: 'idx_snippet_specialty' },
      { fields: ['category'], name: 'idx_snippet_category' },
    ],
  });

  ClinicalSnippet.associate = (models) => {
    if (models.User) {
      ClinicalSnippet.belongsTo(models.User, { foreignKey: 'doctorId', as: 'doctorData' });
    }
    if (models.Specialty) {
      ClinicalSnippet.belongsTo(models.Specialty, { foreignKey: 'specialtyId', as: 'specialtyData' });
    }
  };

  return ClinicalSnippet;
};
