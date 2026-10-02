// bookingcare-backend/src/services/policyAuditService.js
// Service Quản lý Nhật ký Kiểm toán Chính sách Bất biến (Policy Audit Trail Engine)
'use strict';

const db = require('../models');
const { Op } = require('sequelize');

/**
 * Ghi nhận một bản ghi Audit Log Bất biến
 * Bắt buộc phải có lý do giải trình (reason) và Quản trị viên thực hiện (adminId)
 */
async function recordAuditLog(
  { policyType, policyId = null, action, oldValue = null, newValue, reason, adminId, ipAddress = null, userAgent = null },
  transaction = null
) {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Lý do giải trình (reason) là bắt buộc đối với mọi thay đổi hoặc khởi tạo chính sách.');
  }

  if (!adminId) {
    throw new Error('Định danh Quản trị viên (adminId) là bắt buộc để ghi nhận kiểm toán.');
  }

  const strOldValue = oldValue !== null ? (typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue)) : null;
  const strNewValue = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);

  const options = transaction ? { transaction } : {};

  const auditLog = await db.Policy_Audit_Log.create(
    {
      policyType,
      policyId,
      action,
      oldValue: strOldValue,
      newValue: strNewValue,
      reason: reason.trim(),
      adminId,
      ipAddress: ipAddress || '127.0.0.1',
      userAgent: userAgent || 'Internal System / Admin API',
    },
    options
  );

  return auditLog;
}

/**
 * Tra cứu danh sách nhật ký kiểm toán với phân trang & bộ lọc
 */
async function getAuditLogs({
  policyType = null,
  policyId = null,
  adminId = null,
  page = 1,
  limit = 20,
  startDate = null,
  endDate = null,
} = {}) {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const offset = (numPage - 1) * numLimit;

  const where = {};
  if (policyType && policyType !== 'ALL') {
    where.policyType = policyType;
  }
  if (policyId) {
    where.policyId = parseInt(policyId, 10);
  }
  if (adminId) {
    where.adminId = parseInt(adminId, 10);
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt[Op.gte] = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = end;
    }
  }

  const { count, rows } = await db.Policy_Audit_Log.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: numLimit,
    offset,
    include: [
      {
        model: db.User,
        as: 'admin',
        attributes: ['id', 'firstName', 'lastName', 'email', 'roleId'],
      },
      {
        model: db.Financial_Policy,
        as: 'financialPolicy',
        attributes: ['id', 'name', 'code', 'version', 'status', 'effectiveFrom', 'effectiveTo'],
        required: false,
      },
    ],
  });

  const parsedRows = rows.map((r) => {
    const item = r.toJSON();
    try {
      item.parsedOldValue = item.oldValue ? JSON.parse(item.oldValue) : null;
    } catch {
      item.parsedOldValue = item.oldValue;
    }
    try {
      item.parsedNewValue = item.newValue ? JSON.parse(item.newValue) : null;
    } catch {
      item.parsedNewValue = item.newValue;
    }
    return item;
  });

  return {
    total: count,
    page: numPage,
    limit: numLimit,
    totalPages: Math.ceil(count / numLimit),
    data: parsedRows,
  };
}

/**
 * Lấy toàn bộ lịch sử kiểm toán của một chính sách cụ thể
 */
async function getPolicyHistory(policyId) {
  const pId = parseInt(policyId, 10);
  if (!pId) throw new Error('ID chính sách không hợp lệ');

  const logs = await db.Policy_Audit_Log.findAll({
    where: { policyId: pId },
    order: [['createdAt', 'DESC']],
    include: [
      {
        model: db.User,
        as: 'admin',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
    ],
  });

  return logs.map((r) => {
    const item = r.toJSON();
    try {
      item.parsedOldValue = item.oldValue ? JSON.parse(item.oldValue) : null;
    } catch {
      item.parsedOldValue = item.oldValue;
    }
    try {
      item.parsedNewValue = item.newValue ? JSON.parse(item.newValue) : null;
    } catch {
      item.parsedNewValue = item.newValue;
    }
    return item;
  });
}

module.exports = {
  recordAuditLog,
  getAuditLogs,
  getPolicyHistory,
};
