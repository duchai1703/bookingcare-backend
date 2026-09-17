// src/services/policyEngineService.js
// Financial Policy Engine Service — Quản trị Chính sách Phân bổ Doanh thu & Quy định Hoàn tiền Bất biến
const db = require('../models');
const { Op } = require('sequelize');

/**
 * 1. Phân giải chính sách Active hợp lệ theo thời điểm và thứ bậc ưu tiên (DOCTOR -> CLINIC -> GLOBAL)
 * @param {string} policyType 'REVENUE_SHARE' | 'REFUND_RULE'
 * @param {string} scopeType 'GLOBAL' | 'CLINIC' | 'DOCTOR'
 * @param {number|null} scopeId ID của Bác sĩ hoặc Cơ sở y tế
 * @param {Date|string} targetDate Thời điểm cần áp dụng (mặc định now)
 */
const resolveActivePolicy = async (policyType, scopeType = 'GLOBAL', scopeId = null, targetDate = new Date()) => {
  const dateObj = new Date(targetDate);

  const dateCondition = {
    effectiveFrom: { [Op.lte]: dateObj },
    [Op.or]: [
      { effectiveTo: null },
      { effectiveTo: { [Op.gte]: dateObj } }
    ]
  };

  // Thứ bậc tìm kiếm:
  // Nếu scopeType == DOCTOR -> tìm DOCTOR trước -> nếu không có -> tìm CLINIC của doctor (nếu truyền) -> fallback GLOBAL
  const candidates = [];
  if (scopeType === 'DOCTOR' && scopeId) {
    candidates.push({ scopeType: 'DOCTOR', scopeId: parseInt(scopeId, 10) });
  } else if (scopeType === 'CLINIC' && scopeId) {
    candidates.push({ scopeType: 'CLINIC', scopeId: parseInt(scopeId, 10) });
  }
  // Luôn fallback về GLOBAL
  candidates.push({ scopeType: 'GLOBAL', scopeId: null });

  for (const candidate of candidates) {
    const whereClause = {
      policyType,
      scopeType: candidate.scopeType,
      status: 'ACTIVE',
      ...dateCondition
    };
    if (candidate.scopeId !== null) {
      whereClause.scopeId = candidate.scopeId;
    } else {
      whereClause.scopeId = null;
    }

    const policy = await db.Financial_Policy.findOne({
      where: whereClause,
      order: [['version', 'DESC'], ['effectiveFrom', 'DESC']],
    });

    if (policy) {
      let parsedRules = {};
      try {
        parsedRules = typeof policy.rules === 'string' ? JSON.parse(policy.rules) : policy.rules;
      } catch (e) {
        console.error(`[PolicyEngine] Error parsing rules for policy ${policy.id}:`, e);
      }
      return {
        ...policy.toJSON(),
        parsedRules
      };
    }
  }

  return null;
};

/**
 * 2. Đóng băng tài chính và chính sách cho Booking (Hybrid Snapshot & Frozen Amounts)
 * @param {object} param0 { doctorId, clinicId, totalAmount, bookingDate }
 * @param {object} transaction Sequelize transaction (optional)
 */
const freezeBookingFinancials = async ({ doctorId, clinicId, totalAmount, bookingDate = new Date() }, transaction = null) => {
  const amount = Number(totalAmount) || 0;

  // 1. Phân giải Revenue Share Policy
  let revenuePolicy = null;
  if (doctorId) {
    revenuePolicy = await resolveActivePolicy('REVENUE_SHARE', 'DOCTOR', doctorId, bookingDate);
  }
  if (!revenuePolicy && clinicId) {
    revenuePolicy = await resolveActivePolicy('REVENUE_SHARE', 'CLINIC', clinicId, bookingDate);
  }
  if (!revenuePolicy) {
    revenuePolicy = await resolveActivePolicy('REVENUE_SHARE', 'GLOBAL', null, bookingDate);
  }

  // 2. Phân giải Refund Rule Policy
  let refundPolicy = null;
  if (doctorId) {
    refundPolicy = await resolveActivePolicy('REFUND_RULE', 'DOCTOR', doctorId, bookingDate);
  }
  if (!refundPolicy && clinicId) {
    refundPolicy = await resolveActivePolicy('REFUND_RULE', 'CLINIC', clinicId, bookingDate);
  }
  if (!refundPolicy) {
    refundPolicy = await resolveActivePolicy('REFUND_RULE', 'GLOBAL', null, bookingDate);
  }

  // Cấu hình tỷ lệ phân chia
  const revRules = revenuePolicy?.parsedRules || {
    platformFeePercent: 15,
    doctorSharePercent: 85,
    clinicSharePercent: 0
  };

  const platformFeePercent = Number(revRules.platformFeePercent) || 0;
  const clinicSharePercent = Number(revRules.clinicSharePercent) || 0;
  
  // Tính chính xác số tiền làm tròn, chênh lệch dồn vào bác sĩ để đảm bảo tổng tiền = totalAmount
  const platformFee = Math.round((amount * platformFeePercent) / 100);
  const clinicShare = Math.round((amount * clinicSharePercent) / 100);
  const doctorShare = Math.max(0, amount - platformFee - clinicShare);

  const snapshot = {
    appliedAt: new Date().toISOString(),
    totalAmount: amount,
    revenuePolicy: revenuePolicy ? {
      id: revenuePolicy.id,
      code: revenuePolicy.code,
      name: revenuePolicy.name,
      version: revenuePolicy.version,
      scopeType: revenuePolicy.scopeType,
      scopeId: revenuePolicy.scopeId,
      rules: revRules
    } : null,
    refundPolicy: refundPolicy ? {
      id: refundPolicy.id,
      code: refundPolicy.code,
      name: refundPolicy.name,
      version: refundPolicy.version,
      scopeType: refundPolicy.scopeType,
      scopeId: refundPolicy.scopeId,
      rules: refundPolicy.parsedRules || null
    } : null,
    calculation: {
      platformFee,
      doctorShare,
      clinicShare
    }
  };

  // Đánh dấu isLocked = true cho các policy đã được tham chiếu
  const policyIdsToLock = [revenuePolicy?.id, refundPolicy?.id].filter(Boolean);
  if (policyIdsToLock.length > 0) {
    await db.Financial_Policy.update(
      { isLocked: true },
      { where: { id: { [Op.in]: policyIdsToLock } }, transaction }
    );
  }

  return {
    revenuePolicyId: revenuePolicy?.id || null,
    refundPolicyId: refundPolicy?.id || null,
    policySnapshot: JSON.stringify(snapshot),
    platformFee,
    doctorShare,
    clinicShare,
  };
};

/**
 * 3. Tính toán số tiền hoàn dựa trên Snapshot bất biến của Booking
 * @param {object} booking Instance hoặc Plain Object của Booking
 * @param {Date|string} cancelledAt Thời điểm hủy khám
 */
const calculateRefundFromBookingSnapshot = (booking, cancelledAt = new Date()) => {
  let snapshot = null;
  if (typeof booking.policySnapshot === 'string') {
    try {
      snapshot = JSON.parse(booking.policySnapshot);
    } catch (e) {
      snapshot = null;
    }
  } else if (typeof booking.policySnapshot === 'object') {
    snapshot = booking.policySnapshot;
  }

  const cancelDate = new Date(cancelledAt);
  // Xác định thời điểm diễn ra lịch khám (booking.date thường là epoch ms dạng string/number)
  let appointmentTime = null;
  if (booking.date) {
    const rawDate = Number(booking.date);
    if (!isNaN(rawDate) && rawDate > 1000000000) {
      appointmentTime = new Date(rawDate);
    } else {
      appointmentTime = new Date(booking.date);
    }
  }

  // Tính số giờ chênh lệch trước giờ khám
  let hoursBefore = 999;
  if (appointmentTime && !isNaN(appointmentTime.getTime())) {
    hoursBefore = (appointmentTime.getTime() - cancelDate.getTime()) / (1000 * 60 * 60);
  }

  // Trích xuất rules từ snapshot (hoặc fallback mặc định an toàn)
  const refundRules = snapshot?.refundPolicy?.rules || {
    tiers: [
      { minHoursBefore: 24, refundPercent: 100 },
      { minHoursBefore: 12, refundPercent: 75 },
      { minHoursBefore: 0, refundPercent: 50 },
    ],
    defaultRefundPercent: 0
  };

  const tiers = Array.isArray(refundRules.tiers) ? [...refundRules.tiers] : [];
  // Sắp xếp các mốc thời gian từ cao xuống thấp (24h -> 12h -> 0h)
  tiers.sort((a, b) => b.minHoursBefore - a.minHoursBefore);

  let appliedRefundPercent = refundRules.defaultRefundPercent ?? 0;
  let matchedTier = null;

  for (const tier of tiers) {
    if (hoursBefore >= tier.minHoursBefore) {
      appliedRefundPercent = tier.refundPercent;
      matchedTier = tier;
      break;
    }
  }

  // Tổng tiền khám gốc
  const originalAmount = Number(booking.totalAmount || booking.depositAmount || 0);
  const refundAmount = Math.round((originalAmount * appliedRefundPercent) / 100);
  const deductionAmount = originalAmount - refundAmount;

  return {
    success: true,
    hoursBefore: Math.round(hoursBefore * 10) / 10,
    appliedRefundPercent,
    refundAmount,
    deductionAmount,
    matchedTier,
    isFrozenSnapshotUsed: !!snapshot,
    policyInfo: snapshot?.refundPolicy || null
  };
};

/**
 * 4. Tạo mới một chính sách phí / hoàn tiền
 * @param {object} data
 * @param {number} adminId
 */
const createPolicy = async (data, adminId) => {
  const {
    code,
    policyType,
    name,
    scopeType = 'GLOBAL',
    scopeId = null,
    effectiveFrom,
    effectiveTo = null,
    rules,
    description = '',
    status = 'ACTIVE'
  } = data;

  if (!code || !policyType || !name || !effectiveFrom || !rules) {
    throw new Error('Thiếu các trường thông tin bắt buộc (code, policyType, name, effectiveFrom, rules)');
  }

  const stringifiedRules = typeof rules === 'object' ? JSON.stringify(rules) : rules;

  // Kiểm tra tính hợp lệ của JSON rules
  try {
    JSON.parse(stringifiedRules);
  } catch (e) {
    throw new Error('Định dạng rules phải là chuỗi JSON hoặc đối tượng hợp lệ');
  }

  const fromDate = new Date(effectiveFrom);
  const toDate = effectiveTo ? new Date(effectiveTo) : null;

  if (toDate && toDate <= fromDate) {
    throw new Error('Ngày kết thúc (effectiveTo) phải lớn hơn ngày bắt đầu hiệu lực (effectiveFrom)');
  }

  // Nếu tạo với trạng thái ACTIVE, kiểm tra xem có xung đột thời gian với policy ACTIVE cùng scope không
  if (status === 'ACTIVE') {
    const whereOverlap = {
      policyType,
      scopeType,
      status: 'ACTIVE',
      [Op.or]: [
        {
          effectiveFrom: { [Op.lte]: fromDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: fromDate } }
          ]
        }
      ]
    };
    if (scopeId) whereOverlap.scopeId = scopeId;
    else whereOverlap.scopeId = null;

    const existingActive = await db.Financial_Policy.findOne({ where: whereOverlap });
    if (existingActive) {
      // Tự động khép lại policy cũ nếu muốn versioning nối tiếp
      await db.Financial_Policy.update(
        {
          effectiveTo: fromDate,
          status: 'SUPERSEDED'
        },
        { where: { id: existingActive.id } }
      );
    }
  }

  const newPolicy = await db.Financial_Policy.create({
    code,
    policyType,
    name,
    version: 1,
    scopeType,
    scopeId: scopeId ? parseInt(scopeId, 10) : null,
    effectiveFrom: fromDate,
    effectiveTo: toDate,
    status,
    rules: stringifiedRules,
    description,
    isLocked: false,
    createdById: adminId
  });

  return newPolicy;
};

/**
 * 5. Tạo version mới (v+1) khi chính sách thay đổi — BẢO TOÀN LỊCH SỬ BẤT BIẾN
 * Không sửa đè record cũ mà chốt effectiveTo của record cũ, sinh record mới với version kế tiếp
 * @param {number} policyId ID của policy hiện tại
 * @param {object} updatedData Dữ liệu cập nhật
 * @param {number} adminId
 */
const createPolicyVersion = async (policyId, updatedData, adminId) => {
  const currentPolicy = await db.Financial_Policy.findByPk(policyId);
  if (!currentPolicy) {
    throw new Error(`Không tìm thấy chính sách với ID: ${policyId}`);
  }

  const newEffectiveFrom = updatedData.effectiveFrom ? new Date(updatedData.effectiveFrom) : new Date();
  const newEffectiveTo = updatedData.effectiveTo ? new Date(updatedData.effectiveTo) : null;

  const stringifiedRules = updatedData.rules 
    ? (typeof updatedData.rules === 'object' ? JSON.stringify(updatedData.rules) : updatedData.rules)
    : currentPolicy.rules;

  // Chốt record hiện tại: Đặt effectiveTo = newEffectiveFrom và chuyển status = SUPERSEDED
  await db.Financial_Policy.update(
    {
      effectiveTo: newEffectiveFrom,
      status: 'SUPERSEDED'
    },
    { where: { id: currentPolicy.id } }
  );

  // Sinh record mới với version kế tiếp
  const newVersion = await db.Financial_Policy.create({
    code: currentPolicy.code,
    policyType: currentPolicy.policyType,
    name: updatedData.name || currentPolicy.name,
    version: currentPolicy.version + 1,
    scopeType: currentPolicy.scopeType,
    scopeId: currentPolicy.scopeId,
    effectiveFrom: newEffectiveFrom,
    effectiveTo: newEffectiveTo,
    status: updatedData.status || 'ACTIVE',
    rules: stringifiedRules,
    description: updatedData.description || currentPolicy.description,
    isLocked: false,
    createdById: adminId
  });

  return newVersion;
};

/**
 * 6. Chỉnh sửa bản thảo chính sách (Chỉ được phép khi isLocked = false)
 * @param {number} policyId
 * @param {object} updatedData
 * @param {number} adminId
 */
const updatePolicyDraft = async (policyId, updatedData, adminId) => {
  const policy = await db.Financial_Policy.findByPk(policyId);
  if (!policy) {
    throw new Error(`Không tìm thấy chính sách với ID: ${policyId}`);
  }

  if (policy.isLocked) {
    throw new Error(
      `Chính sách này đã phát sinh giao dịch/booking thực tế và đã bị khóa bất biến (isLocked = true). ` +
      `Vui lòng sử dụng chức năng 'Tạo phiên bản mới (v${policy.version + 1})' để thay đổi.`
    );
  }

  const updatePayload = {};
  if (updatedData.name) updatePayload.name = updatedData.name;
  if (updatedData.description !== undefined) updatePayload.description = updatedData.description;
  if (updatedData.rules) {
    updatePayload.rules = typeof updatedData.rules === 'object' ? JSON.stringify(updatedData.rules) : updatedData.rules;
  }
  if (updatedData.effectiveFrom) updatePayload.effectiveFrom = new Date(updatedData.effectiveFrom);
  if (updatedData.effectiveTo !== undefined) {
    updatePayload.effectiveTo = updatedData.effectiveTo ? new Date(updatedData.effectiveTo) : null;
  }
  if (updatedData.status) updatePayload.status = updatedData.status;

  await policy.update(updatePayload);
  return policy;
};

/**
 * 7. Lấy danh sách chính sách với bộ lọc & phân trang
 */
const getPoliciesList = async (params = {}) => {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.max(1, parseInt(params.limit, 10) || 10);
  const offset = (page - 1) * limit;

  const where = {};
  if (params.policyType && params.policyType !== 'ALL') {
    where.policyType = params.policyType;
  }
  if (params.scopeType && params.scopeType !== 'ALL') {
    where.scopeType = params.scopeType;
  }
  if (params.status && params.status !== 'ALL') {
    where.status = params.status;
  }
  if (params.search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${params.search}%` } },
      { code: { [Op.iLike]: `%${params.search}%` } }
    ];
  }

  const { count, rows } = await db.Financial_Policy.findAndCountAll({
    where,
    order: [
      ['policyType', 'ASC'],
      ['scopeType', 'ASC'],
      ['version', 'DESC'],
      ['effectiveFrom', 'DESC']
    ],
    limit,
    offset,
    include: [
      {
        model: db.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }
    ]
  });

  // Đếm số booking liên kết cho mỗi policy
  const policiesWithStats = await Promise.all(rows.map(async (row) => {
    const item = row.toJSON();
    try {
      item.parsedRules = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules;
    } catch (e) {
      item.parsedRules = {};
    }

    const bookingCount = await db.Booking.count({
      where: {
        [Op.or]: [
          { revenuePolicyId: item.id },
          { refundPolicyId: item.id }
        ]
      }
    });
    item.linkedBookingCount = bookingCount;
    return item;
  }));

  return {
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
    data: policiesWithStats
  };
};

/**
 * 8. Lấy chi tiết một chính sách
 */
const getPolicyDetail = async (id) => {
  const policy = await db.Financial_Policy.findByPk(id, {
    include: [
      {
        model: db.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }
    ]
  });

  if (!policy) return null;

  const item = policy.toJSON();
  try {
    item.parsedRules = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules;
  } catch (e) {
    item.parsedRules = {};
  }

  const linkedBookingCount = await db.Booking.count({
    where: {
      [Op.or]: [
        { revenuePolicyId: item.id },
        { refundPolicyId: item.id }
      ]
    }
  });
  item.linkedBookingCount = linkedBookingCount;

  // Lấy lịch sử các phiên bản khác cùng code & scope
  const versionHistory = await db.Financial_Policy.findAll({
    where: {
      code: item.code,
      scopeType: item.scopeType,
      scopeId: item.scopeId
    },
    order: [['version', 'DESC']],
    attributes: ['id', 'version', 'name', 'status', 'effectiveFrom', 'effectiveTo', 'isLocked', 'createdAt']
  });
  item.versionHistory = versionHistory;

  return item;
};

/**
 * 9. Khởi tạo chính sách mặc định nếu hệ thống chưa có chính sách nào
 */
const seedDefaultPoliciesIfEmpty = async () => {
  const count = await db.Financial_Policy.count();
  if (count > 0) return { seeded: false, count };

  const now = new Date();
  // 1. Global Revenue Share Policy: 15% Platform, 85% Doctor
  await db.Financial_Policy.create({
    code: 'POL_REVENUE_SHARE',
    policyType: 'REVENUE_SHARE',
    name: 'Chính sách Phân bổ Doanh thu Tiêu chuẩn Toàn hệ thống (v1)',
    version: 1,
    scopeType: 'GLOBAL',
    scopeId: null,
    effectiveFrom: new Date(now.getFullYear(), 0, 1), // Từ đầu năm hiện tại
    effectiveTo: null,
    status: 'ACTIVE',
    rules: JSON.stringify({
      platformFeePercent: 15,
      doctorSharePercent: 85,
      clinicSharePercent: 0,
      note: 'Áp dụng cho mọi lịch hẹn khám mặc định trừ khi có thỏa thuận riêng'
    }),
    description: 'Chính sách phân bổ hoa hồng BookingCare: Sàn giữ 15%, Bác sĩ hưởng 85%.',
    isLocked: false,
    createdById: 1
  });

  // 2. Global Refund Rule Policy: Bậc thang 24h/12h
  await db.Financial_Policy.create({
    code: 'POL_REFUND_RULE',
    policyType: 'REFUND_RULE',
    name: 'Quy định Hoàn tiền Hủy lịch Khám Bệnh nhân Toàn sàn (v1)',
    version: 1,
    scopeType: 'GLOBAL',
    scopeId: null,
    effectiveFrom: new Date(now.getFullYear(), 0, 1),
    effectiveTo: null,
    status: 'ACTIVE',
    rules: JSON.stringify({
      tiers: [
        { minHoursBefore: 24, refundPercent: 100, label: 'Hủy trước 24 giờ' },
        { minHoursBefore: 12, refundPercent: 75, label: 'Hủy trước từ 12 - 24 giờ' },
        { minHoursBefore: 0, refundPercent: 50, label: 'Hủy sát giờ khám (< 12 giờ)' }
      ],
      defaultRefundPercent: 0,
      note: 'Sau khi qua giờ khám hoặc vắng mặt không báo trước sẽ không được hoàn tiền.'
    }),
    description: 'Quy định hoàn tiền theo mốc thời gian báo trước đối với các lịch khám đã thanh toán trước.',
    isLocked: false,
    createdById: 1
  });

  return { seeded: true, count: 2 };
};

module.exports = {
  resolveActivePolicy,
  freezeBookingFinancials,
  calculateRefundFromBookingSnapshot,
  createPolicy,
  createPolicyVersion,
  updatePolicyDraft,
  getPoliciesList,
  getPolicyDetail,
  seedDefaultPoliciesIfEmpty
};
