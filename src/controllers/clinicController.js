// src/controllers/clinicController.js
const clinicService = require('../services/clinicService');

const createClinic = async (req, res) => {
  try {
    const result = await clinicService.createClinic(req.body);
    const httpStatus = result.errCode === 0 ? 201 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> createClinic error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getAllClinic = async (req, res) => {
  try {
    const result = await clinicService.getAllClinic();
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getAllClinic error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getDetailClinicById = async (req, res) => {
  try {
    const id = req.params.id || req.query.id;
    const result = await clinicService.getDetailClinicById(id);
    const httpStatus = result.errCode === 0 ? 200 : 404;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getDetailClinicById error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-012
const editClinic = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // FIX BE-09
    const result = await clinicService.editClinic(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> editClinic error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-013
const deleteClinic = async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    const result = await clinicService.deleteClinic(id);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> deleteClinic error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = { createClinic, getAllClinic, getDetailClinicById, editClinic, deleteClinic };
