// src/services/statisticService.js
// [Phase 10] Raw Query Statistics — Admin Dashboard
const db = require('../models');
const moment = require('moment-timezone');

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

// ═══════════════════════════════════════════════════════════════════════
// [Phase E] Executive Master Dashboard & Detail Analytics Engine
// ═══════════════════════════════════════════════════════════════════════

const pctDiff = (curr, prev) => {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
};

// 1. Executive Master Dashboard Aggregation
const getExecutiveMaster = async (from, to, cmpFrom, cmpTo) => {
  const fromStr = String(from);
  const toStr = String(to);
  const duration = Number(to) - Number(from);
  const compareFromStr = String(cmpFrom || (Number(from) - duration));
  const compareToStr = String(cmpTo || from);

  // 1.1 Primary KPIs (Current Period)
  const [currMetrics] = await db.sequelize.query(
    `SELECT 
       COUNT(*) AS "totalBookings",
       COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END) AS "completedBookings",
       COUNT(CASE WHEN "statusId" = 'S4' THEN 1 END) AS "cancelledBookings",
       COUNT(CASE WHEN "statusId" IN ('S1', 'S1.5') THEN 1 END) AS "pendingBookings",
       COUNT(CASE WHEN "statusId" = 'S2' THEN 1 END) AS "confirmedBookings",
       COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0) AS "grossRevenue",
       COALESCE(SUM("refundAmount"), 0) AS "refundAmount"
     FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  // 1.2 Comparison KPIs (Previous Period)
  const [prevMetrics] = await db.sequelize.query(
    `SELECT 
       COUNT(*) AS "totalBookings",
       COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END) AS "completedBookings",
       COUNT(CASE WHEN "statusId" = 'S4' THEN 1 END) AS "cancelledBookings",
       COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0) AS "grossRevenue",
       COALESCE(SUM("refundAmount"), 0) AS "refundAmount"
     FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: compareFromStr, to: compareToStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const totalBookings = parseInt(currMetrics?.totalBookings || 0, 10);
  const prevTotalBookings = parseInt(prevMetrics?.totalBookings || 0, 10);
  const completedBookings = parseInt(currMetrics?.completedBookings || 0, 10);
  const prevCompletedBookings = parseInt(prevMetrics?.completedBookings || 0, 10);
  const cancelledBookings = parseInt(currMetrics?.cancelledBookings || 0, 10);
  const prevCancelledBookings = parseInt(prevMetrics?.cancelledBookings || 0, 10);

  const grossRevenue = parseFloat(currMetrics?.grossRevenue || 0);
  const prevGrossRevenue = parseFloat(prevMetrics?.grossRevenue || 0);
  const refundAmount = parseFloat(currMetrics?.refundAmount || 0);
  const prevRefundAmount = parseFloat(prevMetrics?.refundAmount || 0);
  const netRevenue = Math.max(0, grossRevenue - refundAmount);
  const prevNetRevenue = Math.max(0, prevGrossRevenue - prevRefundAmount);

  const completionRate = totalBookings > 0 ? Number(((completedBookings / totalBookings) * 100).toFixed(1)) : 0;
  const prevCompletionRate = prevTotalBookings > 0 ? Number(((prevCompletedBookings / prevTotalBookings) * 100).toFixed(1)) : 0;
  const cancellationRate = totalBookings > 0 ? Number(((cancelledBookings / totalBookings) * 100).toFixed(1)) : 0;
  const prevCancellationRate = prevTotalBookings > 0 ? Number(((prevCancelledBookings / prevTotalBookings) * 100).toFixed(1)) : 0;

  // 1.3 Patient Intel (New vs Returning)
  const [patientStats] = await db.sequelize.query(
    `SELECT 
       COUNT(DISTINCT "patientId") AS "totalPatients",
       COUNT(DISTINCT CASE WHEN prior.id IS NULL THEN b."patientId" END) AS "newPatients",
       COUNT(DISTINCT CASE WHEN prior.id IS NOT NULL THEN b."patientId" END) AS "returningPatients"
     FROM "Bookings" b
     LEFT JOIN LATERAL (
       SELECT id FROM "Bookings" p 
       WHERE p."patientId" = b."patientId" AND CAST(p.date AS BIGINT) < :from 
       LIMIT 1
     ) prior ON true
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const newPatients = parseInt(patientStats?.newPatients || 0, 10);
  const returningPatients = parseInt(patientStats?.returningPatients || 0, 10);
  const totalPatients = parseInt(patientStats?.totalPatients || 0, 10);

  // 1.4 Doctor Capacity & Utilization
  const [capacityStats] = await db.sequelize.query(
    `SELECT 
       COALESCE(SUM("maxNumber"), 0) AS "totalCapacitySlots",
       COALESCE(SUM("currentNumber"), 0) AS "totalOccupiedSlots",
       COUNT(DISTINCT "doctorId") AS "activeDoctors"
     FROM "Schedules"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const totalCapacitySlots = parseInt(capacityStats?.totalCapacitySlots || 0, 10);
  const totalOccupiedSlots = parseInt(capacityStats?.totalOccupiedSlots || 0, 10);
  const utilizationRate = totalCapacitySlots > 0 ? Number(((totalOccupiedSlots / totalCapacitySlots) * 100).toFixed(1)) : 0;

  // 1.5 Booking Funnel
  const funnel = [
    { step: 'S1_CREATED', label: 'Tạo ca hẹn', count: totalBookings, percentage: 100 },
    { step: 'S2_CONFIRMED', label: 'Đã xác nhận / Đặt cọc', count: parseInt(currMetrics?.confirmedBookings || 0, 10) + completedBookings, percentage: totalBookings > 0 ? Number((((parseInt(currMetrics?.confirmedBookings || 0, 10) + completedBookings) / totalBookings) * 100).toFixed(1)) : 0 },
    { step: 'S3_COMPLETED', label: 'Đã khám hoàn tất', count: completedBookings, percentage: completionRate },
    { step: 'S4_CANCELLED', label: 'Hủy hẹn / Hoàn tiền', count: cancelledBookings, percentage: cancellationRate },
  ];

  // 1.6 Attention Engine (Cảnh báo vận hành tự động)
  const attentionAlerts = [];
  if (cancellationRate > 8) {
    attentionAlerts.push({
      id: 'alert-cancel',
      type: 'warning',
      title: `Tỷ lệ hủy lịch chạm mức ${cancellationRate}%`,
      description: `Có ${cancelledBookings} ca khám đã bị hủy trong kỳ này. Cần kiểm tra nguyên nhân và đối soát hoàn tiền.`,
      actionText: 'Xem báo cáo hủy lịch',
      actionUrl: '/system/analytics/bookings?tab=cancellation',
    });
  }

  // Check doctors with low utilization (< 40%)
  const lowUtilDoctors = await db.sequelize.query(
    `SELECT u."id", u."lastName", u."firstName", 
            SUM(s."currentNumber") AS booked, 
            SUM(s."maxNumber") AS total,
            ROUND((SUM(s."currentNumber")::DECIMAL / NULLIF(SUM(s."maxNumber"), 0)) * 100, 1) AS "utilRate"
     FROM "Schedules" s
     JOIN "Users" u ON s."doctorId" = u.id
     WHERE CAST(s.date AS BIGINT) >= :from AND CAST(s.date AS BIGINT) <= :to
     GROUP BY u.id, u."lastName", u."firstName"
     HAVING SUM(s."maxNumber") >= 5 AND (SUM(s."currentNumber")::DECIMAL / SUM(s."maxNumber")) < 0.4
     LIMIT 5`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  if (lowUtilDoctors.length > 0) {
    attentionAlerts.push({
      id: 'alert-doctor-capacity',
      type: 'warning',
      title: `${lowUtilDoctors.length} Bác sĩ có tỷ lệ lấp đầy dưới 40%`,
      description: `Bác sĩ ${lowUtilDoctors.map(d => `${d.lastName} ${d.firstName} (${d.utilRate}%)`).slice(0, 2).join(', ')} còn nhiều khung giờ trống.`,
      actionText: 'Xem công suất bác sĩ',
      actionUrl: '/system/analytics/doctors?filter=low_capacity',
    });
  }

  const pendingCount = parseInt(currMetrics?.pendingBookings || 0, 10);
  if (pendingCount > 0) {
    attentionAlerts.push({
      id: 'alert-pending',
      type: 'info',
      title: `${pendingCount} ca hẹn đang chờ xử lý / tiếp nhận`,
      description: `Hồ sơ đặt khám mới đang chờ xác nhận hoặc quá hạn thanh toán đặt trước.`,
      actionText: 'Xử lý lịch khám',
      actionUrl: '/system/schedule-manage',
    });
  }

  // 1.7 Booking Heatmap (Day of Week 0..6 x timeType)
  const heatmapRows = await db.sequelize.query(
    `SELECT 
       EXTRACT(DOW FROM TO_TIMESTAMP(CAST(date AS BIGINT) / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh')::INT AS "dayOfWeek",
       "timeType",
       COUNT(*) AS count
     FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to
     GROUP BY "dayOfWeek", "timeType"`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  // 1.8 Daily Trend (Total, Completed, Cancelled)
  const dailyTrend = await db.sequelize.query(
    `SELECT 
       DATE(TO_TIMESTAMP(CAST(date AS BIGINT) / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS "date",
       COUNT(*) AS "total",
       COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END) AS "completed",
       COUNT(CASE WHEN "statusId" = 'S4' THEN 1 END) AS "cancelled"
     FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to
     GROUP BY "date"
     ORDER BY "date" ASC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  // 1.9 Revenue by Top Specialties
  const revenueBySpecialty = await db.sequelize.query(
    `SELECT 
       s.id, s.name, 
       COALESCE(SUM(b."bookingPrice"), 0) AS revenue,
       COUNT(*) AS count
     FROM "Bookings" b
     INNER JOIN "Doctor_Infos" di ON b."doctorId" = di."doctorId"
     INNER JOIN "Specialties" s ON di."specialtyId" = s.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
       AND (b."statusId" = 'S3' OR b."paymentStatus" = 'paid')
     GROUP BY s.id, s.name
     ORDER BY revenue DESC
     LIMIT 6`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const formattedSpecialties = revenueBySpecialty.map(r => ({
    specialtyId: r.id,
    specialtyName: r.name,
    revenue: parseFloat(r.revenue) || 0,
    count: parseInt(r.count, 10) || 0
  }));

  const formattedDailyTrend = dailyTrend.map(r => {
    const dStr = r.date ? moment(r.date).format('DD/MM') : '';
    return {
      date: r.date,
      dateStr: dStr,
      bookings: parseInt(r.total, 10) || 0,
      completed: parseInt(r.completed, 10) || 0,
      cancelled: parseInt(r.cancelled, 10) || 0
    };
  });

  return {
    kpis: {
      totalBookings,
      totalBookingsDelta: pctDiff(totalBookings, prevTotalBookings),
      completedBookings,
      completionRate,
      completionRateDelta: Number((completionRate - prevCompletionRate).toFixed(1)),
      cancelledBookings,
      cancellationRate,
      cancellationRateDelta: Number((cancellationRate - prevCancellationRate).toFixed(1)),
      grossRevenue,
      grossRevenueDelta: pctDiff(grossRevenue, prevGrossRevenue),
      refundAmount,
      netRevenue,
      netRevenueDelta: pctDiff(netRevenue, prevNetRevenue),
      totalPatients,
      newPatients,
      returningPatients,
      returningRate: totalPatients > 0 ? Number(((returningPatients / totalPatients) * 100).toFixed(1)) : 0,
      totalCapacitySlots,
      totalOccupiedSlots,
      activeDoctors: parseInt(capacityStats?.activeDoctors || 0, 10),
      utilizationRate,
    },
    funnel,
    attentionAlerts,
    heatmap: heatmapRows.map(r => ({
      dayOfWeek: parseInt(r.dayOfWeek, 10),
      timeType: r.timeType,
      count: parseInt(r.count, 10) || 0
    })),
    dailyTrend: formattedDailyTrend,
    topSpecialties: formattedSpecialties,
    revenueBySpecialty: formattedSpecialties,
  };
};

// 2. Booking Analytics Detail
const getBookingAnalyticsDetail = async (from, to) => {
  const fromStr = String(from);
  const toStr = String(to);

  const statusBreakdown = await db.sequelize.query(
    `SELECT b."statusId", 
            COALESCE(a."valueVi", b."statusId") AS "nameVi", 
            COALESCE(a."valueEn", b."statusId") AS "nameEn", 
            COALESCE(a."valueVi", b."statusId") AS "statusNameVi",
            COALESCE(a."valueEn", b."statusId") AS "statusNameEn",
            COUNT(*)::INT AS count
     FROM "Bookings" b
     LEFT JOIN "Allcodes" a ON b."statusId" = a."keyMap" AND a.type = 'STATUS'
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     GROUP BY b."statusId", a."valueVi", a."valueEn"
     ORDER BY count DESC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const timeTypeBreakdown = await db.sequelize.query(
    `SELECT b."timeType", 
            COALESCE(a."valueVi", b."timeType") AS "timeVi", 
            COALESCE(a."valueVi", b."timeType") AS "timeNameVi", 
            COUNT(*)::INT AS count
     FROM "Bookings" b
     LEFT JOIN "Allcodes" a ON b."timeType" = a."keyMap" AND a.type = 'TIME'
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     GROUP BY b."timeType", a."valueVi"
     ORDER BY b."timeType" ASC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  // Recent cancelled bookings
  const recentCancelled = await db.sequelize.query(
    `SELECT 
       b.id,
       b."patientId",
       COALESCE(b."patientName", CONCAT(u."lastName", ' ', u."firstName"), 'Bệnh nhân') AS "patientName",
       CONCAT(doc."lastName", ' ', doc."firstName") AS "doctorName",
       COALESCE(b."bookingPrice", 0)::FLOAT AS "bookingPrice",
       COALESCE(b."refundRate", 0)::INT AS "refundPercentage",
       COALESCE(b."refundRate", 0)::INT AS "refundRate",
       COALESCE(b."refundAmount", 0)::FLOAT AS "refundAmount",
       b."cancelledAt",
       b."refundStatus"
     FROM "Bookings" b
     LEFT JOIN "Users" u ON b."patientId" = u.id
     LEFT JOIN "Users" doc ON b."doctorId" = doc.id
     WHERE b."statusId" = 'S4'
       AND CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     ORDER BY b."cancelledAt" DESC NULLS LAST, b.id DESC
     LIMIT 50`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const totalCancelledCount = recentCancelled.length;
  const totalRefundAmount = recentCancelled.reduce((acc, c) => acc + (parseFloat(c.refundAmount) || 0), 0);
  const avgRefundPct = totalCancelledCount > 0
    ? Math.round(recentCancelled.reduce((acc, c) => acc + (parseInt(c.refundPercentage, 10) || 0), 0) / totalCancelledCount)
    : 0;

  return {
    statusBreakdown,
    timeTypeBreakdown,
    timeDistribution: timeTypeBreakdown,
    cancellations: {
      count: totalCancelledCount,
      refundTotal: totalRefundAmount,
      avgRefundPct,
      recentList: recentCancelled,
    },
    cancellationDetails: recentCancelled,
  };
};

// 3. Revenue Analytics Detail
const getRevenueAnalyticsDetail = async (from, to) => {
  const fromStr = String(from);
  const toStr = String(to);

  const [summary] = await db.sequelize.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0) AS "grossRevenue",
       COALESCE(SUM("refundAmount"), 0) AS "totalRefund",
       COUNT(CASE WHEN "paymentStatus" = 'paid' THEN 1 END) AS "paidCount",
       COUNT(CASE WHEN "paymentStatus" = 'unpaid' THEN 1 END) AS "unpaidCount"
     FROM "Bookings"
     WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const byClinic = await db.sequelize.query(
    `SELECT c.id, c.name, 
            COALESCE(SUM(b."bookingPrice"), 0)::FLOAT AS revenue,
            COUNT(*)::INT AS count
     FROM "Bookings" b
     INNER JOIN "Doctor_Infos" di ON b."doctorId" = di."doctorId"
     INNER JOIN "Clinics" c ON di."clinicId" = c.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
       AND (b."statusId" = 'S3' OR b."paymentStatus" = 'paid')
     GROUP BY c.id, c.name
     ORDER BY revenue DESC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const byDoctor = await db.sequelize.query(
    `SELECT u.id, CONCAT(u."lastName", ' ', u."firstName") AS "doctorName",
            COALESCE(SUM(b."bookingPrice"), 0)::FLOAT AS revenue,
            COUNT(*)::INT AS count
     FROM "Bookings" b
     INNER JOIN "Users" u ON b."doctorId" = u.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
       AND (b."statusId" = 'S3' OR b."paymentStatus" = 'paid')
     GROUP BY u.id, u."lastName", u."firstName"
     ORDER BY revenue DESC
     LIMIT 15`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const bySpecialty = await db.sequelize.query(
    `SELECT s.id, s.name, 
            COALESCE(SUM(b."bookingPrice"), 0)::FLOAT AS revenue,
            COUNT(*)::INT AS count
     FROM "Bookings" b
     INNER JOIN "Doctor_Infos" di ON b."doctorId" = di."doctorId"
     INNER JOIN "Specialties" s ON di."specialtyId" = s.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
       AND (b."statusId" = 'S3' OR b."paymentStatus" = 'paid')
     GROUP BY s.id, s.name
     ORDER BY revenue DESC
     LIMIT 15`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const grossRevenue = parseFloat(summary?.grossRevenue || 0);
  const refundAmount = parseFloat(summary?.totalRefund || 0);
  const netRevenue = Math.max(0, grossRevenue - refundAmount);
  const paidBookingsCount = parseInt(summary?.paidCount || 0, 10);
  const avgOrderValue = paidBookingsCount > 0 ? Math.round(grossRevenue / paidBookingsCount) : 0;

  return {
    summary: {
      grossRevenue,
      totalRefund: refundAmount,
      refundAmount,
      netRevenue,
      paidCount: paidBookingsCount,
      paidBookingsCount,
      unpaidCount: parseInt(summary?.unpaidCount || 0, 10),
      avgOrderValue,
    },
    byClinic: byClinic.map(r => ({ ...r, revenue: parseFloat(r.revenue) || 0, count: parseInt(r.count, 10) || 0 })),
    byDoctor: byDoctor.map(r => ({ ...r, revenue: parseFloat(r.revenue) || 0, count: parseInt(r.count, 10) || 0 })),
    bySpecialty: bySpecialty.map(r => ({ ...r, revenue: parseFloat(r.revenue) || 0, count: parseInt(r.count, 10) || 0 })),
  };
};

// 4. Doctor Capacity & Utilization Detail
const getDoctorCapacityDetail = async (from, to) => {
  const fromStr = String(from);
  const toStr = String(to);

  const doctorList = await db.sequelize.query(
    `SELECT 
       u.id AS "doctorId", 
       CONCAT(u."lastName", ' ', u."firstName") AS "doctorName",
       sp.name AS "specialtyName",
       cl.name AS "clinicName",
       COALESCE(SUM(s."maxNumber"), 0) AS "totalSlots",
       COALESCE(SUM(s."currentNumber"), 0) AS "bookedSlots",
       COUNT(DISTINCT s.id) AS "schedulesCount",
       ROUND((COALESCE(SUM(s."currentNumber"), 0)::DECIMAL / NULLIF(SUM(s."maxNumber"), 0)) * 100, 1) AS "utilizationRate"
     FROM "Users" u
     INNER JOIN "Schedules" s ON s."doctorId" = u.id AND CAST(s.date AS BIGINT) >= :from AND CAST(s.date AS BIGINT) <= :to
     LEFT JOIN "Doctor_Infos" di ON di."doctorId" = u.id
     LEFT JOIN "Specialties" sp ON di."specialtyId" = sp.id
     LEFT JOIN "Clinics" cl ON di."clinicId" = cl.id
     WHERE u."roleId" = 'R2'
     GROUP BY u.id, u."lastName", u."firstName", sp.name, cl.name
     ORDER BY "utilizationRate" DESC`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const formattedDoctors = doctorList.map(d => ({
    ...d,
    totalSlots: parseInt(d.totalSlots, 10) || 0,
    bookedSlots: parseInt(d.bookedSlots, 10) || 0,
    schedulesCount: parseInt(d.schedulesCount, 10) || 0,
    utilizationRate: parseFloat(d.utilizationRate) || 0,
  }));

  const totalDoctors = formattedDoctors.length;
  const totalSlots = formattedDoctors.reduce((acc, d) => acc + d.totalSlots, 0);
  const occupiedSlots = formattedDoctors.reduce((acc, d) => acc + d.bookedSlots, 0);
  const avgUtilization = totalSlots > 0 ? Number(((occupiedSlots / totalSlots) * 100).toFixed(1)) : 0;

  return {
    summary: {
      totalDoctors,
      totalSlots,
      occupiedSlots,
      avgUtilization,
    },
    doctors: formattedDoctors,
  };
};

// 5. Patient Intelligence Detail
const getPatientIntelligenceDetail = async (from, to) => {
  const fromStr = String(from);
  const toStr = String(to);

  const [patientStats] = await db.sequelize.query(
    `SELECT 
       COUNT(DISTINCT "patientId") AS "totalPatients",
       COUNT(DISTINCT CASE WHEN prior.id IS NULL THEN b."patientId" END) AS "newPatients",
       COUNT(DISTINCT CASE WHEN prior.id IS NOT NULL THEN b."patientId" END) AS "returningPatients"
     FROM "Bookings" b
     LEFT JOIN LATERAL (
       SELECT id FROM "Bookings" p 
       WHERE p."patientId" = b."patientId" AND CAST(p.date AS BIGINT) < :from 
       LIMIT 1
     ) prior ON true
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const totalPatients = parseInt(patientStats?.totalPatients || 0, 10);
  const newPatients = parseInt(patientStats?.newPatients || 0, 10);
  const returningPatients = parseInt(patientStats?.returningPatients || 0, 10);
  const returningRate = totalPatients > 0 ? Number(((returningPatients / totalPatients) * 100).toFixed(1)) : 0;

  const genderDist = await db.sequelize.query(
    `SELECT COALESCE(b."patientGender", 'OTHER') AS gender, COUNT(*)::INT AS count
     FROM "Bookings" b
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     GROUP BY gender`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  const topPatients = await db.sequelize.query(
    `SELECT b."patientId", 
            COALESCE(b."patientName", CONCAT(u."lastName", ' ', u."firstName"), 'Bệnh nhân') AS "patientName",
            b."patientPhoneNumber", 
            COUNT(*)::INT AS "bookingCount",
            COALESCE(SUM(b."bookingPrice"), 0)::FLOAT AS "totalSpent"
     FROM "Bookings" b
     LEFT JOIN "Users" u ON b."patientId" = u.id
     WHERE CAST(b.date AS BIGINT) >= :from AND CAST(b.date AS BIGINT) <= :to
     GROUP BY b."patientId", b."patientName", u."lastName", u."firstName", b."patientPhoneNumber"
     ORDER BY "bookingCount" DESC
     LIMIT 15`,
    { replacements: { from: fromStr, to: toStr }, type: db.sequelize.QueryTypes.SELECT }
  );

  return {
    summary: {
      totalPatients,
      newPatients,
      returningPatients,
      returningRate,
    },
    genderDistribution: genderDist,
    topFrequentPatients: topPatients.map(p => ({ ...p, bookingCount: parseInt(p.bookingCount, 10) || 0 })),
    topPatients: topPatients.map(p => ({ ...p, bookingCount: parseInt(p.bookingCount, 10) || 0 })),
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
  // [Phase E] Executive Master & Detail Analytics
  getExecutiveMaster,
  getBookingAnalyticsDetail,
  getRevenueAnalyticsDetail,
  getDoctorCapacityDetail,
  getPatientIntelligenceDetail,
};

