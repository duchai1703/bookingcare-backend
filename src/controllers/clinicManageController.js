// src/controllers/clinicManageController.js
// Enterprise Clinic Management Controller (Admin R1)
const clinicManageService = require('../services/clinicManageService');

const handleGetAdminClinicsList = async (req, res) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await clinicManageService.getAdminClinicsList({ page, limit, search, status });
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleGetAdminClinicsList Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

const handleGetAdminClinicControlCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await clinicManageService.getAdminClinicControlCenter(id);
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleGetAdminClinicControlCenter Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

const handleUpdateClinicWorkingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await clinicManageService.updateClinicWorkingStatus(id, { status });
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleUpdateClinicWorkingStatus Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

const handleUpdateClinicCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate } = req.body;
    const result = await clinicManageService.updateClinicCommission(id, { commissionRate });
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleUpdateClinicCommission Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

const handleAssignDoctorToClinic = async (req, res) => {
  try {
    const { id } = req.params;
    const { doctorId } = req.body;
    const result = await clinicManageService.assignDoctorToClinic(id, { doctorId });
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleAssignDoctorToClinic Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

module.exports = {
  handleGetAdminClinicsList,
  handleGetAdminClinicControlCenter,
  handleUpdateClinicWorkingStatus,
  handleUpdateClinicCommission,
  handleAssignDoctorToClinic,
};
