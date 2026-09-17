// src/models/booking_attachment.js
// Tài liệu y tế đính kèm cho lịch hẹn khám (PDF, PNG, JPG, WEBP)
module.exports = (sequelize, DataTypes) => {
  const BookingAttachment = sequelize.define('BookingAttachment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fileType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileData: {
      type: DataTypes.TEXT, // Lưu chuỗi base64 của tệp đính kèm
      allowNull: false,
    },
  }, {
    tableName: 'Booking_Attachments',
    timestamps: true,
    indexes: [
      { fields: ['bookingId'], name: 'idx_booking_attachments_bookingId' },
      { fields: ['patientId'], name: 'idx_booking_attachments_patientId' },
    ],
  });

  return BookingAttachment;
};
