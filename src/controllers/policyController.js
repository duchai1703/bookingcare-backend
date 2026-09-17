// src/controllers/policyController.js
// Thin Controller cho Financial Policy Engine
const policyEngineService = require('../services/policyEngineService');

// GET /api/v1/admin/policies
const getPoliciesList = async (req, res) => {
  try {
    const result = await policyEngineService.getPoliciesList(req.query);
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy danh sách chính sách thành công',
      ...result
    });
  } catch (error) {
    console.error('>>> getPoliciesList error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy danh sách chính sách'
    });
  }
};

// GET /api/v1/admin/policies/:id
const getPolicyDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const policy = await policyEngineService.getPolicyDetail(id);
    if (!policy) {
      return res.status(404).json({
        errCode: 1,
        message: `Không tìm thấy chính sách với ID: ${id}`
      });
    }
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy thông tin chi tiết chính sách thành công',
      data: policy
    });
  } catch (error) {
    console.error('>>> getPolicyDetail error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy chi tiết chính sách'
    });
  }
};

// POST /api/v1/admin/policies
const createPolicy = async (req, res) => {
  try {
    const adminId = req.user ? req.user.id : 1;
    const newPolicy = await policyEngineService.createPolicy(req.body, adminId);
    return res.status(201).json({
      errCode: 0,
      message: 'Tạo chính sách thành công',
      data: newPolicy
    });
  } catch (error) {
    console.error('>>> createPolicy error:', error);
    return res.status(400).json({
      errCode: 1,
      message: error.message || 'Không thể tạo chính sách'
    });
  }
};

// POST /api/v1/admin/policies/:id/new-version
const createPolicyVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user ? req.user.id : 1;
    const newVersion = await policyEngineService.createPolicyVersion(id, req.body, adminId);
    return res.status(201).json({
      errCode: 0,
      message: `Đã nâng cấp chính sách lên phiên bản v${newVersion.version} thành công`,
      data: newVersion
    });
  } catch (error) {
    console.error('>>> createPolicyVersion error:', error);
    return res.status(400).json({
      errCode: 1,
      message: error.message || 'Không thể nâng cấp phiên bản chính sách'
    });
  }
};

// PUT /api/v1/admin/policies/:id
const updatePolicyDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user ? req.user.id : 1;
    const updated = await policyEngineService.updatePolicyDraft(id, req.body, adminId);
    return res.status(200).json({
      errCode: 0,
      message: 'Cập nhật bản thảo chính sách thành công',
      data: updated
    });
  } catch (error) {
    console.error('>>> updatePolicyDraft error:', error);
    return res.status(400).json({
      errCode: 1,
      message: error.message || 'Không thể cập nhật chính sách'
    });
  }
};

// POST /api/v1/admin/policies/seed-defaults
const seedDefaultPolicies = async (req, res) => {
  try {
    const result = await policyEngineService.seedDefaultPoliciesIfEmpty();
    return res.status(200).json({
      errCode: 0,
      message: result.seeded ? 'Đã khởi tạo chính sách mặc định' : 'Hệ thống đã có chính sách',
      data: result
    });
  } catch (error) {
    console.error('>>> seedDefaultPolicies error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi khi khởi tạo chính sách mặc định'
    });
  }
};

module.exports = {
  getPoliciesList,
  getPolicyDetail,
  createPolicy,
  createPolicyVersion,
  updatePolicyDraft,
  seedDefaultPolicies
};
