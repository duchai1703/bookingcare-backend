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

    // ═══════════════════════════════════════════════════════════════════════
    // [Phase 11] VNPay Payment Integration — 9 cột mới
    // ═══════════════════════════════════════════════════════════════════════
    paymentToken:         { type: DataTypes.STRING(255), allowNull: true, unique: true },
    paymentStatus:        { type: DataTypes.STRING(10),  allowNull: true, defaultValue: 'unpaid' },
    bookingPrice:         { type: DataTypes.INTEGER,     allowNull: true, defaultValue: 0 },
    vnpayTransactionNo:   { type: DataTypes.STRING(50),  allowNull: true },
    vnp_PayDate:          { type: DataTypes.STRING(20),  allowNull: true },
    publicReceiptToken:   { type: DataTypes.STRING(100), allowNull: true, unique: true },
    receiptExpiredAt:     { type: DataTypes.DATE,        allowNull: true },
    reconcileFirstSeenAt: { type: DataTypes.DATE,        allowNull: true },
    lastQuerydrCode:      { type: DataTypes.STRING(4),   allowNull: true },
  }, {
    // [v3.0] Đánh index cho các cột truy vấn thường xuyên
    indexes: [
      { fields: ['patientId'], name: 'idx_bookings_patientId' },           // GET /patient/bookings
      { fields: ['statusId'], name: 'idx_bookings_statusId' },             // Filter theo tab (S1-S4)
      { fields: ['patientId', 'statusId'], name: 'idx_bookings_patient_status' }, // Composite index
      { fields: ['doctorId', 'date'], name: 'idx_bookings_doctor_date' },  // getListPatientForDoctor
      // [NEW LOGIC VNPAY-MAIL]: Composite Index cho Cronjob cleanupS1 (Lỗi 24 — chống Full Table Scan)
      { fields: ['statusId', 'paymentStatus'], name: 'idx_bookings_status_payment' },
    ],
  });
  return Booking;
};
