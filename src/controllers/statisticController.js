// src/controllers/statisticController.js
// [Phase 10] Statistics Controllers — Admin only
const statisticService = require('../services/statisticService');

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

module.exports = { getOverviewStatistics, getBookingsByDay, getBookingsByStatus, getTopSpecialties, getTopDoctors };
