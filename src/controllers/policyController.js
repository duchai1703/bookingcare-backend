// src/controllers/policyController.js
// Thin Controller cho Financial Policy Engine & Flexible SLA Audit Subsystem
const policyEngineService = require('../services/policyEngineService');
const withdrawalPolicyService = require('../services/withdrawalPolicyService');
const policyAuditService = require('../services/policyAuditService');

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

// GET /api/v1/admin/doctor-hierarchy-tree
const getDoctorHierarchyTree = async (req, res) => {
  try {
    const tree = await policyEngineService.getDoctorHierarchyTree();
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy cây phân cấp bác sĩ - cơ sở - chuyên khoa thành công',
      data: tree
    });
  } catch (error) {
    console.error('>>> getDoctorHierarchyTree error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy cây phân cấp bác sĩ'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ⏱️ Dynamic Withdrawal SLA Policy & Audit Trail Endpoints
// ═══════════════════════════════════════════════════════════════════════

// GET /api/v1/policies/withdrawal-sla (Admin / Patient)
const getActiveWithdrawalPolicy = async (req, res) => {
  try {
    const policy = await withdrawalPolicyService.getActiveWithdrawalPolicy();
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy chính sách SLA rút tiền thành công',
      data: policy,
    });
  } catch (error) {
    console.error('>>> getActiveWithdrawalPolicy error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy chính sách rút tiền',
    });
  }
};

// PUT /api/v1/admin/policies/withdrawal-sla (Admin R1)
const updateWithdrawalPolicy = async (req, res) => {
  try {
    const adminId = req.user ? req.user.id : 1;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Admin API';

    const result = await withdrawalPolicyService.updateWithdrawalPolicy({
      adminId,
      defaultSlaDays: req.body.defaultSlaDays,
      allowCustomDays: req.body.allowCustomDays,
      minSlaDays: req.body.minSlaDays,
      maxSlaDays: req.body.maxSlaDays,
      isBusinessDaysOnly: req.body.isBusinessDaysOnly,
      tiers: req.body.tiers,
      policyNoticeVi: req.body.policyNoticeVi,
      description: req.body.description,
      reason: req.body.reason,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      errCode: 0,
      message: result.message,
      data: result.policy,
    });
  } catch (error) {
    console.error('>>> updateWithdrawalPolicy error:', error);
    return res.status(400).json({
      errCode: 1,
      message: error.message || 'Lỗi khi cập nhật chính sách rút tiền',
    });
  }
};

// GET /api/v1/admin/policies/withdrawal-sla/versions (Admin R1)
const getWithdrawalPolicyVersions = async (req, res) => {
  try {
    const versions = await withdrawalPolicyService.getAllWithdrawalPolicyVersions();
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy lịch sử các phiên bản chính sách rút tiền thành công',
      data: versions,
    });
  } catch (error) {
    console.error('>>> getWithdrawalPolicyVersions error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy lịch sử phiên bản',
    });
  }
};

// GET /api/v1/policies/calculate-sla?amount=xxx (Patient / Doctor Modal Dynamic Preview)
const calculateWithdrawalSlaPreview = async (req, res) => {
  try {
    const amount = Number(req.query.amount) || 0;
    const calculation = await withdrawalPolicyService.calculateWithdrawalSla(amount, new Date());
    return res.status(200).json({
      errCode: 0,
      message: 'OK',
      data: calculation,
    });
  } catch (error) {
    console.error('>>> calculateWithdrawalSlaPreview error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi khi tính toán thời hạn SLA rút tiền',
    });
  }
};

// GET /api/v1/admin/policies/audit-logs (Admin R1)
const getPolicyAuditLogs = async (req, res) => {
  try {
    const logs = await policyAuditService.getAuditLogs(req.query);
    return res.status(200).json({
      errCode: 0,
      message: 'Lấy nhật ký kiểm toán chính sách thành công',
      ...logs,
    });
  } catch (error) {
    console.error('>>> getPolicyAuditLogs error:', error);
    return res.status(500).json({
      errCode: -1,
      message: error.message || 'Lỗi server khi lấy nhật ký kiểm toán',
    });
  }
};

module.exports = {
  getPoliciesList,
  getPolicyDetail,
  createPolicy,
  createPolicyVersion,
  updatePolicyDraft,
  seedDefaultPolicies,
  getDoctorHierarchyTree,
  // SLA & Audit Subsystem
  getActiveWithdrawalPolicy,
  updateWithdrawalPolicy,
  getWithdrawalPolicyVersions,
  calculateWithdrawalSlaPreview,
  getPolicyAuditLogs,
};
