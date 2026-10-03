'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 01 — AI Foundation] Centralized Gemini Configuration & Client
// Single Source of Truth for Model, Safety Settings, and Generation Config
// ═══════════════════════════════════════════════════════════════════════

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 600;
const DEFAULT_TIMEOUT_MS = 60000;

// Singleton client instance
let genAIInstance = null;

/**
 * Lấy hoặc khởi tạo instance GoogleGenerativeAI
 */
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLEASE_ENTER_YOUR_REAL_API_KEY_HERE') {
    return null;
  }

  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

/**
 * Kiểm tra xem tính năng AI Chatbot có được bật hay không
 */
function isAIChatbotEnabled() {
  return process.env.AI_CHATBOT_ENABLED === 'true';
}

/**
 * Kiểm tra tính hợp lệ của API Key
 */
function hasValidApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'PLEASE_ENTER_YOUR_REAL_API_KEY_HERE' && apiKey !== 'MISSING_KEY');
}

/**
 * Cấu hình an toàn chuẩn mực cho Gemini API
 */
const DEFAULT_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

/**
 * Lấy cấu hình model tập trung
 * @param {Object} options
 * @param {string} [options.systemInstruction]
 * @param {Array} [options.tools]
 * @param {number} [options.temperature]
 * @param {number} [options.maxOutputTokens]
 */
function getGenerativeModel(options = {}) {
  const client = getGenAIClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const modelName = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const temperature = typeof options.temperature === 'number' ? options.temperature : DEFAULT_TEMPERATURE;
  const maxOutputTokens = typeof options.maxOutputTokens === 'number' ? options.maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS;

  const modelConfig = {
    model: modelName,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
    safetySettings: DEFAULT_SAFETY_SETTINGS,
  };

  if (options.systemInstruction) {
    modelConfig.systemInstruction = options.systemInstruction;
  }

  if (Array.isArray(options.tools) && options.tools.length > 0) {
    modelConfig.tools = options.tools;
  }

  return client.getGenerativeModel(modelConfig);
}

function isAiConfigured() {
  return hasValidApiKey();
}

const GENERATION_CONFIG = {
  temperature: DEFAULT_TEMPERATURE,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
};

module.exports = {
  getGenAIClient,
  getGenerativeModel,
  isAIChatbotEnabled,
  hasValidApiKey,
  isAiConfigured,
  GENERATION_CONFIG,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SAFETY_SETTINGS,
};
