'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 01 — AI Foundation] Clinical Safety & Prompt Injection Guard
// Runs BEFORE Intent Routing & Model Invocation (Deterministic Layer)
// ═══════════════════════════════════════════════════════════════════════

// ═══ 1. EMERGENCY / RED FLAG CLINICAL TRIAGE RULES ═══
// Các từ khóa & cụm từ cảnh báo tình trạng đe dọa tính mạng
const EMERGENCY_PATTERNS = [
  // Khó thở / Hô hấp nguy cấp
  {
    regex: /(khó\s*thở\s*(dữ\s*dội|nặng|cấp|dồn\s*dập)|nghẹt\s*thở|thở\s*rít|tím\s*tái\s*(môi|mặt)|không\s*thở\s*được)/i,
    category: 'RESPIRATORY_EMERGENCY',
  },
  // Tim mạch / Đau ngực dữ dội / Đột quỵ
  {
    regex: /(đau\s*thắt\s*ngực|đau\s*ngực\s*(dữ\s*dội|dữ|kinh\s*khủng)|đau\s*tim|nhồi\s*máu\s*cơ\s*tim|ép\s*chặt\s*ngực.*(lan|cánh\s*tay|vai)|méo\s*miệng.*(liệt|yếu)|liệt\s*(nửa\s*người|tay\s*chân)|tai\s*biến.*(mạch\s*máu|đột\s*quỵ))/i,
    category: 'CARDIOVASCULAR_EMERGENCY',
  },
  // Mất ý thức / Co giật / Hôn mê
  {
    regex: /(ngất\s*xỉu|bất\s*tỉnh|mất\s*ý\s*thức|hôn\s*mê|co\s*giật\s*(toàn\s*thân|cấp)|sốt\s*cao\s*co\s*giật)/i,
    category: 'NEUROLOGICAL_EMERGENCY',
  },
  // Chảy máu ồ ạt / Xuất huyết nặng
  {
    regex: /(chảy\s*máu\s*(ồ\s*ạt|không\s*cầm|dữ\s*dội|xối\s*xả)|vết\s*thương.*chảy\s*máu|nôn\s*ra\s*máu\s*(nhiều|tươi)|ho\s*ra\s*máu\s*nhiều)/i,
    category: 'HEMORRHAGE_EMERGENCY',
  },
  // Dị ứng phản vệ / Sốc
  {
    regex: /(sốc\s*phản\s*vệ|phù\s*(môi|lưỡi|họng|thanh\s*quản).*khó\s*thở|dị\s*ứng\s*thuốc.*khó\s*thở)/i,
    category: 'ANAPHYLAXIS_EMERGENCY',
  },
  // Ngộ độc / Tự hại
  {
    regex: /(uống\s*nhầm\s*(thuốc\s*trừ\s*sâu|hóa\s*chất|dầu\s*hỏa|thuốc\s*chuột)|ngộ\s*độc\s*(cấp|nặng)|quá\s*liều\s*thuốc|tự\s*tử|uống\s*quá\s*nhiều\s*thuốc)/i,
    category: 'TOXICOLOGY_EMERGENCY',
  },
];

// ═══ 2. PROMPT INJECTION / JAILBREAK PATTERNS ═══
const PROMPT_INJECTION_PATTERNS = [
  /(ignore|disregard|forget)\s*(all\s*)?(previous|prior|above)\s*(instructions|directions|prompts|rules)/i,
  /(reveal|show|display|dump|print)\s*.*(system\s*prompt|system\s*instruction|developer\s*(prompt|rules)|hidden\s*rules|secret)/i,
  /(bỏ\s*qua|quên\s*(hết)?|hủy\s*bỏ)\s*(mọi|tất\s*cả)?\s*(chỉ\s*thị|quy\s*tắc|hướng\s*dẫn|prompt)\s*(trước|cũ)/i,
  /(in\s*ra|hiển\s*thị|cho\s*xem|tiết\s*lộ)\s*(system\s*prompt|chỉ\s*thị\s*hệ\s*thống|lệnh\s*gốc|prompt\s*ẩn)/i,
  /(bypass|circumvent|override)\s*.*(security|restrictions|filters|guardrails|safety)/i,
  /(vượt\s*rào|phá\s*bỏ\s*giới\s*hạn|tắt\s*bảo\s*mật|chế\s*độ\s*jailbreak)/i,
  /(act\s*as\s*(admin|root|system|developer|dan|unfiltered)|đóng\s*vai\s*(quản\s*trị\s*viên|admin))/i,
  /(show|dump|list|give)\s*.*(database|credentials|passwords|env|secret|api\s*key|raw\s*sql)/i,
  /(cho\s*xem|in\s*ra)\s*(mật\s*khẩu|cơ\s*sở\s*dữ\s*liệu|database|api\s*key|biến\s*môi\s*trường)/i,
];

/**
 * Đánh giá tính an toàn của câu hỏi từ người dùng
 * @param {string} text - Nội dung câu hỏi đã làm sạch
 * @returns {{
 *   isSafe: boolean,
 *   isEmergency: boolean,
 *   isPromptInjection: boolean,
 *   category?: string,
 *   responseText?: string
 * }}
 */
function evaluateInputSafety(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return {
      isSafe: true,
      isEmergency: false,
      isPromptInjection: false,
    };
  }

  const cleanText = text.trim();

  // 1. Kiểm tra tình trạng y tế khẩn cấp (Ưu tiên số 1)
  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.regex.test(cleanText)) {
      return {
        isSafe: false,
        isEmergency: true,
        isPromptInjection: false,
        category: pattern.category,
        responseText:
          '🚨 **[CẢNH BÁO Y TẾ KHẨN CẤP / MEDICAL EMERGENCY]**\n\n' +
          'Các dấu hiệu bạn vừa mô tả có thể là biểu hiện của **tình trạng nguy kịch đe dọa tính mạng**.\n\n' +
          '• **HÀNH ĐỘNG NGAY:** Hãy **GỌI NGAY CẤP CỨU 115** hoặc nhờ người thân đưa bạn đến **KHOA CẤP CỨU CỦA BỆNH VIỆN GẦN NHẤT** lập tức.\n' +
          '• **LƯU Ý QUAN TRỌNG:** Tuyệt đối **KHÔNG CHỜ ĐỢI** đặt lịch hẹn khám trực tuyến và **KHÔNG TỰ Ý ĐIỀU TRỊ** tại nhà trong tình huống khẩn cấp này!',
      };
    }
  }

  // 2. Kiểm tra Prompt Injection / Jailbreak
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(cleanText)) {
      return {
        isSafe: false,
        isEmergency: false,
        isPromptInjection: true,
        category: 'PROMPT_INJECTION_DETECTED',
        responseText:
          'Dạ, em là Trợ lý AI của nền tảng Y tế BookingCare. Em chỉ hỗ trợ thông tin y tế thường thức, tra cứu bác sĩ, chuyên khoa, phòng khám và hướng dẫn quy trình đặt lịch theo đúng quy định bảo mật của hệ thống ạ.',
      };
    }
  }

  return {
    isSafe: true,
    isEmergency: false,
    isPromptInjection: false,
  };
}

function checkMedicalEmergency(text) {
  const res = evaluateInputSafety(text);
  return {
    isEmergency: res.isEmergency,
    category: res.category,
    matchedKeyword: res.category,
    response: res.responseText || '',
  };
}

function checkPromptInjection(text) {
  const res = evaluateInputSafety(text);
  return {
    isInjection: res.isPromptInjection,
    matchedPattern: res.category,
    response: res.responseText || '',
  };
}

module.exports = {
  evaluateInputSafety,
  checkMedicalEmergency,
  checkPromptInjection,
  EMERGENCY_PATTERNS,
  PROMPT_INJECTION_PATTERNS,
};
