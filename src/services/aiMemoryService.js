'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 07 — Controlled User Memory Service]
// Manages safe, allowlisted patient preferences with explicit lifecycle.
// Never persists diagnoses, symptoms as facts, medications, credentials, or PII.
// ═══════════════════════════════════════════════════════════════════════

const db = require('../models');
const { Op } = require('sequelize');

/**
 * Explicit allowlist of permissible memory keys.
 * Any key not in this list is strictly rejected.
 */
const ALLOWED_MEMORY_KEYS = Object.freeze([
  'preferredLanguage',          // e.g. 'vi', 'en'
  'preferredConsultationMode',  // e.g. 'OFFLINE', 'TELEMEDICINE'
  'preferredSpecialty',         // e.g. 'Tim mạch', 'Cơ xương khớp'
  'preferredClinic',            // e.g. 'Bệnh viện Chợ Rẫy'
  'communicationPreference',    // e.g. 'concise', 'detailed', 'friendly'
  'preferredTimeSlot',          // e.g. 'morning', 'afternoon'
]);

/**
 * Forbidden keywords/regex patterns for sensitive data.
 * If any candidate key or value matches these patterns, it is rejected immediately.
 */
const SENSITIVE_PATTERNS = [
  // Medical diagnoses, diseases, symptoms
  /(chẩn đoán|bệnh|triệu chứng|sốt|ung thư|tiểu đường|huyết áp|hiv|viêm gan|đau ngực|khó thở|diagnosis|disease|symptom|cancer|diabetes|hypertension|covid|chest pain)/i,
  // Medications & Prescriptions
  /(thuốc|toa thuốc|đơn thuốc|liều lượng|paracetamol|antibiotic|kháng sinh|panadol|ibuprofen|aspirin|prescription|dosage|medication|drug)/i,
  // Financial, credentials & identification
  /(password|mật khẩu|token|jwt|secret|vnp|api_key|credit|thẻ tín dụng|tài khoản|stk|cccd|cmnd|passport|balance|số dư|hoàn tiền|refund)/i,
  // System instruction override / prompt injection in memory
  /(ignore|bỏ qua|system prompt|developer mode|override|instructions|lệnh|hủy ngay|confirmBooking)/i,
];

/**
 * Validates a candidate memory key and value against safety policies.
 * @param {string} key
 * @param {any} value
 * @returns {{ valid: boolean, reason?: string, sanitizedValue?: string }}
 */
function validateMemoryCandidate(key, value) {
  if (!key || typeof key !== 'string') {
    return { valid: false, reason: 'KEY_INVALID' };
  }

  const safeKey = key.trim();
  if (!ALLOWED_MEMORY_KEYS.includes(safeKey)) {
    return { valid: false, reason: 'KEY_NOT_ALLOWLISTED', message: `Khóa '${safeKey}' không thuộc danh mục cho phép lưu nhớ.` };
  }

  if (value === undefined || value === null) {
    return { valid: false, reason: 'VALUE_EMPTY' };
  }

  const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value).trim();
  if (strValue.length === 0 || strValue.length > 200) {
    return { valid: false, reason: 'VALUE_LENGTH_EXCEEDED', message: 'Nội dung bộ nhớ phải từ 1 đến 200 ký tự.' };
  }

  // Check sensitive patterns in key and value
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(safeKey) || pattern.test(strValue)) {
      return {
        valid: false,
        reason: 'SENSITIVE_DATA_REJECTED',
        message: 'Nội dung chứa thông tin y tế nhạy cảm hoặc chỉ thị không an toàn, bị từ chối lưu vĩnh viễn.',
      };
    }
  }

  return { valid: true, sanitizedKey: safeKey, sanitizedValue: strValue };
}

/**
 * Saves a validated memory entry for an authenticated patient.
 * Atomically supersedes previous active memory with the same key.
 *
 * @param {Object} params
 * @param {number} params.userId Authenticated user ID (SSOT from JWT)
 * @param {string} params.key Allowlisted key
 * @param {any} params.value Value to store
 * @param {string} [params.conversationId] Optional conversation context
 * @param {string} [params.source='USER_STATED'] Provenance source
 * @param {number} [params.ttlMs] Optional Time-to-Live in milliseconds
 * @returns {Promise<Object>} Created memory object
 */
async function saveUserMemory({ userId, key, value, conversationId = null, source = 'USER_STATED', ttlMs = null }) {
  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    throw new Error('User ID không hợp lệ cho việc lưu trữ bộ nhớ.');
  }

  const validation = validateMemoryCandidate(key, value);
  if (!validation.valid) {
    const err = new Error(validation.message || 'Dữ liệu bộ nhớ không hợp lệ.');
    err.code = validation.reason;
    throw err;
  }

  const now = new Date();
  const expiresAt = ttlMs && Number.isFinite(ttlMs) ? new Date(now.getTime() + ttlMs) : null;

  // Transactionally supersede old active memory with the same key
  return await db.sequelize.transaction(async (t) => {
    await db.AIMemory.update(
      { status: 'SUPERSEDED' },
      {
        where: {
          userId: safeUserId,
          key: validation.sanitizedKey,
          status: 'ACTIVE',
        },
        transaction: t,
      }
    );

    const created = await db.AIMemory.create({
      userId: safeUserId,
      conversationId: conversationId ? String(conversationId) : null,
      memoryType: 'PREFERENCE',
      key: validation.sanitizedKey,
      value: validation.sanitizedValue,
      source: ['USER_STATED', 'USER_CONFIRMED', 'INFERRED_SAFE'].includes(source) ? source : 'USER_STATED',
      status: 'ACTIVE',
      confidence: 1.0,
      expiresAt,
    }, { transaction: t });

    return created.toJSON();
  });
}

/**
 * Retrieves active, unexpired safe memories for an authenticated patient.
 * Strict IDOR protection: only queries rows matching authenticated userId.
 *
 * @param {number} userId Authenticated patient ID
 * @returns {Promise<Array<Object>>} Safe memory records
 */
async function getUserMemories(userId) {
  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return [];
  }

  const now = new Date();
  const records = await db.AIMemory.findAll({
    where: {
      userId: safeUserId,
      status: 'ACTIVE',
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: now } },
      ],
    },
    order: [['updatedAt', 'DESC']],
    limit: 10,
  });

  return records.map((rec) => {
    const data = rec.toJSON();
    // Neutralize any prompt injection attempt in value
    const safeText = String(data.value).replace(/[\r\n]+/g, ' ').slice(0, 150);
    return {
      key: data.key,
      value: safeText,
      source: data.source,
      updatedAt: data.updatedAt,
    };
  });
}

/**
 * Deletes/forgets a specific memory key for the authenticated user.
 *
 * @param {number} userId Authenticated patient ID
 * @param {string} key Memory key to delete
 * @returns {Promise<boolean>} True if deactivated
 */
async function deleteUserMemory(userId, key) {
  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0 || !key) {
    return false;
  }

  const [affectedCount] = await db.AIMemory.update(
    { status: 'DELETED' },
    {
      where: {
        userId: safeUserId,
        key: String(key).trim(),
        status: 'ACTIVE',
      },
    }
  );

  return affectedCount > 0;
}

/**
 * Clears all active memories for the authenticated user (Right to be Forgotten).
 *
 * @param {number} userId Authenticated patient ID
 * @returns {Promise<number>} Number of records deactivated
 */
async function clearUserMemories(userId) {
  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return 0;
  }

  const [affectedCount] = await db.AIMemory.update(
    { status: 'DELETED' },
    {
      where: {
        userId: safeUserId,
        status: 'ACTIVE',
      },
    }
  );

  return affectedCount;
}

module.exports = {
  ALLOWED_MEMORY_KEYS,
  validateMemoryCandidate,
  saveUserMemory,
  getUserMemories,
  deleteUserMemory,
  clearUserMemories,
};
