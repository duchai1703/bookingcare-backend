'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 07 — RAG / Knowledge Retrieval Service]
// Indexes genuine domain knowledge from database (Specialties, Clinics)
// and authoritative platform policies (Cancellation, Reschedule, Payment).
// Never invents facts or fabricates fake knowledge.
// ═══════════════════════════════════════════════════════════════════════

const db = require('../models');

// In-memory knowledge cache for fast deterministic retrieval
let knowledgeCorpus = [];
let lastCorpusBuildTime = 0;
const CORPUS_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Strips HTML tags and collapses whitespace to create clean plain text
 */
function cleanHtmlText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes Vietnamese text for accent-insensitive search
 */
function normalizeSearchText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Authoritative Static Policy Corpus
 * Derived directly from policyEngineService and booking domain rules
 */
const PLATFORM_POLICIES = Object.freeze([
  {
    documentId: 'doc_pol_cancellation',
    title: 'Chính sách hủy lịch khám và hoàn tiền BookingCare',
    category: 'POLICY',
    source: 'BOOKINGCARE_POLICY_ENGINE',
    version: '1.0.0',
    content: 'Quy định hủy lịch khám tại BookingCare: 1. Hủy trước giờ khám trên 24 giờ: hoàn 100% tiền khám. 2. Hủy trước từ 12 đến 24 giờ: hoàn 70% tiền khám. 3. Hủy trước từ 2 đến 12 giờ: hoàn 50% tiền khám. 4. Hủy trước dưới 2 giờ hoặc sau giờ khám: không hỗ trợ hoàn tiền (0%). Khi hủy thành công, lịch chuyển sang trạng thái S4 và tiền hoàn được trả về phương thức thanh toán ban đầu hoặc ví BookingCare.',
  },
  {
    documentId: 'doc_pol_reschedule',
    title: 'Chính sách đổi lịch khám (Reschedule) BookingCare',
    category: 'POLICY',
    source: 'BOOKINGCARE_POLICY_ENGINE',
    version: '1.0.0',
    content: 'Quy định đổi lịch khám tại BookingCare: Bệnh nhân có thể đổi lịch cho các cuộc hẹn còn hiệu lực ở trạng thái S1 (Chưa thanh toán), S1.5 (Đang chờ VNPay), hoặc S2 (Đã xác nhận). Lịch đã hoàn thành (S3) không thể đổi. Lịch hẹn cũ chuyển sang S4 với lý do RESCHEDULED, tiền đã thanh toán được bảo lưu 100% sang lịch hẹn mới. Lịch đổi yêu cầu tạo bản nháp và xác nhận qua mã bảo mật HMAC duy nhất.',
  },
  {
    documentId: 'doc_pol_payment',
    title: 'Hướng dẫn thanh toán trực tuyến qua cổng VNPay và Ví BookingCare',
    category: 'POLICY',
    source: 'BOOKINGCARE_PAYMENT_GATEWAY',
    version: '1.0.0',
    content: 'Phương thức thanh toán BookingCare: Hệ thống hỗ trợ thanh toán qua cổng VNPay (hỗ trợ QR Pay, thẻ ATM nội địa, thẻ tín dụng Visa/MasterCard) và Ví điện tử BookingCare. Khi đặt lịch S1, liên kết thanh toán có chữ ký bảo mật SHA-512 được cung cấp. Trạng thái chỉ chuyển sang Đã thanh toán (S2) sau khi hệ thống nhận webhook IPN xác thực từ cổng thanh toán.',
  },
  {
    documentId: 'doc_pol_booking_steps',
    title: 'Quy trình 7 bước đặt lịch khám trên BookingCare',
    category: 'GUIDANCE',
    source: 'BOOKINGCARE_PLATFORM_GUIDE',
    version: '1.0.0',
    content: 'Quy trình đặt lịch khám: 1. Tìm chuyên khoa hoặc bác sĩ phù hợp. 2. Chọn ngày và khung giờ khám còn trống. 3. Cung cấp thông tin bệnh nhân. 4. Xem lại bản nháp đặt lịch. 5. Bấm nút xác nhận đặt lịch. 6. Nhận email và thông báo xác nhận kèm mã lịch hẹn. 7. Đến cơ sở y tế đúng giờ hẹn và đọc mã lịch hẹn tại quầy tiếp đón.',
  },
  {
    documentId: 'doc_guidance_emergency',
    title: 'Hướng dẫn an toàn và xử lý tình huống y tế khẩn cấp',
    category: 'GUIDANCE',
    source: 'BOOKINGCARE_SAFETY_STANDARDS',
    version: '1.0.0',
    content: 'Khuyến cáo khẩn cấp: Trợ lý AI BookingCare KHÔNG thay thế bác sĩ khám cấp cứu. Khi gặp các triệu chứng nguy hiểm tính mạng như đau ngực dữ dội, khó thở cấp tính, mất ý thức, co giật, tai biến hoặc chấn thương nặng, người bệnh hoặc người nhà cần gọi ngay Trung tâm Cấp cứu 115 hoặc đến phòng Cấp cứu của bệnh viện gần nhất ngay lập tức.',
  },
]);

/**
 * Builds or refreshes the genuine knowledge corpus from database and verified policies
 */
async function loadKnowledgeCorpus(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && knowledgeCorpus.length > 0 && now - lastCorpusBuildTime < CORPUS_TTL_MS) {
    return knowledgeCorpus;
  }

  const corpus = [];

  // 1. Ingest static verified policies
  for (const pol of PLATFORM_POLICIES) {
    corpus.push({
      ...pol,
      normalizedText: normalizeSearchText(`${pol.title} ${pol.content}`),
      updatedAt: new Date().toISOString(),
    });
  }

  // 2. Ingest genuine database Specialties
  try {
    const specialties = await db.Specialty.findAll({
      attributes: ['id', 'name', 'descriptionHTML', 'descriptionMarkdown', 'updatedAt'],
      raw: true,
    });
    for (const spec of specialties) {
      const rawDesc = spec.descriptionMarkdown || spec.descriptionHTML || '';
      const cleanDesc = cleanHtmlText(rawDesc);
      const text = cleanDesc.slice(0, 600); // chunk budget
      corpus.push({
        documentId: `doc_spec_${spec.id}`,
        title: `Chuyên khoa ${spec.name}`,
        category: 'SPECIALTY',
        source: 'BOOKINGCARE_SPECIALTY_CATALOG',
        version: '1.0.0',
        content: `Chuyên khoa ${spec.name}: ${text}`,
        normalizedText: normalizeSearchText(`Chuyên khoa ${spec.name} ${text}`),
        updatedAt: spec.updatedAt ? new Date(spec.updatedAt).toISOString() : new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[AI_KNOWLEDGE_INGEST_WARN] Error ingesting specialties:', err.message);
  }

  // 3. Ingest genuine database Clinics
  try {
    const clinics = await db.Clinic.findAll({
      attributes: ['id', 'name', 'address', 'descriptionHTML', 'descriptionMarkdown', 'updatedAt'],
      raw: true,
    });
    for (const clinic of clinics) {
      const rawDesc = clinic.descriptionMarkdown || clinic.descriptionHTML || '';
      const cleanDesc = cleanHtmlText(rawDesc);
      const text = `${clinic.name}. Địa chỉ: ${clinic.address || 'Đang cập nhật'}. ${cleanDesc.slice(0, 450)}`;
      corpus.push({
        documentId: `doc_clinic_${clinic.id}`,
        title: clinic.name,
        category: 'CLINIC',
        source: 'BOOKINGCARE_CLINIC_REGISTRY',
        version: '1.0.0',
        content: text,
        normalizedText: normalizeSearchText(`${clinic.name} ${clinic.address} ${text}`),
        updatedAt: clinic.updatedAt ? new Date(clinic.updatedAt).toISOString() : new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[AI_KNOWLEDGE_INGEST_WARN] Error ingesting clinics:', err.message);
  }

  knowledgeCorpus = corpus;
  lastCorpusBuildTime = now;
  return knowledgeCorpus;
}

const VI_STOP_WORDS = new Set([
  'ngay', 'khong', 'nhung', 'duoc', 'trong', 'cac', 'cua', 'cho', 'voi', 'mot', 'nay',
  'khi', 'theo', 'nhu', 'tai', 'tren', 'co', 'o', 'va', 'la', 'hay', 've', 'den', 'tu',
  'de', 'gi', 'nao', 'the', 'sao', 'ma', 'ai', 'hoi', 'biet', 'giup', 'toi', 'minh', 'ban',
]);

/**
 * Searches and retrieves relevant knowledge chunks based on query text
 * @param {string} query User prompt or search query
 * @param {Object} [options]
 * @param {number} [options.limit=3] Maximum chunks to retrieve (budget protection)
 * @param {number} [options.minScore=0.35] Minimum relevance threshold
 * @param {string} [options.category] Optional category filter
 * @returns {Promise<{ chunks: Array<Object>, citations: Array<Object> }>}
 */
async function retrieveRelevantKnowledge(query, options = {}) {
  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    return { chunks: [], citations: [] };
  }

  const limit = Math.min(Math.max(parseInt(options.limit || 3, 10), 1), 5);
  const minScore = typeof options.minScore === 'number' ? options.minScore : 0.35;
  const categoryFilter = options.category ? String(options.category).toUpperCase() : null;

  try {
    const corpus = await loadKnowledgeCorpus();
    const normQuery = normalizeSearchText(query);
    const rawTokens = normQuery.split(/\s+/).filter((t) => t.length > 2);
    const contentTokens = rawTokens.filter((t) => !VI_STOP_WORDS.has(t) && t.length >= 3);

    if (contentTokens.length === 0) {
      return { chunks: [], citations: [] };
    }

    const scored = [];

    for (const doc of corpus) {
      if (categoryFilter && doc.category !== categoryFilter) continue;

      const normTitle = normalizeSearchText(doc.title);
      const docWords = new Set(doc.normalizedText.split(/[\s,.-]+/));
      const titleWords = new Set(normTitle.split(/[\s,.-]+/));

      let score = 0;

      // Exact substring match bonus
      if (doc.normalizedText.includes(normQuery)) {
        score += 1.0;
      }
      if (normTitle.includes(normQuery)) {
        score += 1.0;
      }

      // Token matches in document body
      let bodyMatches = 0;
      for (const token of contentTokens) {
        if (docWords.has(token)) {
          bodyMatches++;
        }
      }

      // Token matches in title
      let titleMatches = 0;
      for (const token of contentTokens) {
        if (titleWords.has(token)) {
          titleMatches++;
        }
      }

      const bodyMatchRatio = contentTokens.length > 0 ? bodyMatches / contentTokens.length : 0;
      const titleMatchRatio = contentTokens.length > 0 ? titleMatches / contentTokens.length : 0;

      if (titleMatches >= 2 || (contentTokens.length === 1 && titleMatches === 1)) {
        score += 0.8 + titleMatchRatio * 0.4;
      }

      if (bodyMatches >= 2 || (contentTokens.length === 1 && bodyMatches === 1)) {
        score += bodyMatchRatio * 0.7;
      }

      // Require sufficient overlap: at least 2 matching tokens (or 1 if query is single token)
      // AND at least 35% of content tokens must match
      const hasEnoughEvidence = (
        normTitle.includes(normQuery) ||
        doc.normalizedText.includes(normQuery) ||
        (titleMatches >= 2 && titleMatchRatio >= 0.35) ||
        (bodyMatches >= 2 && bodyMatchRatio >= 0.35) ||
        (contentTokens.length === 1 && (titleMatches === 1 || bodyMatches === 1))
      );

      if (score >= minScore && hasEnoughEvidence) {
        scored.push({ doc, score });
      }
    }

    // Rank descending
    scored.sort((a, b) => b.score - a.score);

    const topItems = scored.slice(0, limit);
    const chunks = [];
    const citations = [];
    const seenDocs = new Set();

    for (const { doc, score } of topItems) {
      if (seenDocs.has(doc.documentId)) continue;
      seenDocs.add(doc.documentId);

      // Neutralize any malicious instruction in the content (Prompt Injection Defense)
      const sanitizedContent = doc.content
        .replace(/[\r\n]+/g, ' ')
        .replace(/<[^>]+>/g, '')
        .slice(0, 450);

      chunks.push({
        documentId: doc.documentId,
        title: doc.title,
        source: doc.source,
        category: doc.category,
        content: sanitizedContent,
        relevanceScore: Math.round(score * 100) / 100,
      });

      citations.push({
        documentId: doc.documentId,
        title: doc.title,
        source: doc.source,
        category: doc.category,
      });
    }

    return { chunks, citations };
  } catch (err) {
    console.error('[AI_KNOWLEDGE_RETRIEVE_ERR]', err.message);
    // Graceful fallback: return empty without crashing
    return { chunks: [], citations: [] };
  }
}

module.exports = {
  loadKnowledgeCorpus,
  retrieveRelevantKnowledge,
  PLATFORM_POLICIES,
};
