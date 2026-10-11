// bookingcare-backend/src/models/doctor_clinical_preference.js
// [Clinical Smart Assistant] Thống kê tần suất lựa chọn lâm sàng của bác sĩ để cá nhân hóa ranking
module.exports = (sequelize, DataTypes) => {
  const DoctorClinicalPreference = sequelize.define('DoctorClinicalPreference', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    doctorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    termType: {
      type: DataTypes.STRING(20),
      allowNull: false, // 'ICD10' | 'SYMPTOM' | 'SNIPPET'
    },
    termKey: {
      type: DataTypes.STRING(50),
      allowNull: false, // Mã ICD-10 (VD: 'M17') hoặc mã thuật ngữ
    },
    frequency: {
      type: DataTypes.INTEGER,
      defaultValue: 1, // Tần suất sử dụng
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'Doctor_Clinical_Preferences',
    timestamps: true,
    indexes: [
      { fields: ['doctorId', 'termType', 'termKey'], unique: true, name: 'idx_pref_doc_term' },
      { fields: ['doctorId', 'termType'], name: 'idx_pref_doc_type' },
    ],
  });

  DoctorClinicalPreference.associate = (models) => {
    if (models.User) {
      DoctorClinicalPreference.belongsTo(models.User, { foreignKey: 'doctorId', as: 'doctorData' });
    }
  };

  return DoctorClinicalPreference;
};
