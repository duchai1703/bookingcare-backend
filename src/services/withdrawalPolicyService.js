// bookingcare-backend/src/services/withdrawalPolicyService.js
// Quản lý Chính Sách Thời Hạn Rút Tiền Linh Hoạt (SLA) & Tích Hợp Kiểm Toán Bất Biến
'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const policyAuditService = require('./policyAuditService');

/**
 * Tính toán ngày cộng thêm có tính ngày làm việc (nếu bật business days)
 */
function addDays(startDate, days, businessDaysOnly = false) {
  const date = new Date(startDate);
  if (!businessDaysOnly) {
    date.setDate(date.getDate() + days);
    return date;
  }

  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    // 0 = Chủ Nhật, 6 = Thứ Bảy
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return date;
}

/**
 * Lấy chính sách SLA rút tiền đang Active và có hiệu lực
 */
async function getActiveWithdrawalPolicy(targetDate = new Date()) {
  const dateObj = new Date(targetDate);

  const policy = await db.Financial_Policy.findOne({
    where: {
      policyType: 'WITHDRAWAL_SLA',
      scopeType: 'GLOBAL',
      status: 'ACTIVE',
      effectiveFrom: { [Op.lte]: dateObj },
      [Op.or]: [
        { effectiveTo: null },
        { effectiveTo: { [Op.gte]: dateObj } },
      ],
    },
    order: [
      ['version', 'DESC'],
      ['effectiveFrom', 'DESC'],
    ],
    include: [
      {
        model: db.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
    ],
  });

  if (!policy) {
    // Fallback mặc định an toàn nếu DB chưa có
    return {
      id: null,
      code: 'POL_WITHDRAWAL_SLA_FALLBACK',
      name: 'Chính sách rút tiền mặc định (Fallback 7 ngày)',
      version: 1,
      status: 'ACTIVE',
      parsedRules: {
        defaultSlaDays: 7,
        allowCustomDays: true,
        minSlaDays: 1,
        maxSlaDays: 60,
        isBusinessDaysOnly: false,
        tiers: [
          { minAmount: 50000, maxAmount: 5000000, slaDays: 1, label: 'Hạn mức nhỏ (< 5 triệu) — Xử lý trong 24 giờ' },
          { minAmount: 5000001, maxAmount: 20000000, slaDays: 3, label: 'Hạn mức tiêu chuẩn (5 - 20 triệu) — Đối soát trong 3 ngày' },
          { minAmount: 20000001, maxAmount: null, slaDays: 7, label: 'Hạn mức lớn (> 20 triệu) — Thẩm định trong 7 ngày' },
        ],
        policyNoticeVi: 'Thời gian giải ngân từ 1 đến 7 ngày tùy thuộc vào hạn mức rút tiền và thời gian đối soát của ngân hàng.',
      },
    };
  }

  const item = policy.toJSON();
  try {
    item.parsedRules = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules;
  } catch (e) {
    item.parsedRules = { defaultSlaDays: 7, tiers: [] };
  }

  return item;
}

/**
 * Tính toán SLA và ngày cam kết giải ngân dựa trên số tiền rút
 */
async function calculateWithdrawalSla(amount, targetDate = new Date()) {
  const numAmount = Math.max(0, Number(amount) || 0);
  const activePolicy = await getActiveWithdrawalPolicy(targetDate);
  const rules = activePolicy.parsedRules || {};

  const defaultSlaDays = parseInt(rules.defaultSlaDays, 10) || 7;
  const isBusinessDaysOnly = Boolean(rules.isBusinessDaysOnly);
  const tiers = Array.isArray(rules.tiers) ? rules.tiers : [];

  let matchedTier = null;
  let appliedSlaDays = defaultSlaDays;

  for (const tier of tiers) {
    const min = Number(tier.minAmount) || 0;
    const max = tier.maxAmount !== null && tier.maxAmount !== undefined ? Number(tier.maxAmount) : Infinity;

    if (numAmount >= min && numAmount <= max) {
      matchedTier = tier;
      appliedSlaDays = parseInt(tier.slaDays, 10) || defaultSlaDays;
      break;
    }
  }

  // Đảm bảo số ngày tối thiểu là 1
  appliedSlaDays = Math.max(1, appliedSlaDays);

  const promisedPayoutDate = addDays(targetDate, appliedSlaDays, isBusinessDaysOnly);

  const policySnapshot = {
    policyId: activePolicy.id,
    policyCode: activePolicy.code,
    policyName: activePolicy.name,
    policyVersion: activePolicy.version,
    appliedSlaDays,
    isBusinessDaysOnly,
    matchedTier: matchedTier
      ? {
          minAmount: matchedTier.minAmount,
          maxAmount: matchedTier.maxAmount,
          slaDays: matchedTier.slaDays,
          label: matchedTier.label,
        }
      : null,
    calculatedAt: targetDate,
    promisedPayoutDate,
  };

  return {
    appliedSlaDays,
    promisedPayoutDate,
    policyId: activePolicy.id,
    policyCode: activePolicy.code,
    policyVersion: activePolicy.version,
    policySnapshot: JSON.stringify(policySnapshot),
    matchedTier,
    policyNoticeVi: rules.policyNoticeVi || `Thời gian dự kiến xử lý yêu cầu rút tiền là ${appliedSlaDays} ngày.`,
  };
}

/**
 * Cập nhật chính sách SLA rút tiền linh hoạt (Tạo phiên bản mới + Ghi log kiểm toán bắt buộc)
 */
async function updateWithdrawalPolicy({
  adminId,
  defaultSlaDays,
  allowCustomDays = true,
  minSlaDays = 1,
  maxSlaDays = 60,
  isBusinessDaysOnly = false,
  tiers = [],
  policyNoticeVi = '',
  description = '',
  reason,
  ipAddress = null,
  userAgent = null,
}) {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Bắt buộc phải nhập lý do giải trình khi cập nhật chính sách rút tiền.');
  }

  const numDefaultSla = parseInt(defaultSlaDays, 10);
  if (!numDefaultSla || numDefaultSla < 1) {
    throw new Error('Số ngày hoàn tiền/SLA mặc định phải là số nguyên dương (ít nhất 1 ngày).');
  }

  const currentPolicy = await db.Financial_Policy.findOne({
    where: {
      policyType: 'WITHDRAWAL_SLA',
      scopeType: 'GLOBAL',
      status: 'ACTIVE',
    },
    order: [['version', 'DESC']],
  });

  const nextVersion = currentPolicy ? currentPolicy.version + 1 : 1;

  const newRules = {
    defaultSlaDays: numDefaultSla,
    allowCustomDays: Boolean(allowCustomDays),
    minSlaDays: parseInt(minSlaDays, 10) || 1,
    maxSlaDays: parseInt(maxSlaDays, 10) || 60,
    isBusinessDaysOnly: Boolean(isBusinessDaysOnly),
    tiers: Array.isArray(tiers)
      ? tiers.map((t) => ({
          minAmount: Number(t.minAmount) || 0,
          maxAmount: t.maxAmount !== null && t.maxAmount !== undefined && t.maxAmount !== '' ? Number(t.maxAmount) : null,
          slaDays: Math.max(1, parseInt(t.slaDays, 10) || numDefaultSla),
          label: t.label || '',
        }))
      : [],
    policyNoticeVi: policyNoticeVi || `Thời gian hoàn tất rút tiền từ ${minSlaDays} đến ${numDefaultSla} ngày tùy hạn mức giao dịch.`,
  };

  const t = await db.sequelize.transaction();
  try {
    const now = new Date();

    // Nếu đã có chính sách cũ, đóng hiệu lực của nó và đánh dấu SUPERSEDED
    if (currentPolicy) {
      await currentPolicy.update(
        {
          effectiveTo: now,
          status: 'SUPERSEDED',
        },
        { transaction: t }
      );
    }

    // Tạo phiên bản chính sách mới
    const newPolicy = await db.Financial_Policy.create(
      {
        code: 'POL_WITHDRAWAL_SLA_GLOBAL',
        policyType: 'WITHDRAWAL_SLA',
        name: `Chính Sách Cam Kết Thời Hạn Rút Tiền Linh Hoạt Toàn Sàn (v${nextVersion})`,
        version: nextVersion,
        scopeType: 'GLOBAL',
        scopeId: null,
        targetMode: 'ALL_DOCTORS',
        effectiveFrom: now,
        effectiveTo: null,
        status: 'ACTIVE',
        rules: JSON.stringify(newRules),
        description: description || `Cập nhật SLA rút tiền (v${nextVersion}) - ${reason.trim()}`,
        isLocked: false,
        createdById: adminId,
      },
      { transaction: t }
    );

    // Ghi nhận Audit Log Bất biến
    await policyAuditService.recordAuditLog(
      {
        policyType: 'WITHDRAWAL_SLA',
        policyId: newPolicy.id,
        action: 'UPDATE_SLA',
        oldValue: currentPolicy
          ? {
              id: currentPolicy.id,
              version: currentPolicy.version,
              rules: currentPolicy.rules,
            }
          : null,
        newValue: {
          id: newPolicy.id,
          version: nextVersion,
          rules: newRules,
          effectiveFrom: now,
        },
        reason: reason.trim(),
        adminId,
        ipAddress,
        userAgent,
      },
      t
    );

    await t.commit();

    return {
      success: true,
      message: `Cập nhật chính sách SLA rút tiền thành công (Phiên bản v${nextVersion})`,
      policy: {
        ...newPolicy.toJSON(),
        parsedRules: newRules,
      },
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/**
 * Lấy lịch sử tất cả các phiên bản chính sách SLA rút tiền
 */
async function getAllWithdrawalPolicyVersions() {
  const policies = await db.Financial_Policy.findAll({
    where: {
      policyType: 'WITHDRAWAL_SLA',
      scopeType: 'GLOBAL',
    },
    order: [['version', 'DESC']],
    include: [
      {
        model: db.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
    ],
  });

  return policies.map((p) => {
    const item = p.toJSON();
    try {
      item.parsedRules = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules;
    } catch {
      item.parsedRules = {};
    }
    return item;
  });
}

module.exports = {
  getActiveWithdrawalPolicy,
  calculateWithdrawalSla,
  updateWithdrawalPolicy,
  getAllWithdrawalPolicyVersions,
};
