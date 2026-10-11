// bookingcare-backend/src/models/doctor_shorthand.js
// Model quản lý từ viết tắt & cụm từ gõ nhanh lâm sàng của Bác sĩ (Doctor Shorthands / DotPhrases)
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DoctorShorthand extends Model {
    static associate(models) {
      // Liên kết với Bác sĩ sở hữu (nếu doctorId null nghĩa là từ viết tắt hệ thống toàn viện)
      DoctorShorthand.belongsTo(models.User, {
        foreignKey: 'doctorId',
        as: 'doctorData',
      });
    }
  }

  DoctorShorthand.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      doctorId: {
        type: DataTypes.INTEGER,
        allowNull: true, // null = SYSTEM shorthand
      },
      shortCode: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Mã gõ tắt (VD: tha, vkdt, ktp, u2v, thkh)',
      },
      expandedText: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Nội dung mở rộng bung ra hoàn chỉnh',
      },
      targetField: {
        type: DataTypes.STRING(50),
        defaultValue: 'ALL',
        allowNull: false,
        comment: 'Phạm vi ô: ALL, diagnosis, symptoms, clinicalNotes, treatmentPlan, careInstructions, medicineUsage, chiefComplaint',
      },
      category: {
        type: DataTypes.STRING(50),
        defaultValue: 'CLINICAL',
        comment: 'Phân loại: CLINICAL, EXAM, DIAGNOSIS, PRESCRIPTION, ADVICE',
      },
      usageCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Số lần bác sĩ đã gõ mã này để sắp xếp ưu tiên',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'DoctorShorthand',
      tableName: 'Doctor_Shorthands',
      timestamps: true,
      indexes: [
        {
          fields: ['doctorId', 'shortCode'],
        },
        {
          fields: ['targetField'],
        },
        {
          fields: ['usageCount'],
        },
      ],
    }
  );

  return DoctorShorthand;
};
