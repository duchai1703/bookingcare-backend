// src/controllers/specialtyController.js
const specialtyService = require('../services/specialtyService');

const createSpecialty = async (req, res) => {
  try {
    const result = await specialtyService.createSpecialty(req.body);
    const httpStatus = result.errCode === 0 ? 201 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> createSpecialty error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getAllSpecialty = async (req, res) => {
  try {
    const result = await specialtyService.getAllSpecialty();
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getAllSpecialty error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getDetailSpecialtyById = async (req, res) => {
  try {
    const id = req.params.id || req.query.id;
    const location = req.query.location;
    const result = await specialtyService.getDetailSpecialtyById(id, location);
    const httpStatus = result.errCode === 0 ? 200 : 404;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getDetailSpecialtyById error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-016
const editSpecialty = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // FIX BE-08
    const result = await specialtyService.editSpecialty(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> editSpecialty error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// REQ-AM-017
const deleteSpecialty = async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    const result = await specialtyService.deleteSpecialty(id);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> deleteSpecialty error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = { createSpecialty, getAllSpecialty, getDetailSpecialtyById, editSpecialty, deleteSpecialty };
