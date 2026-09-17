// src/controllers/specialtyManageController.js
// Enterprise Specialty Management Controller (Admin R1)
const specialtyManageService = require('../services/specialtyManageService');

const handleGetAdminSpecialtiesList = async (req, res) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await specialtyManageService.getAdminSpecialtiesList({ page, limit, search, status });
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleGetAdminSpecialtiesList Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

const handleGetAdminSpecialtyWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await specialtyManageService.getAdminSpecialtyWorkspace(id);
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleGetAdminSpecialtyWorkspace Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

const handleUpdateSpecialtyWorkingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await specialtyManageService.updateSpecialtyWorkingStatus(id, { status });
    return res.status(200).json(result);
  } catch (error) {
    console.error('handleUpdateSpecialtyWorkingStatus Error:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi máy chủ nội bộ' });
  }
};

module.exports = {
  handleGetAdminSpecialtiesList,
  handleGetAdminSpecialtyWorkspace,
  handleUpdateSpecialtyWorkingStatus,
};
