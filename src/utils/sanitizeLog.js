// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.2] sanitizeLog.js
// Lọc bỏ thông tin nhạy cảm (secret, token, password) khỏi error object
// trước khi log ra console. Tránh rò rỉ credentials trong production logs.
// ═══════════════════════════════════════════════════════════════════════

const SENSITIVE_KEYS = [
  'password', 'secret', 'token', 'authorization', 'cookie',
  'vnp_HashSecret', 'VNP_HASH_SECRET', 'RECEIPT_FALLBACK_SECRET',
  'API_CRON_SECRET', 'JWT_SECRET', 'EMAIL_APP_PASSWORD',
];
// ✅ [Fix 2.C.1] Giá trị che giấu chuẩn hóa
const REDACTED_VALUE = '***';

function sanitizeLog(error, context) {
  if (!error) return { message: 'Unknown error', context };

  const sanitized = {
    message: error.message || String(error),
    context: context || null,
  };

  // Giữ lại stack trace nhưng cắt bớt cho gọn
  if (error.stack) {
    sanitized.stack = error.stack.split('\n').slice(0, 5).join('\n');
  }

  // Lọc bỏ config/data chứa keys nhạy cảm
  if (error.config) {
    const safeConfig = Object.assign({}, error.config);
    for (const key of Object.keys(safeConfig)) {
      const lowerKey = key.toLowerCase();
      for (const sensitive of SENSITIVE_KEYS) {
        if (lowerKey.includes(sensitive.toLowerCase())) {
          safeConfig[key] = REDACTED_VALUE;
          break;
        }
      }
    }
    sanitized.config = safeConfig;
  }

  // Sequelize error — chỉ giữ tên và SQL (không giữ values)
  if (error.name) {
    sanitized.name = error.name;
  }
  if (error.parent) {
    sanitized.parentMessage = error.parent.message || String(error.parent);
    sanitized.parentErrno = error.parent.errno || null;
  }

  return sanitized;
}

module.exports = sanitizeLog;
