// bookingcare-backend/src/models/booking_medicine.js
// [Phase A] Bảng trung gian N:M giữa Booking và Medicine
// Lưu chi tiết đơn thuốc: số lượng, liều dùng, hướng dẫn sử dụng
module.exports = (sequelize, DataTypes) => {
  const BookingMedicine = sequelize.define('BookingMedicine', {
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    bookingId:         { type: DataTypes.INTEGER, allowNull: false },
    medicineId:        { type: DataTypes.INTEGER, allowNull: false },
    quantity:          { type: DataTypes.INTEGER,     allowNull: true },
    dosage:            { type: DataTypes.STRING(255), allowNull: true }, // "1 viên/ngày sau ăn"
    usageInstructions: { type: DataTypes.TEXT,        allowNull: true },
  }, {
    indexes: [
      { fields: ['bookingId'],  name: 'idx_booking_medicine_bookingId' },
      { fields: ['medicineId'], name: 'idx_booking_medicine_medicineId' },
    ],
  });
  return BookingMedicine;
};
