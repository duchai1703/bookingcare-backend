// SRS Section 4.2 – Bảng Clinic_Specialty (Quan hệ Chuyên khoa trực thuộc Cơ sở y tế)
module.exports = (sequelize, DataTypes) => {
  const Clinic_Specialty = sequelize.define('Clinic_Specialty', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    clinicId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    specialtyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active', // 'active' | 'paused'
    },
    headDoctorId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Trưởng khoa tại cơ sở y tế
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true, // Mô tả, phác đồ, năng lực riêng của khoa tại cơ sở này
    },
    targetCapacity: {
      type: DataTypes.INTEGER,
      defaultValue: 50, // Chỉ tiêu ca khám / tuần tại cơ sở
    },
  }, {
    tableName: 'Clinic_Specialties',
    indexes: [
      {
        unique: true,
        fields: ['clinicId', 'specialtyId'],
        name: 'idx_clinic_specialty_unique',
      },
      {
        fields: ['clinicId'],
        name: 'idx_clinic_specialty_clinicId',
      },
      {
        fields: ['specialtyId'],
        name: 'idx_clinic_specialty_specialtyId',
      },
    ],
  });

  return Clinic_Specialty;
};
