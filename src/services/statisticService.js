// src/services/statisticService.js
// [Phase 10] Raw Query Statistics — Admin Dashboard
const db = require('../models');

// [CODEX AUDIT FIX] Sequelize đã set timezone: '+07:00' trong models/index.js
// => MySQL session tự hiểu +07:00 => KHÔNG CẦN CONVERT_TZ trong Raw Query.
// => Chỉ cần FROM_UNIXTIME đơn giản.

// 1. Overview — 4 KPI
const getOverviewStatistics = async (fromTimestamp, toTimestamp) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const [bookingResult] = await db.sequelize.query(
    `SELECT COUNT(*) AS totalBookings FROM Bookings
     WHERE CAST(date AS UNSIGNED) >= :from AND CAST(date AS UNSIGNED) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const [doctorResult] = await db.sequelize.query(
    `SELECT COUNT(DISTINCT doctorId) AS totalDoctors FROM Schedules
     WHERE CAST(date AS UNSIGNED) >= :from AND CAST(date AS UNSIGNED) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const [patientResult] = await db.sequelize.query(
    `SELECT COUNT(DISTINCT patientId) AS totalPatients FROM Bookings
     WHERE CAST(date AS UNSIGNED) >= :from AND CAST(date AS UNSIGNED) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const [revenueResult] = await db.sequelize.query(
    `SELECT COUNT(*) AS completedBookings FROM Bookings
     WHERE statusId = 'S3'
       AND CAST(date AS UNSIGNED) >= :from AND CAST(date AS UNSIGNED) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  return {
    totalBookings: bookingResult?.totalBookings || 0,
    totalDoctors: doctorResult?.totalDoctors || 0,
    totalPatients: patientResult?.totalPatients || 0,
    completedBookings: revenueResult?.completedBookings || 0,
  };
};

// 2. Bookings by Day — Line Chart
// [CODEX AUDIT FIX] Không dùng CONVERT_TZ vì Sequelize đã set timezone: '+07:00'
// FROM_UNIXTIME sẽ tự hiểu theo session timezone (+07:00) → kết quả đúng.
// ORDER BY ASC — tránh Recharts zigzag
const getBookingsByDay = async (fromTimestamp, toTimestamp) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const results = await db.sequelize.query(
    `SELECT
       DATE(FROM_UNIXTIME(CAST(date AS UNSIGNED) / 1000)) AS bookingDate,
       COUNT(*) AS count
     FROM Bookings
     WHERE CAST(date AS UNSIGNED) >= :from AND CAST(date AS UNSIGNED) <= :to
     GROUP BY bookingDate
     ORDER BY bookingDate ASC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );
  return results;
};

// 3. Bookings by Status — Pie Chart
const getBookingsByStatus = async (fromTimestamp, toTimestamp) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const results = await db.sequelize.query(
    `SELECT b.statusId, a.valueVi AS statusNameVi, a.valueEn AS statusNameEn, COUNT(*) AS count
     FROM Bookings b
     LEFT JOIN Allcodes a ON b.statusId = a.keyMap AND a.type = 'STATUS'
     WHERE CAST(b.date AS UNSIGNED) >= :from AND CAST(b.date AS UNSIGNED) <= :to
     GROUP BY b.statusId, a.valueVi, a.valueEn
     ORDER BY count DESC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );
  return results;
};

// 4. Top Specialties — Bar Chart
const getTopSpecialties = async (fromTimestamp, toTimestamp, limit) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const results = await db.sequelize.query(
    `SELECT s.name AS specialtyName, COUNT(*) AS count
     FROM Bookings b
     INNER JOIN Doctor_Infos di ON b.doctorId = di.doctorId
     INNER JOIN Specialties s ON di.specialtyId = s.id
     WHERE CAST(b.date AS UNSIGNED) >= :from AND CAST(b.date AS UNSIGNED) <= :to
     GROUP BY s.id, s.name
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { from: fromStr, to: toStr, limit }, type: db.sequelize.QueryTypes.SELECT }
  );
  return results;
};

// 5. Top Doctors — Bar Chart
const getTopDoctors = async (fromTimestamp, toTimestamp, limit) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const results = await db.sequelize.query(
    `SELECT u.id AS doctorId, CONCAT(u.lastName, ' ', u.firstName) AS doctorName, COUNT(*) AS count
     FROM Bookings b
     INNER JOIN Users u ON b.doctorId = u.id
     WHERE CAST(b.date AS UNSIGNED) >= :from AND CAST(b.date AS UNSIGNED) <= :to
     GROUP BY u.id, u.lastName, u.firstName
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { from: fromStr, to: toStr, limit }, type: db.sequelize.QueryTypes.SELECT }
  );
  return results;
};

module.exports = { getOverviewStatistics, getBookingsByDay, getBookingsByStatus, getTopSpecialties, getTopDoctors };
