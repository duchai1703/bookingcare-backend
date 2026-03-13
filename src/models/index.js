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

// User ↔ Doctor_Info (1:1)
db.User.hasOne(db.Doctor_Info, { foreignKey: 'doctorId', as: 'doctorInfoData' });
db.Doctor_Info.belongsTo(db.User, { foreignKey: 'doctorId' });

// Doctor_Info ↔ Specialty (N:1)
db.Doctor_Info.belongsTo(db.Specialty, { foreignKey: 'specialtyId', as: 'specialtyData' });

// Doctor_Info ↔ Clinic (N:1)
db.Doctor_Info.belongsTo(db.Clinic, { foreignKey: 'clinicId', as: 'clinicData' });

// User (Doctor) ↔ Schedule (1:N)
db.User.hasMany(db.Schedule, { foreignKey: 'doctorId' });
db.Schedule.belongsTo(db.User, { foreignKey: 'doctorId' });

// Allcode ↔ User
db.Allcode.hasMany(db.User, { foreignKey: 'positionId', sourceKey: 'keyMap', as: 'positionUsers' });
db.Allcode.hasMany(db.User, { foreignKey: 'gender', sourceKey: 'keyMap', as: 'genderUsers' });
db.User.belongsTo(db.Allcode, { foreignKey: 'positionId', targetKey: 'keyMap', as: 'positionData' });
db.User.belongsTo(db.Allcode, { foreignKey: 'gender', targetKey: 'keyMap', as: 'genderData' });

// Allcode ↔ Doctor_Info
db.Doctor_Info.belongsTo(db.Allcode, { foreignKey: 'priceId', targetKey: 'keyMap', as: 'priceData' });
db.Doctor_Info.belongsTo(db.Allcode, { foreignKey: 'paymentId', targetKey: 'keyMap', as: 'paymentData' });
db.Doctor_Info.belongsTo(db.Allcode, { foreignKey: 'provinceId', targetKey: 'keyMap', as: 'provinceData' });

// Allcode ↔ Schedule
db.Schedule.belongsTo(db.Allcode, { foreignKey: 'timeType', targetKey: 'keyMap', as: 'timeTypeData' });

// Booking relationships
db.User.hasMany(db.Booking, { foreignKey: 'patientId', as: 'patientBookings' });
db.Booking.belongsTo(db.User, { foreignKey: 'patientId', as: 'patientData' });
db.Booking.belongsTo(db.User, { foreignKey: 'doctorId', as: 'doctorBookingData' });
db.Booking.belongsTo(db.Allcode, { foreignKey: 'timeType', targetKey: 'keyMap', as: 'timeTypeBooking' });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
