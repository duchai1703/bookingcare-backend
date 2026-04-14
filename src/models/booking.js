// SRS Section 4.2 – Bảng Booking (State Machine: S1→S2→S3/S4)
module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define('Booking', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    statusId:           { type: DataTypes.STRING(10), allowNull: false },
    doctorId:           { type: DataTypes.INTEGER, allowNull: false },
    patientId:          { type: DataTypes.INTEGER, allowNull: false },
    date:               { type: DataTypes.STRING(20), allowNull: false },
    timeType:           { type: DataTypes.STRING(10), allowNull: false },
    token:              { type: DataTypes.STRING(255), allowNull: false },
    reason:             { type: DataTypes.TEXT, allowNull: true },
    patientName:        { type: DataTypes.STRING(255), allowNull: true },
    patientPhoneNumber: { type: DataTypes.STRING(20), allowNull: true },
    patientAddress:     { type: DataTypes.STRING(255), allowNull: true },
    patientGender:      { type: DataTypes.STRING(10), allowNull: true },
    patientBirthday:    { type: DataTypes.STRING(20), allowNull: true },
  }, {
    // [v3.0] Đánh index cho các cột truy vấn thường xuyên
    indexes: [
      { fields: ['patientId'], name: 'idx_bookings_patientId' },           // GET /patient/bookings
      { fields: ['statusId'], name: 'idx_bookings_statusId' },             // Filter theo tab (S1-S4)
      { fields: ['patientId', 'statusId'], name: 'idx_bookings_patient_status' }, // Composite index
      { fields: ['doctorId', 'date'], name: 'idx_bookings_doctor_date' },  // getListPatientForDoctor
    ],
  });
  return Booking;
};
