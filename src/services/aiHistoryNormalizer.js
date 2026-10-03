'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 01 — AI Foundation] Conversation History Normalizer
// Enforces strict Gemini SDK format, role alternation, and sliding window
// ═══════════════════════════════════════════════════════════════════════

const MAX_HISTORY_CHARS = 3000;

/**
 * Trích xuất text an toàn từ message bất kỳ
 * @param {Object} msg
 * @returns {string}
 */
function extractMessageText(msg) {
  if (!msg) return '';
  let text = '';
  if (typeof msg.text === 'string') text = msg.text.trim();
  else if (typeof msg.parts === 'string') text = msg.parts.trim();
  else if (Array.isArray(msg.parts)) {
    text = msg.parts
      .map((p) => (typeof p === 'string' ? p : p?.text || ''))
      .join('\n')
      .trim();
  }

  // Nếu tin nhắn có đính kèm ảnh
  if (msg.hasImage || msg.imageId || msg.imagePreview) {
    if (!text) {
      return '[Bệnh nhân đã gửi một hình ảnh]';
    }
    return `[Bệnh nhân đã gửi một hình ảnh] ${text}`;
  }

  return text;
}

/**
 * Chuẩn hóa conversation history cho Google Gemini SDK
 * Đảm bảo:
 * 1. Mọi message đều hợp lệ (role 'user' hoặc 'model', text không rỗng).
 * 2. Bắt đầu bằng role 'user' (Gemini bắt buộc).
 * 3. Luân phiên nghiêm ngặt user -> model -> user -> model.
 * 4. Không kết thúc bằng role 'user' (vì tin nhắn user mới nhất sẽ được gửi qua sendMessageStream).
 * 5. Giới hạn dung lượng Sliding Window 3000 ký tự chống tràn token.
 *
 * @param {Array} rawHistory - Mảng history từ client hoặc database
 * @returns {Array<{ role: 'user'|'model', parts: [{ text: string }] }>}
 */
function normalizeGeminiHistory(rawHistory) {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    return [];
  }

  // 1. Lọc và chuẩn hóa cấu trúc thô
  const sanitized = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object') continue;
    if (item.isLocal === true) continue; // bỏ qua optimistic local messages

    const rawRole = item.role || item.sender;
    const role = rawRole === 'user' ? 'user' : 'model';
    const text = extractMessageText(item);

    if (!text) continue;

    // Chặn tool result thô cố tình giả mạo user prompt
    if (text.includes('---DB_RESULT---') && role === 'user') {
      continue;
    }

    sanitized.push({ role, text });
  }

  if (sanitized.length === 0) return [];

  // 2. Gộp các lượt trùng role liên tiếp để đảm bảo tính LUÂN PHIÊN nghiêm ngặt
  const alternated = [];
  for (const msg of sanitized) {
    if (alternated.length === 0) {
      // Chỉ bắt đầu khi gặp tin nhắn đầu tiên của user
      if (msg.role === 'user') {
        alternated.push({ role: msg.role, text: msg.text });
      }
    } else {
      const lastMsg = alternated[alternated.length - 1];
      if (lastMsg.role === msg.role) {
        // Cùng role liên tiếp -> ghép text thay vì để lỗi SDK
        lastMsg.text += '\n' + msg.text;
      } else {
        alternated.push({ role: msg.role, text: msg.text });
      }
    }
  }

  // 3. Nếu history kết thúc bằng 'user', loại bỏ turn cuối đó
  // (Turn user hiện tại sẽ được gửi độc lập qua sendMessageStream)
  while (alternated.length > 0 && alternated[alternated.length - 1].role === 'user') {
    alternated.pop();
  }

  // 4. Áp dụng Sliding Window theo độ dài ký tự (ưu tiên các tin nhắn gần nhất)
  let accumulatedChars = 0;
  const windowed = [];

  for (let i = alternated.length - 1; i >= 0; i--) {
    const item = alternated[i];
    const itemLength = Array.from(item.text).length;
    if (accumulatedChars + itemLength > MAX_HISTORY_CHARS && windowed.length >= 2) {
      break;
    }
    accumulatedChars += itemLength;
    windowed.unshift(item);
  }

  // Đảm bảo sau khi cắt window, message đầu tiên vẫn là 'user'
  while (windowed.length > 0 && windowed[0].role !== 'user') {
    windowed.shift();
  }

  // 5. Định dạng theo schema chuẩn của Gemini SDK
  return windowed.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

module.exports = {
  normalizeGeminiHistory,
  extractMessageText,
  MAX_HISTORY_CHARS,
};
