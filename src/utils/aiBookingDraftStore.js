'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 05 — REAL IN-CHAT BOOKING] aiBookingDraftStore.js
// In-Memory Secure Draft Store with Single-Use Confirmation Tokens
// TTL: 15 minutes, Automatic Expiry Sweeper, IDOR & Replay Protection
// ═══════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const DRAFT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const draftsById = new Map();
const draftsByToken = new Map();

/**
 * Creates a validated booking draft with cryptographic single-use confirmation token
 * @param {Object} draftPayload Draft metadata resolved from backend SSOT
 * @returns {Object} Stored draft with draftId, confirmationToken, and expiresAt
 */
function createDraft(draftPayload) {
  const draftId = `draft_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).substr(2, 9)}`;
  const confirmationToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + DRAFT_TTL_MS;

  const draft = {
    ...draftPayload,
    draftId,
    confirmationToken,
    expiresAt,
    status: 'DRAFT',
    createdAt: now,
  };

  draftsById.set(draftId, draft);
  draftsByToken.set(confirmationToken, draft);

  // Auto-cleanup timer for this individual draft
  setTimeout(() => {
    deleteDraft(draftId);
  }, DRAFT_TTL_MS + 5000).unref?.();

  return draft;
}

/**
 * Retrieves draft by draftId or confirmationToken with expiry check
 */
function getDraft(draftId, confirmationToken) {
  let draft = null;
  if (draftId && draftsById.has(draftId)) {
    draft = draftsById.get(draftId);
  } else if (confirmationToken && draftsByToken.has(confirmationToken)) {
    draft = draftsByToken.get(confirmationToken);
  }

  if (!draft) return null;

  if (Date.now() > draft.expiresAt) {
    deleteDraft(draft.draftId);
    return null;
  }

  return draft;
}

/**
 * Atomically consumes a confirmation token for single-use guarantee
 * Enforces authenticated patient identity (IDOR prevention)
 */
function consumeToken(draftId, confirmationToken, userId) {
  const draft = getDraft(draftId, confirmationToken);
  if (!draft) {
    return { valid: false, reason: 'NOT_FOUND_OR_EXPIRED', message: 'Bản nháp đặt lịch không tồn tại hoặc đã hết hạn.' };
  }

  // IDOR Verification
  const patientId = draft.patient?.patientId || draft.patientId;
  if (Number(patientId) !== Number(userId)) {
    return { valid: false, reason: 'IDOR_MISMATCH', message: 'Bạn không có quyền xác nhận bản nháp này.' };
  }

  // Single-use check
  if (draft.status !== 'DRAFT') {
    return { valid: false, reason: 'ALREADY_CONSUMED', message: 'Bản nháp đặt lịch đã được sử dụng hoặc đang được xử lý.' };
  }

  // Mark consumed and remove from active token map to prevent replay
  draft.status = 'CONSUMED';
  draftsByToken.delete(draft.confirmationToken);

  return { valid: true, draft };
}

/**
 * Deletes a draft from memory
 */
function deleteDraft(draftId) {
  if (!draftId) return;
  const draft = draftsById.get(draftId);
  if (draft) {
    draftsByToken.delete(draft.confirmationToken);
    draftsById.delete(draftId);
  }
}

/**
 * Sweeps expired drafts
 */
function sweepExpired() {
  const now = Date.now();
  for (const [id, d] of draftsById.entries()) {
    if (now > d.expiresAt) {
      deleteDraft(id);
    }
  }
}

// Periodic cleanup sweep every 5 minutes
setInterval(sweepExpired, 5 * 60 * 1000).unref?.();

/**
 * Creates a validated cancellation draft with cryptographic single-use confirmation token
 * @param {Object} draftPayload Cancellation metadata resolved from backend SSOT
 * @returns {Object} Stored draft with draftId, confirmationToken, and expiresAt
 */
function createCancellationDraft(draftPayload) {
  const draftId = `cancel_draft_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).substr(2, 9)}`;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + DRAFT_TTL_MS;

  // Cryptographic HMAC binding: draftId + patientId + bookingId + CANCEL_BOOKING + expiresAt
  const secret = process.env.JWT_SECRET || 'bookingcare-secret-key-2026';
  const hmacPayload = `${draftId}|${draftPayload.patientId}|${draftPayload.bookingId}|CANCEL_BOOKING|${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(hmacPayload).digest('hex');
  const confirmationToken = `${rawToken}.${signature}`;

  const draft = {
    ...draftPayload,
    draftId,
    confirmationToken,
    action: 'CANCEL_BOOKING',
    expiresAt,
    status: 'DRAFT',
    createdAt: now,
  };

  draftsById.set(draftId, draft);
  draftsByToken.set(confirmationToken, draft);

  setTimeout(() => {
    deleteDraft(draftId);
  }, DRAFT_TTL_MS + 5000).unref?.();

  return draft;
}

/**
 * Atomically consumes a cancellation confirmation token for single-use guarantee
 */
function consumeCancellationToken(draftId, confirmationToken, userId) {
  if (!draftId || !confirmationToken) {
    return { valid: false, reason: 'INVALID_INPUT', message: 'Thiếu draftId hoặc confirmationToken.' };
  }

  let draft = draftsById.get(draftId) || (confirmationToken ? draftsByToken.get(confirmationToken) : null);
  if (!draft) {
    return { valid: false, reason: 'NOT_FOUND_OR_EXPIRED', message: 'Bản nháp hủy lịch không tồn tại hoặc đã hết hạn.' };
  }

  if (Date.now() > draft.expiresAt) {
    deleteDraft(draft.draftId);
    return { valid: false, reason: 'DRAFT_EXPIRED', message: 'Bản nháp hủy lịch đã hết hạn (15 phút).' };
  }

  // Action check
  if (draft.action !== 'CANCEL_BOOKING') {
    return { valid: false, reason: 'ACTION_MISMATCH', message: 'Bản nháp này không phải cho hành động hủy lịch.' };
  }

  // IDOR Verification
  const patientId = draft.patient?.patientId || draft.patientId;
  if (Number(patientId) !== Number(userId)) {
    return { valid: false, reason: 'IDOR_MISMATCH', message: 'Bạn không có quyền xác nhận bản nháp hủy lịch này.' };
  }

  // HMAC Signature validation
  const parts = String(confirmationToken).split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'INVALID_TOKEN_FORMAT', message: 'Mã xác nhận hủy không hợp lệ.' };
  }
  const secret = process.env.JWT_SECRET || 'bookingcare-secret-key-2026';
  const hmacPayload = `${draft.draftId}|${patientId}|${draft.bookingId}|CANCEL_BOOKING|${draft.expiresAt}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(hmacPayload).digest('hex');
  if (parts[1] !== expectedSig) {
    return { valid: false, reason: 'INVALID_SIGNATURE', message: 'Chữ ký xác thực bản nháp không hợp lệ.' };
  }

// Single-use check
  if (draft.status !== 'DRAFT') {
    return { valid: false, reason: 'TOKEN_CONSUMED_OR_EXPIRED', message: 'Bản nháp hủy lịch đã được sử dụng hoặc đang được xử lý.' };
  }

  // Mark consumed and prevent replay
  draft.status = 'CONSUMED';
  draftsByToken.delete(draft.confirmationToken);

  return { valid: true, draft };
}

/**
 * Creates a validated reschedule draft with cryptographic single-use confirmation token (Phase 06C)
 * @param {Object} draftPayload Reschedule metadata resolved from backend SSOT
 * @returns {Object} Stored draft with draftId, confirmationToken, and expiresAt
 */
function createRescheduleDraft(draftPayload) {
  const draftId = `reschedule_draft_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).substr(2, 9)}`;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + DRAFT_TTL_MS;

  const oldBookingId = draftPayload.bookingId || draftPayload.oldBookingId;
  const patientId = draftPayload.patientId || draftPayload.patient?.patientId;

  // Cryptographic HMAC binding: draftId + patientId + oldBookingId + RESCHEDULE_BOOKING + expiresAt
  const secret = process.env.JWT_SECRET || 'bookingcare-secret-key-2026';
  const hmacPayload = `${draftId}|${patientId}|${oldBookingId}|RESCHEDULE_BOOKING|${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(hmacPayload).digest('hex');
  const confirmationToken = `${rawToken}.${signature}`;

  const draft = {
    ...draftPayload,
    draftId,
    bookingId: oldBookingId,
    oldBookingId,
    patientId,
    confirmationToken,
    action: 'RESCHEDULE_BOOKING',
    expiresAt,
    status: 'DRAFT',
    createdAt: now,
  };

  draftsById.set(draftId, draft);
  draftsByToken.set(confirmationToken, draft);

  setTimeout(() => {
    deleteDraft(draftId);
  }, DRAFT_TTL_MS + 5000).unref?.();

  return draft;
}

/**
 * Atomically consumes a reschedule confirmation token for single-use guarantee (Phase 06C)
 */
function consumeRescheduleToken(draftId, confirmationToken, userId) {
  if (!draftId || !confirmationToken) {
    return { valid: false, reason: 'INVALID_INPUT', message: 'Thiếu draftId hoặc confirmationToken.' };
  }

  let draft = draftsById.get(draftId) || (confirmationToken ? draftsByToken.get(confirmationToken) : null);
  if (!draft) {
    return { valid: false, reason: 'NOT_FOUND_OR_EXPIRED', message: 'Bản nháp đổi lịch không tồn tại hoặc đã hết hạn.' };
  }

  if (Date.now() > draft.expiresAt) {
    deleteDraft(draft.draftId);
    return { valid: false, reason: 'DRAFT_EXPIRED', message: 'Bản nháp đổi lịch đã hết hạn (15 phút).' };
  }

  // Action check
  if (draft.action !== 'RESCHEDULE_BOOKING') {
    return { valid: false, reason: 'ACTION_MISMATCH', message: 'Bản nháp này không phải cho hành động đổi lịch.' };
  }

  // IDOR Verification
  const patientId = draft.patient?.patientId || draft.patientId;
  if (Number(patientId) !== Number(userId)) {
    return { valid: false, reason: 'IDOR_MISMATCH', message: 'Bạn không có quyền xác nhận bản nháp đổi lịch này.' };
  }

  // HMAC Signature validation
  const parts = String(confirmationToken).split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'INVALID_TOKEN_FORMAT', message: 'Mã xác nhận đổi lịch không hợp lệ.' };
  }
  const secret = process.env.JWT_SECRET || 'bookingcare-secret-key-2026';
  const oldBookingId = draft.bookingId || draft.oldBookingId;
  const hmacPayload = `${draft.draftId}|${patientId}|${oldBookingId}|RESCHEDULE_BOOKING|${draft.expiresAt}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(hmacPayload).digest('hex');
  if (parts[1] !== expectedSig) {
    return { valid: false, reason: 'INVALID_SIGNATURE', message: 'Chữ ký xác thực bản nháp không hợp lệ.' };
  }

  // Single-use check
  if (draft.status !== 'DRAFT') {
    return { valid: false, reason: 'TOKEN_CONSUMED_OR_EXPIRED', message: 'Bản nháp đổi lịch đã được sử dụng hoặc đang được xử lý.' };
  }

  // Mark consumed and prevent replay
  draft.status = 'CONSUMED';
  draftsByToken.delete(draft.confirmationToken);

  return { valid: true, draft };
}

module.exports = {
  createDraft,
  getDraft,
  consumeToken,
  createCancellationDraft,
  consumeCancellationToken,
  createRescheduleDraft,
  consumeRescheduleToken,
  deleteDraft,
  sweepExpired,
  _draftsById: draftsById,
  _draftsByToken: draftsByToken,
};

