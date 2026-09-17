// src/controllers/doctorOnboardingController.js
// Thin Controller cho Doctor Self-Onboarding & Verification Workflow
const doctorOnboardingService = require('../services/doctorOnboardingService');

// POST /api/v1/doctor-onboarding/submit (Public: Bác sĩ nộp hồ sơ)
const submitOnboarding = async (req, res) => {
  try {
    const result = await doctorOnboardingService.submitOnboarding(req.body);
    const statusCode = result.errCode === 0 ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('>>> submitOnboarding error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi nộp hồ sơ bác sĩ',
    });
  }
};

// GET /api/v1/doctor-onboarding/status/:identifier (Public: Tra cứu theo email hoặc requestId)
const getOnboardingStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    const result = await doctorOnboardingService.getOnboardingStatus(identifier);
    const statusCode = result.errCode === 0 ? 200 : 404;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('>>> getOnboardingStatus error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi tra cứu hồ sơ',
    });
  }
};

// GET /api/v1/admin/doctor-onboarding/queue (Admin: Danh sách hồ sơ thẩm định)
const getVerificationQueue = async (req, res) => {
  try {
    const result = await doctorOnboardingService.getVerificationQueue(req.query);
    return res.status(200).json(result);
  } catch (error) {
    console.error('>>> getVerificationQueue error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy danh sách thẩm định',
    });
  }
};

// GET /api/v1/admin/doctor-onboarding/:id (Admin: Chi tiết hồ sơ)
const getOnboardingDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await doctorOnboardingService.getOnboardingDetail(id);
    const statusCode = result.errCode === 0 ? 200 : 404;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('>>> getOnboardingDetail error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy chi tiết hồ sơ',
    });
  }
};

// POST /api/v1/admin/doctor-onboarding/:id/request-changes (Admin: Yêu cầu bổ sung)
const requestChanges = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user ? req.user.id : (req.body.adminId || 1);
    const result = await doctorOnboardingService.requestChanges(id, req.body, adminId);
    const statusCode = result.errCode === 0 ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('>>> requestChanges error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi yêu cầu bổ sung hồ sơ',
    });
  }
};

// POST /api/v1/admin/doctor-onboarding/:id/reject (Admin: Từ chối hồ sơ)
const rejectOnboarding = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user ? req.user.id : (req.body.adminId || 1);
    const result = await doctorOnboardingService.rejectOnboarding(id, req.body, adminId);
    const statusCode = result.errCode === 0 ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('>>> rejectOnboarding error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi từ chối hồ sơ',
    });
  }
};

// POST /api/v1/admin/doctor-onboarding/:id/approve (Admin: Phê duyệt & Kích hoạt)
const approveOnboarding = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user ? req.user.id : (req.body.adminId || 1);
    const result = await doctorOnboardingService.approveOnboarding(id, adminId);
    const statusCode = result.errCode === 0 ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('>>> approveOnboarding error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi phê duyệt hồ sơ',
    });
  }
};

module.exports = {
  submitOnboarding,
  getOnboardingStatus,
  getVerificationQueue,
  getOnboardingDetail,
  requestChanges,
  rejectOnboarding,
  approveOnboarding,
};
