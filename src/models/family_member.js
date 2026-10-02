// src/models/family_member.js
// Sổ Y Bạ Gia Đình — Quản lý hồ sơ người thân (HL7 FHIR RelatedPerson / Dependent)
module.exports = (sequelize, DataTypes) => {
  const FamilyMember = sequelize.define('Family_Member', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fullName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    relationship: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'CHILD', // 'CHILD' | 'PARENT' | 'SPOUSE' | 'OTHER'
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'G1', // 'G1' (Nam) | 'G2' (Nữ) | 'G3' (Khác)
    },
    birthday: {
      type: DataTypes.STRING(20),
      allowNull: true, // "YYYY-MM-DD"
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    nationalId: {
      type: DataTypes.STRING(50),
      allowNull: true, // CCCD / BHYT / Mã định danh cá nhân
    },
    medicalHistory: {
      type: DataTypes.TEXT,
      allowNull: true, // Tiền sử dị ứng thuốc, bệnh lý bẩm sinh
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'family_members',
    timestamps: true,
    indexes: [
      { fields: ['userId'], name: 'idx_family_members_user_id' },
      { fields: ['relationship'], name: 'idx_family_members_relationship' },
    ],
  });

  FamilyMember.associate = (models) => {
    FamilyMember.belongsTo(models.User, { foreignKey: 'userId', as: 'guardian' });
    FamilyMember.hasMany(models.Booking, { foreignKey: 'familyMemberId', as: 'bookings' });
  };

  return FamilyMember;
};
