// src/models/review.js
// Phase 9 — Bảng Reviews: Đánh giá bác sĩ sau khám (Design Document v3.0, Mục 3.2)
// Ràng buộc: UNIQUE(bookingId) → mỗi booking chỉ được review 1 lần
// Index: doctorId, patientId → tối ưu truy vấn JOIN/WHERE khi dữ liệu lớn
module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define('Review', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId:  { type: DataTypes.INTEGER, allowNull: false },
    patientId: { type: DataTypes.INTEGER, allowNull: false },
    bookingId: { type: DataTypes.INTEGER, allowNull: false, unique: true }, // Chống click đúp + auto index
    rating:    { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    comment:   { type: DataTypes.TEXT, allowNull: true },
  }, {
    // [v2.0] Đánh index tường minh cho doctorId, patientId
    indexes: [
      { fields: ['doctorId'], name: 'idx_reviews_doctorId' },   // Tối ưu GET /doctors/:id/reviews
      { fields: ['patientId'], name: 'idx_reviews_patientId' }, // Tối ưu query theo bệnh nhân
    ],
  });
  return Review;
};
