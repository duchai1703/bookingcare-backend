// src/models/policy_target.js
// Financial Policy Engine — Bảng quan hệ đối tượng áp dụng chính sách phân cấp
module.exports = (sequelize, DataTypes) => {
  const Policy_Target = sequelize.define('Policy_Target', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    policyId:           { type: DataTypes.INTEGER, allowNull: false },
    targetType:         { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DOCTOR' }, // 'DOCTOR' | 'CLINIC' | 'SPECIALTY'
    doctorId:           { type: DataTypes.INTEGER, allowNull: true },
    clinicId:           { type: DataTypes.INTEGER, allowNull: true },
    specialtyId:        { type: DataTypes.INTEGER, allowNull: true },
    doctorAssignmentId: { type: DataTypes.INTEGER, allowNull: true },
    note:               { type: DataTypes.STRING(255), allowNull: true },
  }, {
    tableName: 'Policy_Targets',
    indexes: [
      { fields: ['policyId'], name: 'idx_policy_targets_policy' },
      { fields: ['doctorId', 'policyId'], name: 'idx_policy_targets_doctor' },
      { fields: ['clinicId', 'policyId'], name: 'idx_policy_targets_clinic' },
      { fields: ['specialtyId', 'policyId'], name: 'idx_policy_targets_specialty' },
    ],
  });
  return Policy_Target;
};
