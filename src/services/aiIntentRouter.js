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
  WALLET_TRANSACTIONS_QUERY: 'WALLET_TRANSACTIONS_QUERY',
  FAMILY_QUERY: 'FAMILY_QUERY',
  BOOKING_FOR_FAMILY: 'BOOKING_FOR_FAMILY',
  BOOKING_QUERY: 'BOOKING_QUERY',
  CANCEL_BOOKING_QUERY: 'CANCEL_BOOKING_QUERY',
  RESCHEDULE_QUERY: 'RESCHEDULE_QUERY',
  PAYMENT_QUERY: 'PAYMENT_QUERY',
  MY_BOOKING_QUERY: 'MY_BOOKING_QUERY',
  APPOINTMENT_DETAIL_QUERY: 'APPOINTMENT_DETAIL_QUERY',
  NOTIFICATION_QUERY: 'NOTIFICATION_QUERY',
  SLOT_QUERY: 'SLOT_QUERY',
  HEALTH_ASSESSMENT_FOLLOW_UP: 'HEALTH_ASSESSMENT_FOLLOW_UP',
  DOCTOR_QUERY: 'DOCTOR_QUERY',
  SPECIALTY_QUERY: 'SPECIALTY_QUERY',
  CLINIC_QUERY: 'CLINIC_QUERY',
  HEALTH_QUERY: 'HEALTH_QUERY',
  POLICY_QUERY: 'POLICY_QUERY',
  GENERAL_QUERY: 'GENERAL_QUERY',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Phân loại ý định người dùng dựa trên phân tích từ khóa và mẫu câu ngữ nghĩa
 * @param {string|Object} input - Câu hỏi đã được làm sạch hoặc payload ngữ cảnh
 * @param {boolean} [hasImageArg=false] - Cờ xác định có đính kèm ảnh hay không
 * @returns {{ intent: string, confidence: number, extractedEntities: Object }}
 */
function classifyIntent(input, hasImageArg = false) {
  // 0. PRIORITY 0: Structured Health Assessment Follow-Up (P0)
  // Ưu tiên cao nhất khi người dùng click lựa chọn hoặc gửi câu trả lời làm rõ
  if (typeof input === 'object' && input !== null) {
    if (input.isFollowUp || input.followUpPayload || (input.assessmentId && input.questionId)) {
      const payload = input.followUpPayload || input;
      return {
        intent: INTENTS.HEALTH_ASSESSMENT_FOLLOW_UP,
        confidence: 1.0,
        extractedEntities: {
          assessmentId: payload.assessmentId || input.assessmentId,
          questionId: payload.questionId || input.questionId,
          optionId: payload.optionId || input.optionId,
          value: payload.value !== undefined ? payload.value : input.value,
          answerText: payload.text || payload.message || input.text || input.message || '',
        },
      };
    }

    // PRIORITY 0B: Structured Family Member Booking Action (BUG-11)
    if (input.action === 'BOOK_FOR_FAMILY_MEMBER' || input.followUpPayload?.action === 'BOOK_FOR_FAMILY_MEMBER') {
      const mem = input.selectedFamilyMember || input.followUpPayload?.selectedFamilyMember || {};
      const targetName = input.memberName || mem.fullName || input.targetName || '';
      return {
        intent: INTENTS.BOOKING_FOR_FAMILY,
        confidence: 1.0,
        extractedEntities: {
          action: 'BOOK_FOR_FAMILY_MEMBER',
          bookingFor: 'FAMILY',
          familyMemberId: input.familyMemberId || mem.id,
          targetName,
          familyMemberName: targetName,
          relationship: input.relationship || mem.relationship,
        },
      };
    }
  }

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

  // Trích xuất mã booking nếu có (vd: #BK-787, BK-787, #787, lịch 787)
  const bookingMatch = str.match(/(?:#?bk-?|lịch\s*(?:hẹn|khám)?\s*#?|mã\s*#?|#)(\d+)/i);
  if (bookingMatch) {
    extractedEntities.bookingId = parseInt(bookingMatch[1], 10);
  }

  // 1. SAFETY PRIORITY 1: Cấp cứu y tế (P0)
  if (str) {
    const emergencyCheck = checkMedicalEmergency(str);
    if (emergencyCheck.isEmergency) {
      return { intent: INTENTS.EMERGENCY_QUERY, confidence: 1.0, extractedEntities };
    }

    // 2. SAFETY PRIORITY 2: Prompt Injection / Jailbreak (P1)
    const injectionCheck = checkPromptInjection(str);
    if (injectionCheck.isInjection) {
      return { intent: INTENTS.PROMPT_INJECTION, confidence: 1.0, extractedEntities };
    }
  }

  function stripVietnameseDiacritics(str = '') {
    if (typeof str !== 'string') return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  const lower = str.toLowerCase();
  const stripped = stripVietnameseDiacritics(lower);

  // 3.1. Ý định Phân tích / Đọc hình ảnh theo từ khóa (VISION_QUERY)
  // CHỈ kích hoạt khi người dùng hỏi về ảnh (Case A/C) và KHÔNG PHẢI operational intent đơn thuần (Case B)
  const isImageAnalysisPhrase = (
    /(hình\s*ảnh|bức\s*ảnh|ảnh\s*(này|chụp|đính\s*kèm|gửi)|xem\s*ảnh|đọc\s*(đơn|thuốc|nhãn|kết\s*quả\s*xét\s*nghiệm)|nhìn\s*ảnh|ảnh\s*(có|bị)\s*vấn\s*đề\s*gì)/i.test(lower) ||
    /(hinh\s*anh|buc\s*anh|anh\s*(nay|chup|dinh\s*kem|gui)|xem\s*anh|doc\s*(don|thuoc|nhan|ket\s*qua\s*xet\s*nghiem)|nhin\s*anh|anh\s*(co|bi)\s*van\s*de\s*gi)/i.test(stripped) ||
    (hasImage && /(xem\s*giúp|đây\s*là\s*gì|bị\s*sao|bị\s*gì|vết|mẩn|ban|sưng|đỏ|mụn|da|tổn\s*thương|đơn\s*thuốc|kết\s*quả)/i.test(lower))
  );

  const isImageAssistedDoctorSearch = /(xem\s*ảnh.*tìm\s*bác\s*sĩ|ảnh\s*này.*tìm\s*(bác\s*sĩ|chuyên\s*khoa)|dựa\s*vào\s*ảnh.*(tìm|khám)|từ\s*ảnh.*tìm)/i.test(lower);
  const isPureOperationalQuery = /(tìm\s*(bác\s*sĩ|bs|doctor)|tìm\s*chuyên\s*khoa|chuyên\s*khoa\s*(thần\s*kinh|tim\s*mạch|da\s*liễu|tiêu\s*hóa|cơ\s*xương|tai\s*mũi|mắt)|hủy\s*lịch|đổi\s*lịch|xem\s*lịch|chi\s*tiết\s*lịch|danh\s*sách\s*lịch|lịch\s*(khám|hẹn)\s*của\s*tôi|thêm\s*người\s*thân|danh\s*sách\s*người\s*thân|số\s*dư|ví|thanh\s*toán)/i.test(lower);

  if ((isImageAnalysisPhrase || isImageAssistedDoctorSearch) && (!isPureOperationalQuery || isImageAssistedDoctorSearch)) {
    return { intent: INTENTS.VISION_QUERY, confidence: 0.9, extractedEntities };
  }

  // 3.2. Ý định Lịch sử giao dịch ví (WALLET_TRANSACTIONS_QUERY)
  if (
    /(lịch\s*sử\s*(giao\s*dịch|ví)|biến\s*động\s*số\s*dư|giao\s*dịch\s*(gần\s*(đây|nhất)|ví)|tiền\s*(trừ|cộng)\s*(từ|vào)\s*ví|lịch\s*sử\s*nạp)/i.test(lower) ||
    /(lich\s*su\s*(giao\s*dich|vi)|bien\s*dong\s*so\s*du|giao\s*dich\s*(gan\s*(day|nhat)|vi)|tien\s*(tru|cong)\s*(tu|vao)\s*vi|lich\s*su\s*nap)/i.test(stripped)
  ) {
    return { intent: INTENTS.WALLET_TRANSACTIONS_QUERY, confidence: 0.95, extractedEntities };
  }

  // 3.3. Ý định Tài chính / Ví điện tử (WALLET_QUERY)
  if (
    /(ví\s*(của\s*tôi|tiền|điện\s*tử)?|số\s*dư(\s*ví)?|tiền\s*trong\s*ví|nạp\s*tiền\s*ví|ví\s*còn\s*bao\s*nhiêu)/i.test(lower) ||
    /(vi\s*(cua\s*toi|tien|dien\s*tu)?|so\s*du(\s*vi)?|tien\s*trong\s*vi|nap\s*tien\s*vi|vi\s*con\s*bao\s*nhieu)/i.test(stripped)
  ) {
    return { intent: INTENTS.WALLET_QUERY, confidence: 0.95, extractedEntities };
  }

  // --- Helper to extract family relationship ---
  function extractFamilyRelationship(str = '', stripped = '') {
    const l = ` ${str.toLowerCase()} `;
    if (/(?:^|\s|[.,?!])(mẹ|mẹ\s*mình|mẹ\s*tôi|mẹ\s*đẻ|má|u|me)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'PARENT', role: 'Mẹ', raw: 'mẹ' };
    if (/(?:^|\s|[.,?!])(bố|bố\s*mình|bố\s*tôi|bố\s*đẻ|ba|cha|tía|bo)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'PARENT', role: 'Bố', raw: 'bố' };
    if (/(?:^|\s|[.,?!])(con|con\s*tôi|con\s*mình|con\s*gái|con\s*trai|bé|em\s*bé)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'CHILD', role: 'Con', raw: 'con' };
    if (/(?:^|\s|[.,?!])(vợ|vợ\s*tôi|vợ\s*mình|bà\s*xã|vo)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'SPOUSE', role: 'Vợ', raw: 'vợ' };
    if (/(?:^|\s|[.,?!])(chồng|chồng\s*tôi|chồng\s*mình|ông\s*xã|chong)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'SPOUSE', role: 'Chồng', raw: 'chồng' };
    if (/(?:^|\s|[.,?!])(ông|ông\s*nội|ông\s*ngoại|ong)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'OTHER', role: 'Ông', raw: 'ông' };
    if (/(?:^|\s|[.,?!])(bà|bà\s*nội|bà\s*ngoại)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'OTHER', role: 'Bà', raw: 'bà' };
    if (/(?:^|\s|[.,?!])(anh|chị|anh\s*trai|chị\s*gái|em\s*gái|em\s*trai)(?:$|\s|[.,?!])/i.test(l)) return { relationship: 'SIBLING', role: 'Anh/Chị/Em', raw: 'anh/chị/em' };
    return null;
  }

  // 3.4. Ý định Tra cứu lịch sử khám của người thân (BUG-10)
  // "Xem lịch sử khám của mẹ tôi", "Lịch sử khám của bố tôi", "Cho tôi xem các lịch khám của Nguyễn Thị Bé", "Lịch sử khám của người thân này"
  const isFamilyHistoryPattern = (
    /(lịch\s*sử(\s*(đặt\s*)?khám|\s*(các\s*)?lịch\s*(hẹn|khám))?|các\s*lịch\s*khám|xem\s*lịch\s*sử|xem\s*(các\s*)?lịch\s*(khám|hẹn))\s*(của|cho)\s*(mẹ|bố|ba|cha|tía|má|con|vợ|chồng|bé|người\s*thân(\s*này)?|anh|chị|bà|ông)/i.test(lower) ||
    /(lịch\s*(hẹn|khám)\s*của\s*(mẹ|bố|ba|cha|tía|má|con|vợ|chồng|bé|người\s*thân(\s*này)?|anh|chị|bà|ông))/i.test(lower) ||
    /(cho\s*tôi\s*xem\s*(các\s*)?lịch\s*khám\s*của\s+(?!tôi|bản\s*thân|mình)[a-zà-ỹ\s]+)/i.test(lower) ||
    /(lịch\s*sử\s*khám\s*của\s*người\s*thân(\s*này)?)/i.test(lower)
  ) && !/(của\s*(tôi|bản\s*thân|chính\s*tôi)|cua\s*(toi|ban\s*than))/i.test(lower);

  if (isFamilyHistoryPattern && !/(hủy\s*lịch|muốn\s*hủy|đổi\s*lịch)/i.test(lower)) {
    const relInfo = extractFamilyRelationship(lower, stripped);
    extractedEntities.bookingFor = 'FAMILY';
    extractedEntities.isFamilyHistory = true;
    if (relInfo) {
      extractedEntities.relationship = relInfo.relationship;
      extractedEntities.targetRaw = relInfo.raw;
    }
    const nameMatch = lower.match(/(?:lịch\s*(?:sử\s*)?(?:khám|hẹn)\s*của|các\s*lịch\s*khám\s*của)\s+([a-zà-ỹ\s]{2,40})/i);
    if (nameMatch) {
      const candidate = nameMatch[1].trim();
      if (!/(mẹ|bố|con|vợ|chồng|tôi|mình|người\s*thân)/i.test(candidate)) {
        extractedEntities.familyMemberName = candidate;
      }
    }
    if (/người\s*thân\s*này/i.test(lower)) {
      extractedEntities.useActiveFamilyMember = true;
    }
    return { intent: INTENTS.MY_BOOKING_QUERY, confidence: 0.95, extractedEntities };
  }

  // 3.5. Chuyển đổi đối tượng đặt lịch về Bản thân
  if (/(đặt\s*cho\s*(bản\s*thân|tôi|chính\s*tôi)|đổi\s*sang\s*đặt\s*cho\s*(tôi|bản\s*thân))/i.test(lower)) {
    extractedEntities.bookingFor = 'SELF';
    extractedEntities.action = 'SWITCH_TO_SELF';
    return { intent: INTENTS.BOOKING_QUERY, confidence: 0.95, extractedEntities };
  }

  // 3.6. Ý định Đặt lịch cho người thân có đối tượng cụ thể (BUG-08 & BUG-11)
  // "Mình muốn đặt lịch cho mẹ mình", "đặt cho bố", "đặt lịch cho con tôi", "đặt cho bé", "đặt lịch cho mẹ", "đặt lịch cho Nguyễn Thị Bé", "Đặt lịch khám cho nguyễn thị bé"
  const isSpecificFamilyBooking = (
    /(?:muốn\s*)?đặt\s*(?:lịch\s*)?(?:khám\s*)?(?:hẹn\s*)?(?:bác\s*sĩ\s*)?cho\s+(mẹ|bố|ba|cha|con|vợ|chồng|bé|anh|chị|em|bà|ông|[a-zà-ỹ\s]+)/i.test(lower) ||
    /(?:dat|muon\s*dat)\s*(?:lich\s*)?(?:kham\s*)?(?:hen\s*)?(?:bac\s*si\s*)?cho\s+(me|bo|ba|cha|con|vo|chong|be|[a-z\s]+)/i.test(stripped) ||
    /(?:đổi|chuyển)\s*(?:sang\s*)?đặt\s*(?:lịch\s*)?(?:khám\s*)?cho\s+(mẹ|bố|ba|cha|con|vợ|chồng|bé|[a-zà-ỹ\s]+)/i.test(lower)
  );

  // 4. Ý định Người thân / Hồ sơ gia đình (FAMILY_QUERY — Chung chung hoặc Thêm/Sửa/Xem sổ y bạ)
  const isFamilyProfileInput = (
    /(ngày\s*sinh|ngay\s*sinh|\b(19\d\d|20\d\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b)/i.test(lower) &&
    /(con|bố|mẹ|vợ|chồng|cha|mẹ\s*đẻ|bố\s*đẻ|anh|chị|em|ông|bà|bo|me|vo|chong)/i.test(lower) &&
    /(0\d{9,10}|\b(nam|nữ|nu)\b)/i.test(lower)
  ) || (
    /(tiền\s*sử|dị\s*ứng|ghi\s*chú)/i.test(lower) &&
    /(ngày\s*sinh|con|bố|mẹ|vợ|chồng|0\d{9})/i.test(lower)
  );

  const isGenericFamilyQuery = (
    /(đặt\s*(?:lịch\s*)?(?:khám\s*)?cho\s*(?:người\s*thân|người\s*nhà|gia\s*đình)|hồ\s*sơ\s*gia\s*đình|danh\s*sách\s*người\s*thân|sổ\s*y\s*bạ|xem\s*sổ\s*y\s*bạ|thêm\s*người\s*thân|tạo\s*hồ\s*sơ\s*người\s*thân|đăng\s*ký\s*người\s*thân)/i.test(lower) ||
    /(dat\s*(?:lich\s*)?(?:kham\s*)?cho\s*(?:nguoi\s*than|nguoi\s*nha|gia\s*dinh)|ho\s*so\s*gia\s*dinh|danh\s*sach\s*nguoi\s*than|so\s*y\s*ba|them\s*nguoi\s*than|tao\s*ho\s*so\s*nguoi\s*than|dang\s*ky\s*nguoi\s*than)/i.test(stripped) ||
    isFamilyProfileInput
  );

  if (isSpecificFamilyBooking && !isGenericFamilyQuery) {
    const relInfo = extractFamilyRelationship(lower, stripped);
    extractedEntities.bookingFor = 'FAMILY';
    if (relInfo) {
      extractedEntities.relationship = relInfo.relationship;
      extractedEntities.targetRaw = relInfo.raw;
    }
    const forNameMatch = lower.match(/(?:đặt|dat)\s*(?:lịch\s*)?(?:khám\s*)?(?:hẹn\s*)?(?:bác\s*sĩ\s*)?cho\s+([a-zà-ỹ\s]{2,40})/i);
    if (forNameMatch) {
      const candidate = forNameMatch[1].trim();
      if (!/(mẹ|bố|con|vợ|chồng|người\s*thân|người\s*nhà|gia\s*đình|tôi|bản\s*thân|mình)/i.test(candidate)) {
        extractedEntities.targetName = candidate;
        extractedEntities.familyMemberName = candidate;
      }
    }
    if (/(đổi|chuyển)\s*(?:sang\s*)?đặt\s*cho/i.test(lower)) {
      extractedEntities.action = 'SWITCH_TARGET';
    }
    return { intent: INTENTS.BOOKING_FOR_FAMILY, confidence: 0.95, extractedEntities };
  }

  if (isGenericFamilyQuery) {
    return { intent: INTENTS.FAMILY_QUERY, confidence: 0.95, extractedEntities };
  }

  // 4.1. Ý định Thông báo cá nhân (NOTIFICATION_QUERY)
  if (
    /(thông\s*báo(\s*của\s*tôi|\s*mới)?|có\s*thông\s*báo\s*gì|bao\s*nhiêu\s*thông\s*báo(\s*chưa\s*đọc)?|tin\s*nhắn\s*hệ\s*thống)/i.test(lower) ||
    /(thong\s*bao(\s*cua\s*toi|\s*moi)?|co\s*thong\s*bao\s*gi|bao\s*nhieu\s*thong\s*bao(\s*chua\s*doc)?|tin\s*nhan\s*he\s*thong)/i.test(stripped)
  ) {
    return { intent: INTENTS.NOTIFICATION_QUERY, confidence: 0.95, extractedEntities };
  }

  // 5. Ý định Hỏi chính sách / Quy chế hoàn tiền / No-Show (POLICY_QUERY)
  // Ưu tiên cao hơn để không bao giờ nhầm câu hỏi chính sách/thông tin với yêu cầu hủy lịch.
  // Tuyệt đối không coi từ khóa "no-show", "vắng mặt", "quên đi khám" là bằng chứng muốn hủy lịch!
  const isInformationalPolicyQuery = (
    /(chính\s*sách|quy\s*định|điều\s*khoản|quy\s*chế|hướng\s*dẫn\s*chính\s*sách)/i.test(lower) ||
    /(chinh\s*sach|quy\s*dinh|dieu\s*khoan|quy\s*che)/i.test(stripped) ||
    (
      /(thế\s*nào|như\s*thế\s*nào|ra\s*sao|bao\s*nhiêu(\s*%)?|bao\s*nhiêu\s*phần\s*trăm|được\s*không|có\s*được\s*(hoàn|trả)|mất\s*phí|phí\s*phạt|tính\s*sao)/i.test(lower) &&
      /(hoàn\s*tiền|hủy\s*lịch|đổi\s*lịch|vắng\s*mặt|no-?show|quên\s*(không\s*)?(đi\s*)?khám|lỡ\s*(hẹn|giờ)|bỏ\s*khám)/i.test(lower)
    ) ||
    (
      /(the\s*nao|nhu\s*the\s*nao|ra\s*sao|bao\s*nhieu|co\s*duoc\s*(hoan|tra)|mat\s*phi|phi\s*phat|tinh\s*sao)/i.test(stripped) &&
      /(hoan\s*tien|huy\s*lich|doi\s*lich|vang\s*mat|no-?show|quen.*kham|lo\s*hen|bo\s*kham)/i.test(stripped)
    ) ||
    /nếu.*(quên|không\s*đến|vắng|bận|lỡ).*(có\s*được\s*hoàn|hoàn\s*tiền|thế\s*nào|ra\s*sao|sao)/i.test(lower) ||
    /neu.*(quen|khong\s*den|vang|ban|lo).*(co\s*duoc\s*hoan|hoan\s*tien|the\s*nao|ra\s*sao|sao)/i.test(stripped) ||
    /((vắng\s*mặt|no-?show|quên\s*(không\s*)?(đi\s*)?khám).*(xử\s*lý\s*thế\s*nào|tính\s*sao|như\s*thế\s*nào|hoàn\s*tiền\s*thế\s*nào))/i.test(lower) ||
    /((vang\s*mat|no-?show|quen.*kham).*(xu\s*ly\s*the\s*nao|tinh\s*sao|nhu\s*the\s*nao|hoan\s*tien\s*the\s*nao))/i.test(stripped)
  );

  if (isInformationalPolicyQuery && !/(tôi\s*muốn\s*hủy|muốn\s*hủy|hủy\s*lịch\s*(này|giúp|cho|mã|#))/i.test(lower)) {
    return { intent: INTENTS.POLICY_QUERY, confidence: 0.95, extractedEntities };
  }

  // 6. Ý định Tra cứu lịch hẹn cá nhân (MY_BOOKING_QUERY)
  // Ưu tiên tra cứu lịch khi người dùng hỏi danh sách, trạng thái các lịch khám (kể cả lịch No-Show)
  const isMyBookingQuery = (
    /(lịch\s*sử(\s*(đặt\s*)?khám|\s*(các\s*)?cuộc\s*hẹn|\s*(các\s*)?lịch\s*(hẹn|khám))?(\s*của\s*tôi)?|xem\s*lịch\s*sử(\s*(đặt\s*)?(khám|lịch))?|lịch\s*(hẹn|khám)?\s*của\s*tôi|xem\s*lịch\s*(hẹn|khám)?(\s*của\s*tôi|\s*hôm\s*nay)?|tôi\s*đã\s*(đặt|khám)(\s*những)?\s*(lịch|lần|ca)?(\s*khám)?\s*nào|trạng\s*thái\s*lịch|thanh\s*toán\s*lịch\s*hẹn\s*của\s*tôi|lịch\s*sắp\s*tới(\s*của\s*tôi)?|lịch\s*(khám|hẹn)?\s*(hôm\s*nay|ngày\s*mai)|(các\s*)?lịch\s*(hẹn|khám)\s*trước\s*đây(\s*của\s*tôi)?|lịch\s*đã\s*khám|đã\s*khám\s*bác\s*sĩ\s*nào|khám\s*chuyên\s*khoa.*mấy\s*lần|có\s*lịch\s*(nào|gì)(\s*(đã|bị)?\s*(no-?show|vắng\s*mặt|hủy))?|kiểm\s*tra\s*lịch\s*(khám|hẹn)?(\s*của\s*tôi)?)/i.test(lower) ||
    /(lich\s*su(\s*(dat\s*)?kham|\s*(cac\s*)?cuoc\s*hen|\s*(cac\s*)?lich\s*(hen|kham))?(\s*cua\s*toi)?|xem\s*lich\s*su(\s*(dat\s*)?(kham|lich))?|lich\s*(hen|kham)?\s*cua\s*toi|xem\s*lich\s*(hen|kham)?(\s*cua\s*toi|\s*hom\s*nay)?|toi\s*da\s*(dat|kham)(\s*nhung)?\s*(lich|lan|ca)?(\s*kham)?\s*nao|trang\s*thai\s*lich|thanh\s*toan\s*lich\s*hen\s*cua\s*toi|lich\s*sap\s*toi(\s*cua\s*toi)?|lich\s*(kham|hen)?\s*(hom\s*nay|ngay\s*mai)|(cac\s*)?lich\s*(hen|kham)\s*truoc\s*day(\s*cua\s*toi)?|lich\s*da\s*kham|da\s*kham\s*bac\s*si\s*nao|kham\s*chuyen\s*khoa.*may\s*lan|co\s*lich\s*(nao|gi)|kiem\s*tra\s*lich)/i.test(stripped)
  );

  if (isMyBookingQuery && !/(hủy\s*lịch|muốn\s*hủy|đổi\s*lịch)/i.test(lower)) {
    return { intent: INTENTS.MY_BOOKING_QUERY, confidence: 0.9, extractedEntities };
  }

  // 7. Ý định Hủy lịch hẹn (CANCEL_BOOKING_QUERY)
  // CHỈ kích hoạt khi người dùng THỰC SỰ YÊU CẦU HÀNH ĐỘNG HỦY.
  // Tuyệt đối KHÔNG coi từ khóa "no-show", "vắng mặt", "quên đi khám" là bằng chứng để hủy lịch!
  const isExplicitCancelRequest = (
    /(tôi\s*)?(muốn\s*)?hủy\s*(lịch(\s*hẹn|\s*khám)?|ca\s*khám|hẹn|booking)/i.test(lower) ||
    /(hủy\s*(lịch|ca\s*khám|hẹn|booking)\s*(này|giúp|cho|mã|#))/i.test(lower) ||
    /(thôi\s*(hủy|không\s*khám(\s*nữa)?)|không\s*(muốn\s*)?(đi\s*)?khám(\s*nữa)?)/i.test(lower) ||
    /(toi\s*)?(muon\s*)?huy\s*(lich(\s*hen|\s*kham)?|ca\s*kham|hen|booking)/i.test(stripped) ||
    /(huy\s*(lich|ca\s*kham|hen|booking)\s*(nay|giup|cho|ma|#))/i.test(stripped) ||
    /(thoi\s*(huy|khong\s*kham(\s*nua)?)|khong\s*(muon\s*)?(di\s*)?kham(\s*nua)?)/i.test(stripped)
  );

  if (isExplicitCancelRequest && !isInformationalPolicyQuery) {
    return { intent: INTENTS.CANCEL_BOOKING_QUERY, confidence: 0.95, extractedEntities };
  }

  // 8. Ý định Đổi lịch hẹn (RESCHEDULE_QUERY)
  if (
    /(đổi\s*(lịch(\s*hẹn|\s*khám)?|ngày(\s*khám|\s*khác|\s*mai)?|giờ)|dời\s*(lịch|ngày)|chuyển\s*(ngày|lịch)\s*khám|đổi\s*sang\s*ngày\s*mai)/i.test(lower) ||
    /(doi\s*(lich(\s*hen|\s*kham)?|ngay(\s*kham|\s*khac|\s*mai)?|gio)|doi\s*sang\s*ngay\s*mai|doi\s*lich|doi\s*ngay|doi\s*gio|doi\s*ca|doi\s*khung\s*gio|chuyen\s*(ngay|lich)\s*kham)/i.test(stripped)
  ) {
    return { intent: INTENTS.RESCHEDULE_QUERY, confidence: 0.9, extractedEntities };
  }

  // 8.1. Ý định Thanh toán / Trạng thái thanh toán (PAYMENT_QUERY)
  if (
    /(thanh\s*toán|trả\s*tiền|link\s*thanh\s*toán|đã\s*thanh\s*toán\s*chưa|còn\s*phải\s*thanh\s*toán|vnpay|cổng\s*thanh\s*toán)/i.test(lower) ||
    /(thanh\s*toan|tra\s*tien|link\s*thanh\s*toan|da\s*thanh\s*toan\s*chua|con\s*phai\s*thanh\s*toan|vnpay|cong\s*thanh\s*toan)/i.test(stripped)
  ) {
    return { intent: INTENTS.PAYMENT_QUERY, confidence: 0.95, extractedEntities };
  }

  // 9. Ý định Đặt lịch khám (BOOKING_QUERY)
  // Ưu tiên cao hơn SLOT_QUERY khi người dùng nói rõ hành động "đặt / book / tạo lịch"
  if (
    (/(đặt(\s*cho\s*tôi|\s*giúp|\s*hộ)?\s*(lịch(\s*khám|\s*hẹn)?|bác\s*sĩ)?|tạo\s*lịch\s*hẹn|hẹn\s*khám\s*bác\s*sĩ|book\s*(lịch|doctor))/i.test(lower) ||
     /(dat(\s*cho\s*toi|\s*giup|\s*ho)?\s*(lich(\s*kham|\s*hen)?|bac\s*si)?|tao\s*lich\s*hen|hen\s*kham\s*bac\s*si|book\s*(lich|doctor))/i.test(stripped)) &&
    !/(hướng\s*dẫn|cách|quy\s*trình|huong\s*dan|cach|quy\s*trinh)/i.test(lower)
  ) {
    return { intent: INTENTS.BOOKING_QUERY, confidence: 0.85, extractedEntities };
  }

  // 9.1. Ý định Chi tiết lịch khám (APPOINTMENT_DETAIL_QUERY)
  if (
    /(chi\s*tiết\s*(lịch|ca\s*khám|cuộc\s*hẹn)|xem\s*(thông\s*tin\s*)?chi\s*tiết\s*lịch|đơn\s*thuốc\s*(lịch\s*khám|sau\s*khám)?|tài\s*liệu\s*(đính\s*kèm\s*lịch|y\s*tế))/i.test(lower) ||
    /(chi\s*tiet\s*(lich|ca\s*kham|cuoc\s*hen)|xem\s*(thong\s*tin\s*)?chi\s*tiet\s*lich|don\s*thuoc\s*(lich\s*kham|sau\s*kham)?|tai\s*lieu\s*(dinh\s*kem\s*lich|y\s*te))/i.test(stripped)
  ) {
    return { intent: INTENTS.APPOINTMENT_DETAIL_QUERY, confidence: 0.95, extractedEntities };
  }

  // 9. Ý định Tra cứu khung giờ trống (SLOT_QUERY)
  if (
    /(lịch\s*(trống|khám|làm\s*việc)|khung\s*giờ\s*(trống|khám)|còn\s*(lịch|slot|chỗ|giờ)|slot\s*(nào|trống)|xem\s*lịch|buổi\s*(sáng|chiều)|khám\s*(buổi\s*)?(sáng|chiều)|giờ\s*nào\s*khám|còn\s*giờ\s*khám|ngày\s*mai.*lúc\s*\d+h)/i.test(lower) ||
    /(lich\s*(trong|kham|lam\s*viec)|khung\s*gio\s*(trong|kham)|con\s*(lich|slot|cho|gio)|slot\s*(nao|trong)|xem\s*lich|buoi\s*(sang|chieu)|kham\s*(buoi\s*)?(sang|chieu)|gio\s*nao\s*kham|con\s*gio\s*kham)/i.test(stripped)
  ) {
    return { intent: INTENTS.SLOT_QUERY, confidence: 0.85, extractedEntities };
  }

  // 10. Ý định Tra cứu Bác sĩ / Đánh giá (DOCTOR_QUERY)
  const isDoctorHonorificPrefix = /^(chào\s*)?(bác\s*sĩ|bs)\s*(ơi|ạ|cho\s*hỏi|xem\s*giúp|tư\s*vấn\s*giúp)/i.test(lower);
  if (
    !isDoctorHonorificPrefix && (
      /(tìm\s*(bác\s*sĩ|bs|doctor)|danh\s*sách\s*bác\s*sĩ|gặp\s*(bác\s*sĩ|bs)|(có\s*)?bác\s*sĩ\s*nào|bác\s*sĩ\s*(giỏi|nổi\s*tiếng|nào\s*tốt|chuyên\s*khoa)|đánh\s*giá\s*bác\s*sĩ|review\s*bác\s*sĩ|giá\s*khám\s*bác\s*sĩ|khám\s*bác\s*sĩ\b|khám\s*ai|ai\s*khám|chuyên\s*gia\s*nào|giới\s*thiệu\s*bác\s*sĩ|tiến\s*sĩ|thạc\s*sĩ|giáo\s*sư)/i.test(lower) ||
      /(tim\s*(bac\s*si|bs|doctor)|danh\s*sach\s*bac\s*si|gap\s*(bac\s*si|bs)|(co\s*)?bac\s*si\s*nao|bac\s*si\s*(gioi|noi\s*tieng|nao\s*tot|chuyen\s*khoa)|danh\s*gia\s*bac\s*si|review\s*bac\s*si|gia\s*kham\s*bac\s*si|kham\s*bac\s*si\b|kham\s*ai|ai\s*kham|chuyen\s*gia\s*nao|gioi\s*thieu\s*bac\s*si|tien\s*si|thac\s*si|giao\s*su)/i.test(stripped)
    )
  ) {
    return { intent: INTENTS.DOCTOR_QUERY, confidence: 0.85, extractedEntities };
  }

  // 11. Ý định Tra cứu Chuyên khoa (SPECIALTY_QUERY)
  if (
    /(chuyên\s*khoa|khoa\s*(tim\s*mạch|tiêu\s*hóa|cơ\s*xương|da\s*liễu|thần\s*kinh|mắt|tai\s*mũi\s*họng)|khám\s*khoa\s*nào)/i.test(lower) ||
    /(chuyen\s*khoa|khoa\s*(tim\s*mach|tieu\s*hoa|co\s*xuong|da\s*lieu|than\s*kinh|mat|tai\s*mui\s*hong)|kham\s*khoa\s*nao)/i.test(stripped)
  ) {
    return { intent: INTENTS.SPECIALTY_QUERY, confidence: 0.85, extractedEntities };
  }

  // 12. Ý định Tra cứu Phòng khám / Bệnh viện (CLINIC_QUERY)
  if (
    /(phòng\s*khám|bệnh\s*viện|cơ\s*sở\s*y\s*tế|địa\s*chỉ\s*khám)/i.test(lower) ||
    /(phong\s*kham|benh\s*vien|co\s*so\s*y\s*te|dia\s*chi\s*kham)/i.test(stripped)
  ) {
    return { intent: INTENTS.CLINIC_QUERY, confidence: 0.85, extractedEntities };
  }

  // 13. Ý định Tư vấn Triệu chứng / Y tế (HEALTH_QUERY)
  // Loại bỏ các cụm phủ định như 'không có tiền sử bệnh', 'không dị ứng thuốc' trước khi kiểm tra triệu chứng
  const cleanedSymptomsText = lower
    .replace(/không\s*(có)?\s*(tiền\s*sử)?\s*bệnh\b/gi, '')
    .replace(/không\s*dị\s*ứng\b/gi, '')
    .replace(/không\s*(có)?\s*thuốc\b/gi, '')
    .replace(/không\s*(có)?\s*triệu\s*chứng\b/gi, '');
  const cleanedSymptomsStripped = stripped
    .replace(/khong\s*(co)?\s*(tien\s*su)?\s*benh\b/gi, '')
    .replace(/khong\s*di\s*ung\b/gi, '')
    .replace(/khong\s*(co)?\s*thuoc\b/gi, '')
    .replace(/khong\s*(co)?\s*trieu\s*chung\b/gi, '');

  const hoRegex = /(?:^|[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ])ho(?:$|[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ])/i;
  const hoStrippedRegex = /(?:^|[^a-zA-Z0-9])ho(?:$|[^a-zA-Z0-9])/i;
  if (
    /(triệu\s*chứng|bệnh|đau|sốt|viêm|ngứa|chóng\s*mặt|buồn\s*nôn|uống\s*thuốc|thuốc\s*gì)/i.test(cleanedSymptomsText) ||
    hoRegex.test(cleanedSymptomsText) ||
    /(trieu\s*chung|benh|dau|sot|viem|ngua|chong\s*mat|buon\s*non|uong\s*thuoc|thuoc\s*gi)/i.test(cleanedSymptomsStripped) ||
    hoStrippedRegex.test(cleanedSymptomsStripped)
  ) {
    return { intent: INTENTS.HEALTH_QUERY, confidence: 0.8, extractedEntities };
  }

  // 14. Multimodal Vision Intent (Khi có ảnh VÀ KHÔNG PHẢI tác vụ operational / hệ thống)
  if (hasImage) {
    // Nếu có ảnh mà người dùng không nhập văn bản, hoặc câu hỏi hỏi trực tiếp về ảnh / đánh giá sức khỏe
    return { intent: INTENTS.VISION_QUERY, confidence: 0.95, extractedEntities };
  }

  // 15. Chào hỏi / Tổng quan (GENERAL_QUERY)
  if (
    /^(xin\s*chào|chào|hello|hi|bạn\s*là\s*ai|giúp\s*gì|cảm\s*ơn|tạm\s*biệt)$/i.test(lower) ||
    /^(xin\s*chao|chao|hello|hi|ban\s*la\s*ai|giup\s*gi|cam\s*on|tam\s*biet)$/i.test(stripped)
  ) {
    return { intent: INTENTS.GENERAL_QUERY, confidence: 0.95, extractedEntities };
  }

  return { intent: INTENTS.UNKNOWN, confidence: 0.5, extractedEntities };
}

module.exports = {
  classifyIntent,
  INTENTS,
};
