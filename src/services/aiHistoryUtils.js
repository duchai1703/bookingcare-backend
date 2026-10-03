'use strict';

// ═══════════════════════════════════════════════════════════════════
// AI History Utils — Backward compatibility bridge to aiHistoryNormalizer
// ═══════════════════════════════════════════════════════════════════

const { normalizeGeminiHistory } = require('./aiHistoryNormalizer');

module.exports = {
  prepareHistory: normalizeGeminiHistory,
  normalizeGeminiHistory,
};
