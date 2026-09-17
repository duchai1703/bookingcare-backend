// src/controllers/patientManageController.js
// Admin Patient Management Controller
const patientManageService = require('../services/patientManageService');

const handleGetPatientsList = async (req, res) => {
  try {
    const result = await patientManageService.getAdminPatientsList(req.query);
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> handleGetPatientsList error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server' });
  }
};

const handleGetPatientWorkspace = async (req, res) => {
  try {
    const patientId = req.params.id;
    const result = await patientManageService.getAdminPatientWorkspace(patientId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> handleGetPatientWorkspace error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server' });
  }
};

const handleProcessRefund = async (req, res) => {
  try {
    const adminName = req.user ? `${req.user.lastName || ''} ${req.user.firstName || ''}`.trim() : 'Admin';
    const result = await patientManageService.processAdminRefund({ ...req.body, adminName });
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> handleProcessRefund error:', err);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server' });
  }
};

module.exports = {
  handleGetPatientsList,
  handleGetPatientWorkspace,
  handleProcessRefund,
};
