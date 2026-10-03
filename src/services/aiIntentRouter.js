'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 01 — AI Foundation] Deterministic Intent Router
// Classifies user intent into controlled architectural categories
// ═══════════════════════════════════════════════════════════════════════

const { checkMedicalEmergency, checkPromptInjection } = require('./aiSafetyGuard');

const INTENTS = {
  EMERGENCY_QUERY: 'EMERGENCY_QUERY',
  PROMPT_INJECTION: 'PROMPT_INJECTION',
  VISION_QUERY: 'VISION_QUERY',
  WALLET_QUERY: 'WALLET_QUERY',
  FAMILY_QUERY: 'FAMILY_QUERY',
  BOOKING_QUERY: 'BOOKING_QUERY',
  CANCEL_BOOKING_QUERY: 'CANCEL_BOOKING_QUERY',
  RESCHEDULE_QUERY: 'RESCHEDULE_QUERY',
  PAYMENT_QUERY: 'PAYMENT_QUERY',
  MY_BOOKING_QUERY: 'MY_BOOKING_QUERY',
  SLOT_QUERY: 'SLOT_QUERY',
  DOCTOR_QUERY: 'DOCTOR_QUERY',
  SPECIALTY_QUERY: 'SPECIALTY_QUERY',
  CLINIC_QUERY: 'CLINIC_QUERY',
  HEALTH_QUERY: 'HEALTH_QUERY',
  GENERAL_QUERY: 'GENERAL_QUERY',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Phân loại ý định người dùng dựa trên phân tích từ khóa và mẫu câu ngữ nghĩa
 * @param {string} text - Câu hỏi đã được làm sạch
 * @param {boolean} [hasImage=false] - Cờ xác định có đính kèm ảnh hay không
 * @returns {{ intent: string, confidence: number, extractedEntities: Object }}
 */
function classifyIntent(input, hasImageArg = false) {
  let text = '';
  let hasImage = false;

  if (typeof input === 'object' && input !== null) {
    text = input.text || input.message || '';
    hasImage = Boolean(input.hasImage);
  } else {
    text = typeof input === 'string' ? input : '';
    hasImage = Boolean(hasImageArg);
  }

  if (!text.trim() && !hasImage) {
    return { intent: INTENTS.GENERAL_QUERY, confidence: 1.0, extractedEntities: {} };
  }

  const str = text.trim();
  const extractedEntities = {};

  // 1. SAFETY PRIORITY 1: Cấp cứu y tế
  if (str) {
    const emergencyCheck = checkMedicalEmergency(str);
    if (emergencyCheck.isEmergency) {
      return { intent: INTENTS.EMERGENCY_QUERY, confidence: 1.0, extractedEntities };
    }

    // 2. SAFETY PRIORITY 2: Prompt Injection / Jailbreak
    const injectionCheck = checkPromptInjection(str);
    if (injectionCheck.isInjection) {
      return { intent: INTENTS.PROMPT_INJECTION, confidence: 1.0, extractedEntities };
    }
  }

  // 3. Multimodal Vision Intent
  if (hasImage) {
    return { intent: INTENTS.VISION_QUERY, confidence: 0.98, extractedEntities };
  }

  const lower = str.toLowerCase();

  // 3.1. Ý định Phân tích / Đọc hình ảnh theo từ khóa (VISION_QUERY)
  if (/(hình\s*ảnh|bức\s*ảnh|ảnh\s*(này|chụp|đính\s*kèm)|xem\s*ảnh|đọc\s*(đơn|thuốc|nhãn|kết\s*quả\s*xét\s*nghiệm)|nhìn\s*ảnh)/i.test(lower)) {
    return { intent: INTENTS.VISION_QUERY, confidence: 0.9, extractedEntities };
  }

  // 3.2. Ý định Tài chính / Ví điện tử (WALLET_QUERY)
  if (/(ví\s*(của\s*tôi|tiền|điện\s*tử)|số\s*dư(\s*ví)?|tiền\s*trong\s*ví|nạp\s*tiền\s*ví|ví\s*còn\s*bao\s*nhiêu)/i.test(lower)) {
    return { intent: INTENTS.WALLET_QUERY, confidence: 0.95, extractedEntities };
  }

  // 4. Ý định Người thân / Hồ sơ gia đình (FAMILY_QUERY)
  if (/(người\s*thân|hồ\s*sơ\s*gia\s*đình|đặt\s*cho\s*(con|bố|mẹ|vợ|chồng)|danh\s*sách\s*người\s*thân|sổ\s*y\s*bạ)/i.test(lower)) {
    return { intent: INTENTS.FAMILY_QUERY, confidence: 0.9, extractedEntities };
  }

  // 5. Ý định Hủy lịch hẹn (CANCEL_BOOKING_QUERY)
  if (/(hủy\s*lịch(\s*hẹn|\s*khám)?|không\s*khám\s*nữa|hoàn\s*tiền\s*(hủy\s*lịch)?)/i.test(lower)) {
    return { intent: INTENTS.CANCEL_BOOKING_QUERY, confidence: 0.9, extractedEntities };
  }

  // 6. Ý định Đổi lịch hẹn (RESCHEDULE_QUERY)
  if (/(đổi\s*lịch(\s*hẹn|\s*khám)?|dời\s*lịch|chuyển\s*ngày\s*khám|đổi\s*sang\s*ngày\s*khác)/i.test(lower)) {
    return { intent: INTENTS.RESCHEDULE_QUERY, confidence: 0.9, extractedEntities };
  }

  // 6.1. Ý định Thanh toán / Trạng thái thanh toán (PAYMENT_QUERY)
  if (/(thanh\s*toán|trả\s*tiền|link\s*thanh\s*toán|đã\s*thanh\s*toán\s*chưa|còn\s*phải\s*thanh\s*toán|vnpay|cổng\s*thanh\s*toán)/i.test(lower)) {
    return { intent: INTENTS.PAYMENT_QUERY, confidence: 0.95, extractedEntities };
  }

  // 7. Ý định Đặt lịch khám (BOOKING_QUERY)
  // Ưu tiên cao hơn SLOT_QUERY khi người dùng nói rõ hành động "đặt / book / tạo lịch"
  if (/(đặt(\s*cho\s*tôi)?\s*(lịch(\s*khám|\s*hẹn)?|bác\s*sĩ)|tạo\s*lịch\s*hẹn|hẹn\s*khám\s*bác\s*sĩ|book\s*(lịch|doctor))/i.test(lower) &&
      !/(hướng\s*dẫn|cách|quy\s*trình)/i.test(lower)) {
    return { intent: INTENTS.BOOKING_QUERY, confidence: 0.85, extractedEntities };
  }

  // 8. Ý định Tra cứu lịch hẹn cá nhân (MY_BOOKING_QUERY)
  if (/(lịch\s*hẹn\s*của\s*tôi|tôi\s*đã\s*đặt\s*lịch\s*nào|trạng\s*thái\s*lịch|thanh\s*toán\s*lịch\s*hẹn\s*của\s*tôi)/i.test(lower)) {
    return { intent: INTENTS.MY_BOOKING_QUERY, confidence: 0.9, extractedEntities };
  }

  // 9. Ý định Tra cứu khung giờ trống (SLOT_QUERY)
  if (/(lịch\s*(trống|khám|làm\s*việc)|khung\s*giờ\s*(trống|khám)|còn\s*(lịch|slot|chỗ)|slot\s*(nào|trống)|xem\s*lịch|buổi\s*(sáng|chiều)|khám\s*(buổi\s*)?(sáng|chiều)|giờ\s*nào\s*khám|ngày\s*mai.*lúc\s*\d+h)/i.test(lower)) {
    return { intent: INTENTS.SLOT_QUERY, confidence: 0.85, extractedEntities };
  }

  // 10. Ý định Tra cứu Bác sĩ / Đánh giá (DOCTOR_QUERY)
  if (/(bác\s*sĩ|tiến\s*sĩ|thạc\s*sĩ|giáo\s*sư|đánh\s*giá\s*bác\s*sĩ|review\s*bác\s*sĩ|giá\s*khám\s*bác\s*sĩ)/i.test(lower)) {
    return { intent: INTENTS.DOCTOR_QUERY, confidence: 0.85, extractedEntities };
  }

  // 11. Ý định Tra cứu Chuyên khoa (SPECIALTY_QUERY)
  if (/(chuyên\s*khoa|khoa\s*(tim\s*mạch|tiêu\s*hóa|cơ\s*xương|da\s*liễu|thần\s*kinh|mắt|tai\s*mũi\s*họng)|khám\s*khoa\s*nào)/i.test(lower)) {
    return { intent: INTENTS.SPECIALTY_QUERY, confidence: 0.85, extractedEntities };
  }

  // 12. Ý định Tra cứu Phòng khám / Bệnh viện (CLINIC_QUERY)
  if (/(phòng\s*khám|bệnh\s*viện|cơ\s*sở\s*y\s*tế|địa\s*chỉ\s*khám)/i.test(lower)) {
    return { intent: INTENTS.CLINIC_QUERY, confidence: 0.85, extractedEntities };
  }

  // 13. Ý định Tư vấn Triệu chứng / Y tế (HEALTH_QUERY)
  if (/(triệu\s*chứng|bệnh|đau|sốt|ho|viêm|ngứa|chóng\s*mặt|buồn\s*nôn|uống\s*thuốc|thuốc\s*gì)/i.test(lower)) {
    return { intent: INTENTS.HEALTH_QUERY, confidence: 0.8, extractedEntities };
  }

  // 14. Chào hỏi / Tổng quan (GENERAL_QUERY)
  if (/^(xin\s*chào|chào|hello|hi|bạn\s*là\s*ai|giúp\s*gì|cảm\s*ơn|tạm\s*biệt)$/i.test(lower)) {
    return { intent: INTENTS.GENERAL_QUERY, confidence: 0.95, extractedEntities };
  }

  return { intent: INTENTS.UNKNOWN, confidence: 0.5, extractedEntities };
}

module.exports = {
  classifyIntent,
  INTENTS,
};
