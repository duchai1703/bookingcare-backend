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

module.exports = {
  createDraft,
  getDraft,
  consumeToken,
  deleteDraft,
  sweepExpired,
  _draftsById: draftsById,
  _draftsByToken: draftsByToken,
};
