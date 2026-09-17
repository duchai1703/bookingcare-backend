// SRS Section 4.2 – Bảng Doctor_Assignment (Phân bổ Bác sĩ vào Chuyên khoa tại Cơ sở y tế)
module.exports = (sequelize, DataTypes) => {
  const Doctor_Assignment = sequelize.define('Doctor_Assignment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    doctorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    clinicId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    specialtyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    clinicSpecialtyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    roomNumber: {
      type: DataTypes.STRING(100),
      allowNull: true, // Ví dụ: "Phòng khám 302 - Tầng 3 Tòa B"
    },
    priceId: {
      type: DataTypes.STRING(10),
      allowNull: true, // Giá khám riêng tại cơ sở (PRI1, PRI2, PRI3)
    },
    commissionRate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 15.00, // Tỷ lệ hoa hồng thỏa thuận riêng tại cơ sở này
    },
    workingStatus: {
      type: DataTypes.STRING(20),
      defaultValue: 'active', // 'active' | 'paused' | 'suspended'
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: true, // Chỉ định nơi làm việc chính (đồng bộ sang Doctor_Info)
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'Doctor_Assignments',
    indexes: [
      {
        unique: true,
        fields: ['doctorId', 'clinicId', 'specialtyId'],
        name: 'idx_doctor_assignment_unique',
      },
      {
        fields: ['doctorId'],
        name: 'idx_doctor_assignment_doctorId',
      },
      {
        fields: ['clinicId'],
        name: 'idx_doctor_assignment_clinicId',
      },
      {
        fields: ['specialtyId'],
        name: 'idx_doctor_assignment_specialtyId',
      },
      {
        fields: ['clinicId', 'specialtyId'],
        name: 'idx_doctor_assignment_clinic_specialty',
      },
    ],
  });

  return Doctor_Assignment;
};
