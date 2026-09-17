// src/controllers/statisticController.js
// [Phase 10] Statistics Controllers — Admin only
// [Phase 11] + getKpiStatistics (Doctor KPI)
const statisticService = require('../services/statisticService');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const db = require('../models');

const getOverviewStatistics = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getOverviewStatistics(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getOverviewStatistics error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

const getBookingsByDay = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getBookingsByDay(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getBookingsByDay error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

const getBookingsByStatus = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getBookingsByStatus(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getBookingsByStatus error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

const getTopSpecialties = async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getTopSpecialties(Number(from), Number(to), Number(limit) || 5);
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getTopSpecialties error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

const getTopDoctors = async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getTopDoctors(Number(from), Number(to), Number(limit) || 5);
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getTopDoctors error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.5] getKpiStatistics — Doctor KPI Dashboard
// Route: GET /api/v1/doctor/kpi-statistics
// Guard #17: IDOR-safe — doctorId = req.user.id (KHÔNG nhận từ client)
// Guard #25: catch return 500
// ═══════════════════════════════════════════════════════════════════════
const getKpiStatistics = async (req, res) => {
  try {
    const doctorId = req.user.id; // IDOR-safe: KHÔNG nhận từ client

    const totalBookings = await db.Booking.count({
      where: { doctorId, statusId: { [Op.in]: ['S2', 'S3'] } },
    });
    const totalRevenue =
      (await db.Booking.sum('bookingPrice', {
        where: { doctorId, paymentStatus: 'paid' },
      })) || 0;
    const todayBookings = await db.Booking.count({
      where: {
        doctorId,
        date: moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD'),
        statusId: { [Op.in]: ['S1', 'S2'] },
      },
    });

    res.json({
      errCode: 0,
      data: { totalBookings, totalRevenue, todayBookings },
    });
  } catch (err) {
    return res.status(500).json({ errCode: -1 });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase B.6] Revenue Statistics Handlers — Admin R1
// ═══════════════════════════════════════════════════════════════════════

// GET /api/v1/statistics/monthly-revenue?year=2025
const getMonthlyRevenue = async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
    const result = await statisticService.getMonthlyRevenue(year);
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> getMonthlyRevenue error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/revenue-by-doctor?from=YYYY-MM-DD&to=YYYY-MM-DD
const getRevenueByDoctor = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ errCode: 1, message: 'Missing from, to' });
    const result = await statisticService.getRevenueByDoctor(from, to);
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> getRevenueByDoctor error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/revenue-by-clinic?from=YYYY-MM-DD&to=YYYY-MM-DD
const getRevenueByClinic = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ errCode: 1, message: 'Missing from, to' });
    const result = await statisticService.getRevenueByClinic(from, to);
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> getRevenueByClinic error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/revenue-by-specialty?from=YYYY-MM-DD&to=YYYY-MM-DD
const getRevenueBySpecialty = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ errCode: 1, message: 'Missing from, to' });
    const result = await statisticService.getRevenueBySpecialty(from, to);
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> getRevenueBySpecialty error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase E] Executive Master & Detail Analytics Controllers
// ═══════════════════════════════════════════════════════════════════════

// GET /api/v1/statistics/executive-master?from=...&to=...&compareFrom=...&compareTo=...
const getExecutiveMaster = async (req, res) => {
  try {
    const { from, to, compareFrom, compareTo } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getExecutiveMaster(Number(from), Number(to), compareFrom ? Number(compareFrom) : null, compareTo ? Number(compareTo) : null);
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getExecutiveMaster error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/analytics/bookings?from=...&to=...
const getBookingAnalytics = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getBookingAnalyticsDetail(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getBookingAnalytics error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/analytics/revenue?from=...&to=...
const getRevenueAnalytics = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getRevenueAnalyticsDetail(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getRevenueAnalytics error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/analytics/doctors?from=...&to=...
const getDoctorCapacityAnalytics = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getDoctorCapacityDetail(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getDoctorCapacityAnalytics error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

// GET /api/v1/statistics/analytics/patients?from=...&to=...
const getPatientAnalytics = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ errCode: 1, message: 'Missing required params: from, to' });
    }
    const data = await statisticService.getPatientIntelligenceDetail(Number(from), Number(to));
    return res.status(200).json({ errCode: 0, data });
  } catch (err) {
    console.error('>>> getPatientAnalytics error:', err);
    return res.status(500).json({ errCode: -1, message: 'Server error' });
  }
};

module.exports = {
  getOverviewStatistics,
  getBookingsByDay,
  getBookingsByStatus,
  getTopSpecialties,
  getTopDoctors,
  getKpiStatistics,
  // [Phase B.6]
  getMonthlyRevenue,
  getRevenueByDoctor,
  getRevenueByClinic,
  getRevenueBySpecialty,
  // [Phase E]
  getExecutiveMaster,
  getBookingAnalytics,
  getRevenueAnalytics,
  getDoctorCapacityAnalytics,
  getPatientAnalytics,
};

