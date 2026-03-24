'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT,
    logging: false,
  }
);

const db = {};

// Auto-load tất cả model files trong thư mục models/
fs.readdirSync(__dirname)
  .filter(file => file !== 'index.js' && file.endsWith('.js'))
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

// ===== ASSOCIATIONS (SRS Section 4.1 ERD) =====

// ─────────────────────────────────────────────────────
// 🔗 User ↔ Doctor_Info (1:1)
// Một User (role Doctor) có một Doctor_Info
// ─────────────────────────────────────────────────────
db.User.hasOne(db.Doctor_Info, {
  foreignKey: 'doctorId',
  as: 'doctorInfoData',   // include: [{ model: Doctor_Info, as: 'doctorInfoData' }]
});
db.Doctor_Info.belongsTo(db.User, {
  foreignKey: 'doctorId',
  as: 'doctorData',       // include: [{ model: User, as: 'doctorData' }]
});

// ─────────────────────────────────────────────────────
// 🔗 Specialty ↔ Doctor_Info (1:N)
// Một Specialty có nhiều bác sĩ
// ─────────────────────────────────────────────────────
db.Specialty.hasMany(db.Doctor_Info, {
  foreignKey: 'specialtyId',
  as: 'specialtyDoctors', // include: [{ model: Doctor_Info, as: 'specialtyDoctors' }]
});
db.Doctor_Info.belongsTo(db.Specialty, {
  foreignKey: 'specialtyId',
  as: 'specialtyData',    // include: [{ model: Specialty, as: 'specialtyData' }]
});

// ─────────────────────────────────────────────────────
// 🔗 Clinic ↔ Doctor_Info (1:N)
// Một Clinic có nhiều bác sĩ
// ─────────────────────────────────────────────────────
db.Clinic.hasMany(db.Doctor_Info, {
  foreignKey: 'clinicId',
  as: 'clinicDoctors',    // include: [{ model: Doctor_Info, as: 'clinicDoctors' }]
});
db.Doctor_Info.belongsTo(db.Clinic, {
  foreignKey: 'clinicId',
  as: 'clinicData',       // include: [{ model: Clinic, as: 'clinicData' }]
});

// ─────────────────────────────────────────────────────
// 🔗 User (Doctor) ↔ Schedule (1:N)
// Một bác sĩ có nhiều lịch khám
// ─────────────────────────────────────────────────────
db.User.hasMany(db.Schedule, {
  foreignKey: 'doctorId',
  as: 'scheduleData',     // include: [{ model: Schedule, as: 'scheduleData' }]
});
db.Schedule.belongsTo(db.User, {
  foreignKey: 'doctorId',
  as: 'doctorData',       // include: [{ model: User, as: 'doctorData' }]
});

// ─────────────────────────────────────────────────────
// 🔗 User (Doctor) ↔ Booking (1:N) — phía bác sĩ
// ─────────────────────────────────────────────────────
db.User.hasMany(db.Booking, {
  foreignKey: 'doctorId',
  as: 'doctorBookings',   // include: [{ model: Booking, as: 'doctorBookings' }]
});
db.Booking.belongsTo(db.User, {
  foreignKey: 'doctorId',
  as: 'doctorBookingData', // include: [{ model: User, as: 'doctorBookingData' }]
});

// ─────────────────────────────────────────────────────
// 🔗 User (Patient) ↔ Booking (1:N) — phía bệnh nhân
// ─────────────────────────────────────────────────────
db.User.hasMany(db.Booking, {
  foreignKey: 'patientId',
  as: 'patientBookings',  // include: [{ model: Booking, as: 'patientBookings' }]
});
db.Booking.belongsTo(db.User, {
  foreignKey: 'patientId',
  as: 'patientData',      // include: [{ model: User, as: 'patientData' }]
});

// ─────────────────────────────────────────────────────
// 🔗 Allcode ↔ User (tra cứu gender, positionId, roleId)
// ─────────────────────────────────────────────────────
db.Allcode.hasMany(db.User, { foreignKey: 'gender',     sourceKey: 'keyMap', as: 'genderUsers' });
db.Allcode.hasMany(db.User, { foreignKey: 'positionId', sourceKey: 'keyMap', as: 'positionUsers' });
db.Allcode.hasMany(db.User, { foreignKey: 'roleId',     sourceKey: 'keyMap', as: 'roleUsers' });

db.User.belongsTo(db.Allcode, { foreignKey: 'gender',     targetKey: 'keyMap', as: 'genderData' });
db.User.belongsTo(db.Allcode, { foreignKey: 'positionId', targetKey: 'keyMap', as: 'positionData' });
db.User.belongsTo(db.Allcode, { foreignKey: 'roleId',     targetKey: 'keyMap', as: 'roleData' });

// ─────────────────────────────────────────────────────
// 🔗 Allcode ↔ Doctor_Info (tra cứu priceId, provinceId, paymentId)
// ─────────────────────────────────────────────────────
db.Allcode.hasMany(db.Doctor_Info, { foreignKey: 'priceId',    sourceKey: 'keyMap', as: 'priceDoctor' });
db.Allcode.hasMany(db.Doctor_Info, { foreignKey: 'provinceId', sourceKey: 'keyMap', as: 'provinceDoctor' });
db.Allcode.hasMany(db.Doctor_Info, { foreignKey: 'paymentId',  sourceKey: 'keyMap', as: 'paymentDoctor' });

db.Doctor_Info.belongsTo(db.Allcode, { foreignKey: 'priceId',    targetKey: 'keyMap', as: 'priceData' });
db.Doctor_Info.belongsTo(db.Allcode, { foreignKey: 'provinceId', targetKey: 'keyMap', as: 'provinceData' });
db.Doctor_Info.belongsTo(db.Allcode, { foreignKey: 'paymentId',  targetKey: 'keyMap', as: 'paymentData' });

// ─────────────────────────────────────────────────────
// 🔗 Allcode ↔ Schedule (tra cứu timeType)
// ─────────────────────────────────────────────────────
db.Allcode.hasMany(db.Schedule, { foreignKey: 'timeType', sourceKey: 'keyMap', as: 'timeTypeSchedules' });
db.Schedule.belongsTo(db.Allcode, { foreignKey: 'timeType', targetKey: 'keyMap', as: 'timeTypeData' });

// ─────────────────────────────────────────────────────
// 🔗 Allcode ↔ Booking (tra cứu statusId, timeType, patientGender)
// ─────────────────────────────────────────────────────
db.Allcode.hasMany(db.Booking, { foreignKey: 'statusId',      sourceKey: 'keyMap', as: 'statusBookings' });
db.Allcode.hasMany(db.Booking, { foreignKey: 'timeType',      sourceKey: 'keyMap', as: 'timeTypeBookings' });
db.Allcode.hasMany(db.Booking, { foreignKey: 'patientGender', sourceKey: 'keyMap', as: 'genderBookings' });

db.Booking.belongsTo(db.Allcode, { foreignKey: 'statusId',      targetKey: 'keyMap', as: 'statusData' });
db.Booking.belongsTo(db.Allcode, { foreignKey: 'timeType',      targetKey: 'keyMap', as: 'timeTypeBooking' });
db.Booking.belongsTo(db.Allcode, { foreignKey: 'patientGender', targetKey: 'keyMap', as: 'genderBookingData' });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
