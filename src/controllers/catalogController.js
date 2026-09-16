// bookingcare-backend/src/controllers/catalogController.js
// [Phase B] Controller cho danh mục y khoa, thuốc, cài đặt hệ thống
'use strict';
const catalogService = require('../services/catalogService');

// ── MedicalCatalog ──────────────────────────────────
exports.getAllMedicalCatalogs = async (req, res) => {
  try {
    const result = await catalogService.getAllMedicalCatalogs(req.query);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.createMedicalCatalog = async (req, res) => {
  try {
    const result = await catalogService.createMedicalCatalog(req.body);
    return res.status(result.errCode === 0 ? 201 : 400).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.editMedicalCatalog = async (req, res) => {
  try {
    const result = await catalogService.editMedicalCatalog(req.params.id, req.body);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.deleteMedicalCatalog = async (req, res) => {
  try {
    const result = await catalogService.deleteMedicalCatalog(req.params.id);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

// ── Medicine ────────────────────────────────────────
exports.getAllMedicines = async (req, res) => {
  try {
    const result = await catalogService.getAllMedicines(req.query);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.createMedicine = async (req, res) => {
  try {
    const result = await catalogService.createMedicine(req.body);
    return res.status(result.errCode === 0 ? 201 : 400).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.editMedicine = async (req, res) => {
  try {
    const result = await catalogService.editMedicine(req.params.id, req.body);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.deleteMedicine = async (req, res) => {
  try {
    const result = await catalogService.deleteMedicine(req.params.id);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

// ── SystemSettings ──────────────────────────────────
exports.getSystemSettings = async (req, res) => {
  try {
    const result = await catalogService.getSystemSettings();
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.updateSystemSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    const result = await catalogService.updateSystemSetting(key, value, description);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.updateBulkSystemSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    const result = await catalogService.updateBulkSystemSettings(settings);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

exports.resetSystemSettings = async (req, res) => {
  try {
    const result = await catalogService.resetSystemSettings();
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ errCode: 1, message: e.message });
  }
};

