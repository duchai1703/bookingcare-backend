// src/services/statisticService.js
// [Phase 10] Raw Query Statistics — Admin Dashboard
const db = require('../models');

// [PostgreSQL Migration] Sequelize đã set timezone: 'Asia/Ho_Chi_Minh' trong models/index.js
// => PostgreSQL session timezone = 'Asia/Ho_Chi_Minh' (UTC+07).
// => Dùng TO_TIMESTAMP thay FROM_UNIXTIME. Dùng CAST(date AS BIGINT) thay CAST(date AS UNSIGNED).

// 1. Overview — 4 KPI
const getOverviewStatistics = async (fromTimestamp, toTimestamp) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const [bookingResult] = await db.sequelize.query(
    `SELECT COUNT(*) AS "totalBookings" FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const [doctorResult] = await db.sequelize.query(
    `SELECT COUNT(DISTINCT "doctorId") AS "totalDoctors" FROM "Schedules"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const [patientResult] = await db.sequelize.query(
    `SELECT COUNT(DISTINCT "patientId") AS "totalPatients" FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const [revenueResult] = await db.sequelize.query(
    `SELECT COUNT(*) AS "completedBookings" FROM "Bookings"
     WHERE "statusId" = 'S3'
       AND CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
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
// [PostgreSQL Migration] TO_TIMESTAMP thay FROM_UNIXTIME
// ORDER BY ASC — tránh Recharts zigzag
const getBookingsByDay = async (fromTimestamp, toTimestamp) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const results = await db.sequelize.query(
    `SELECT
       DATE(TO_TIMESTAMP(CAST(date AS BIGINT) / 1000)) AS "bookingDate",
       COUNT(*) AS count
     FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to
     GROUP BY "bookingDate"
     ORDER BY "bookingDate" ASC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );
  return results;
};

// 3. Bookings by Status — Pie Chart
const getBookingsByStatus = async (fromTimestamp, toTimestamp) => {
  const fromStr = String(fromTimestamp);
  const toStr = String(toTimestamp);

  const results = await db.sequelize.query(
    `SELECT b."statusId", a."valueVi" AS "statusNameVi", a."valueEn" AS "statusNameEn", COUNT(*) AS count
     FROM "Bookings" b
     LEFT JOIN "Allcodes" a ON b."statusId" = a."keyMap" AND a.type = 'STATUS'
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     GROUP BY b."statusId", a."valueVi", a."valueEn"
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
    `SELECT s.name AS "specialtyName", COUNT(*) AS count
     FROM "Bookings" b
     INNER JOIN "Doctor_Infos" di ON b."doctorId" = di."doctorId"
     INNER JOIN "Specialties" s ON di."specialtyId" = s.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
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
    `SELECT u.id AS "doctorId", CONCAT(u."lastName", ' ', u."firstName") AS "doctorName", COUNT(*) AS count
     FROM "Bookings" b
     INNER JOIN "Users" u ON b."doctorId" = u.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     GROUP BY u.id, u."lastName", u."firstName"
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { from: fromStr, to: toStr, limit }, type: db.sequelize.QueryTypes.SELECT }
  );
  return results;
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase B.6] Revenue Statistics — Admin
// ═══════════════════════════════════════════════════════════════════════

// B.6.1 — Doanh thu theo tháng (toàn hệ thống)
const getMonthlyRevenue = async (year) => {
  const targetYear = year || new Date().getFullYear();
  const results = await db.sequelize.query(
    `SELECT
       EXTRACT(MONTH FROM TO_TIMESTAMP(CAST(date AS BIGINT) / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh')::INT AS month,
       SUM("bookingPrice") AS revenue,
       COUNT(*) AS count
     FROM "Bookings"
     WHERE "statusId" = 'S3'
       AND "paymentStatus" = 'paid'
       AND date LIKE :yearPattern
     GROUP BY month
     ORDER BY month ASC`,
    { replacements: { yearPattern: `${targetYear}-%` }, type: db.sequelize.QueryTypes.SELECT }
  );

  // Build full 12-month array
  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, count: 0 }));
  results.forEach(r => {
    const idx = parseInt(r.month, 10) - 1;
    if (idx >= 0 && idx < 12) {
      monthly[idx].revenue = parseFloat(r.revenue) || 0;
      monthly[idx].count   = parseInt(r.count, 10) || 0;
    }
  });
  const total = monthly.reduce((s, m) => s + m.revenue, 0);
  return { errCode: 0, data: { monthly, total, year: targetYear } };
};

// B.6.2 — Doanh thu theo bác sĩ
const getRevenueByDoctor = async (from, to) => {
  const results = await db.sequelize.query(
    `SELECT
       b."doctorId",
       CONCAT(u."lastName", ' ', u."firstName") AS "doctorName",
       SUM(b."bookingPrice") AS revenue,
       COUNT(*) AS count
     FROM "Bookings" b
     INNER JOIN "Users" u ON b."doctorId" = u.id
     WHERE b."statusId" = 'S3'
       AND b."paymentStatus" = 'paid'
       AND b.date >= :from AND b.date <= :to
     GROUP BY b."doctorId", u."lastName", u."firstName"
     ORDER BY revenue DESC
     LIMIT 20`,
    { replacements: { from, to }, type: db.sequelize.QueryTypes.SELECT }
  );
  return {
    errCode: 0,
    data: results.map(r => ({ ...r, revenue: parseFloat(r.revenue) || 0, count: parseInt(r.count, 10) || 0 }))
  };
};

// B.6.3 — Doanh thu theo phòng khám
const getRevenueByClinic = async (from, to) => {
  const results = await db.sequelize.query(
    `SELECT
       c.id AS "clinicId",
       c.name AS "clinicName",
       SUM(b."bookingPrice") AS revenue,
       COUNT(*) AS count
     FROM "Bookings" b
     INNER JOIN "Doctor_Infos" di ON b."doctorId" = di."doctorId"
     INNER JOIN "Clinics" c ON di."clinicId" = c.id
     WHERE b."statusId" = 'S3'
       AND b."paymentStatus" = 'paid'
       AND b.date >= :from AND b.date <= :to
     GROUP BY c.id, c.name
     ORDER BY revenue DESC`,
    { replacements: { from, to }, type: db.sequelize.QueryTypes.SELECT }
  );
  return {
    errCode: 0,
    data: results.map(r => ({ ...r, revenue: parseFloat(r.revenue) || 0, count: parseInt(r.count, 10) || 0 }))
  };
};

// B.6.4 — Doanh thu theo chuyên khoa
const getRevenueBySpecialty = async (from, to) => {
  const results = await db.sequelize.query(
    `SELECT
       s.id AS "specialtyId",
       s.name AS "specialtyName",
       SUM(b."bookingPrice") AS revenue,
       COUNT(*) AS count
     FROM "Bookings" b
     INNER JOIN "Doctor_Infos" di ON b."doctorId" = di."doctorId"
     INNER JOIN "Specialties" s ON di."specialtyId" = s.id
     WHERE b."statusId" = 'S3'
       AND b."paymentStatus" = 'paid'
       AND b.date >= :from AND b.date <= :to
     GROUP BY s.id, s.name
     ORDER BY revenue DESC`,
    { replacements: { from, to }, type: db.sequelize.QueryTypes.SELECT }
  );
  return {
    errCode: 0,
    data: results.map(r => ({ ...r, revenue: parseFloat(r.revenue) || 0, count: parseInt(r.count, 10) || 0 }))
  };
};

module.exports = {
  getOverviewStatistics,
  getBookingsByDay,
  getBookingsByStatus,
  getTopSpecialties,
  getTopDoctors,
  // [Phase B.6]
  getMonthlyRevenue,
  getRevenueByDoctor,
  getRevenueByClinic,
  getRevenueBySpecialty,
};
