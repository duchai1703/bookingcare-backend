'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 01 — AI Foundation] Safe Structured Logger (Zero PII Leakage)
// Replaces raw console.log(message) with sanitized operational metadata
// ═══════════════════════════════════════════════════════════════════════

/**
 * Log thông tin bắt đầu request AI an toàn
 * @param {Object} meta
 * @param {string} meta.requestId
 * @param {number|string} meta.userId
 * @param {number} [meta.messageLength]
 * @param {string} [meta.intent]
 */
function logAIRequestStart(meta) {
  const payload = {
    event: meta.event || 'AI_REQUEST_START',
    timestamp: new Date().toISOString(),
    requestId: meta.requestId,
    userId: meta.userId ? `usr_${meta.userId}` : 'anonymous',
    messageLength: meta.messageLength || 0,
    intent: meta.intent || 'UNKNOWN',
  };
  console.log(`[AI_INFO] ${JSON.stringify(payload)}`);
}

/**
 * Log thông tin thực thi Function/Tool an toàn
 * @param {Object} meta
 * @param {string} meta.requestId
 * @param {string} meta.toolName
 * @param {number|string} meta.userId
 * @param {boolean} meta.success
 * @param {number} meta.durationMs
 */
function logAIToolExecution(meta) {
  const payload = {
    event: 'AI_TOOL_EXECUTION',
    timestamp: new Date().toISOString(),
    requestId: meta.requestId,
    toolName: meta.toolName,
    userId: meta.userId ? `usr_${meta.userId}` : 'anonymous',
    success: meta.success,
    durationMs: meta.durationMs || 0,
  };
  console.log(`[AI_TOOL] ${JSON.stringify(payload)}`);
}

/**
 * Log thông tin hoàn thành request AI an toàn
 * @param {Object} meta
 * @param {string} meta.requestId
 * @param {number|string} meta.userId
 * @param {number} meta.totalDurationMs
 * @param {number} meta.chunksCount
 * @param {number} meta.toolCallsCount
 * @param {string} meta.status - 'SUCCESS' | 'TIMEOUT' | 'ERROR' | 'ABORTED'
 */
function logAIRequestComplete(meta) {
  const payload = {
    event: 'AI_REQUEST_COMPLETE',
    timestamp: new Date().toISOString(),
    requestId: meta.requestId,
    userId: meta.userId ? `usr_${meta.userId}` : 'anonymous',
    durationMs: meta.totalDurationMs || 0,
    chunksCount: meta.chunksCount || 0,
    toolCallsCount: meta.toolCallsCount || 0,
    status: meta.status || 'SUCCESS',
  };
  console.log(`[AI_COMPLETE] ${JSON.stringify(payload)}`);
}

/**
 * Log lỗi hệ thống AI an toàn (không rò rỉ stack trace chứa PII ra client)
 * @param {Object} meta
 * @param {string} meta.requestId
 * @param {number|string} [meta.userId]
 * @param {string} meta.errorCode
 * @param {string} meta.errorMessage
 */
function logAIError(meta) {
  const safeMessage = typeof meta.errorMessage === 'string'
    ? meta.errorMessage.slice(0, 300)
    : 'Unknown internal error';

  const payload = {
    event: 'AI_REQUEST_ERROR',
    timestamp: new Date().toISOString(),
    requestId: meta.requestId,
    userId: meta.userId ? `usr_${meta.userId}` : 'anonymous',
    errorCode: meta.errorCode || 'AI_INTERNAL_ERROR',
    errorMessage: safeMessage,
  };
  console.error(`[AI_ERROR] ${JSON.stringify(payload)}`);
}

const aiLogger = {
  info: (requestId, event, data = {}) => {
    logAIRequestStart({ requestId, ...data, event });
  },
  warn: (requestId, event, data = {}) => {
    const payload = {
      event: event || 'AI_WARN',
      timestamp: new Date().toISOString(),
      requestId,
      userId: data?.userId ? `usr_${data.userId}` : 'anonymous',
      ...data,
    };
    console.warn(`[AI_WARN] ${JSON.stringify(payload)}`);
  },
  error: (requestId, errorCode, data = {}) => {
    logAIError({ requestId, errorCode, errorMessage: data?.error || data?.message });
  },
  complete: (meta) => {
    logAIRequestComplete(meta);
  },
  tool: (meta) => {
    logAIToolExecution(meta);
  },
};

module.exports = {
  aiLogger,
  logAIRequestStart,
  logAIToolExecution,
  logAIRequestComplete,
  logAIError,
};
