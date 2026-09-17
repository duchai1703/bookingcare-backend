// src/models/patient_bank_account.js
// Quản lý danh sách tài khoản ngân hàng nhận tiền hoàn của bệnh nhân (SRS Section 4.2)
module.exports = (sequelize, DataTypes) => {
  const PatientBankAccount = sequelize.define('PatientBankAccount', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bankName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    accountNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    accountHolderName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    accountHolder: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('accountHolderName');
      },
      set(val) {
        this.setDataValue('accountHolderName', val);
      },
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'Patient_Bank_Accounts',
    timestamps: true,
    indexes: [
      { fields: ['patientId'], name: 'idx_patient_bank_accounts_patientId' },
      { fields: ['patientId', 'isPrimary'], name: 'idx_patient_bank_accounts_primary' },
    ],
  });

  return PatientBankAccount;
};
