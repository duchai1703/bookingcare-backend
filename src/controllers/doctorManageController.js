const doctorManageService = require('../services/doctorManageService');
const policyEngineService = require('../services/policyEngineService');

const handleGetAdminDoctorsList = async (req, res) => {
  try {
    const { page, limit, search, status, specialtyId, clinicId, paymentStatus } = req.query;
    const result = await doctorManageService.getAdminDoctorsList({
      page,
      limit,
      search,
      status,
      specialtyId,
      clinicId,
      paymentStatus,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminDoctorsList:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleGetAdminDoctorWorkspace = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const result = await doctorManageService.getAdminDoctorWorkspace(doctorId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleGetAdminDoctorWorkspace:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleUpdateDoctorCommission = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { newRate, reason } = req.body;
    const adminId = req.user?.id || null;
    const result = await doctorManageService.updateDoctorCommission({
      doctorId,
      newRate,
      reason,
      adminId,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleUpdateDoctorCommission:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleUpdateDoctorWorkingStatus = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { status, reason } = req.body;
    const adminId = req.user?.id || null;
    const result = await doctorManageService.updateDoctorWorkingStatus({
      doctorId,
      status,
      reason,
      adminId,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleUpdateDoctorWorkingStatus:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleCreateDoctorPayout = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { amount, paymentMethod, transactionRef, receiptImage, note, periodFrom, periodTo } = req.body;
    const adminId = req.user?.id || null;
    const result = await doctorManageService.createDoctorPayout({
      doctorId,
      amount,
      paymentMethod,
      transactionRef,
      receiptImage,
      note,
      adminId,
      periodFrom,
      periodTo,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleCreateDoctorPayout:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleUpdateDoctorScheduleSlots = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { date, timeTypes } = req.body;
    const result = await doctorManageService.updateDoctorScheduleSlots({
      doctorId,
      date,
      timeTypes,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in handleUpdateDoctorScheduleSlots:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleGetDoctorFinancialTerms = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const result = await policyEngineService.getDoctorFinancialTerms(doctorId);
    return res.status(200).json({ errCode: 0, data: result });
  } catch (error) {
    console.error('Error in handleGetDoctorFinancialTerms:', error);
    return res.status(500).json({ errCode: -1, errMessage: 'Lỗi server: ' + error.message });
  }
};

const handleSetDoctorFinancialTerms = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const adminId = req.user?.id || 1;
    const result = await policyEngineService.setDoctorFinancialTerms(doctorId, req.body, adminId);
    return res.status(200).json({ errCode: 0, ...result });
  } catch (error) {
    console.error('Error in handleSetDoctorFinancialTerms:', error);
    return res.status(400).json({ errCode: 1, errMessage: error.message || 'Lỗi thiết lập điều khoản hoa hồng' });
  }
};

module.exports = {
  handleGetAdminDoctorsList,
  handleGetAdminDoctorWorkspace,
  handleUpdateDoctorCommission,
  handleUpdateDoctorWorkingStatus,
  handleCreateDoctorPayout,
  handleUpdateDoctorScheduleSlots,
  handleGetDoctorFinancialTerms,
  handleSetDoctorFinancialTerms,
};
