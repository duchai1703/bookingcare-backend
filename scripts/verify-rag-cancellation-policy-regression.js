'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BOOKINGCARE — REGRESSION TEST SUITE: RAG CANCELLATION POLICY ALIGNMENT
 * ═══════════════════════════════════════════════════════════════════════
 * Verifies:
 * 1. doc_pol_cancellation content matches canonical policy engine tiers:
 *    - >= 24h: 100%
 *    - 12h to < 24h: 75% (No longer 70%)
 *    - 0h to < 12h: 50% (No longer "under 2h: 0%")
 *    - After appointment time: 0%
 *    - Doctor cancel: 100%
 *    - No-Show: 75%
 * 2. RAG retrieveRelevantKnowledge returns doc_pol_cancellation when querying:
 *    "Chính sách hủy lịch khám và hoàn tiền"
 * 3. Actual retrieved document contains correct numbers and lacks stale numbers.
 * 4. Separate No-Show policy (doc_pol_noshow) is returned when querying No-Show.
 * 5. Policy queries route to POLICY_QUERY (0 draft, 0 DB mutations).
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const assert = require('assert');
const db = require('../src/models');
const aiKnowledgeService = require('../src/services/aiKnowledgeService');
const { classifyIntent, INTENTS } = require('../src/services/aiIntentRouter');
const policyEngineService = require('../src/services/policyEngineService');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
  reset: '\x1b[0m',
};

function pass(msg) {
  console.log(`  ${colors.green}✓ PASS:${colors.reset} ${msg}`);
}

async function runRegression() {
  console.log(`\n${colors.cyan}${colors.bright}══════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}   VERIFY RAG CANCELLATION POLICY & RETRIEVAL REGRESSION              ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}══════════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // ── TEST 1: LOAD FRESH CORPUS & INSPECT doc_pol_cancellation ──
  console.log(`${colors.bright}--- [TEST 1: NỘI DUNG TÀI LIỆU RAG doc_pol_cancellation] ---${colors.reset}`);
  const corpus = await aiKnowledgeService.loadKnowledgeCorpus(true);
  const cancelDoc = corpus.find((d) => d.documentId === 'doc_pol_cancellation');
  assert(cancelDoc, 'Phải tồn tại tài liệu doc_pol_cancellation trong knowledge corpus');

  // Phủ nhận nội dung cũ
  assert(
    !cancelDoc.content.includes('70%'),
    'doc_pol_cancellation TUYỆT ĐỐI KHÔNG được chứa mốc 70% cũ'
  );
  pass('Xác nhận: doc_pol_cancellation không còn ghi mốc 70% cũ');

  assert(
    !cancelDoc.content.includes('dưới 2 giờ hoặc sau giờ khám: không hỗ trợ hoàn tiền (0%)') &&
    !cancelDoc.content.includes('dưới 2 giờ') &&
    !cancelDoc.content.includes('2 đến 12 giờ'),
    'doc_pol_cancellation TUYỆT ĐỐI KHÔNG được chứa mốc "dưới 2 giờ hoàn 0%" cũ'
  );
  pass('Xác nhận: doc_pol_cancellation không còn ghi "dưới 2 giờ hoàn 0%"');

  // Khẳng định nội dung chuẩn mới
  assert(
    cancelDoc.content.includes('24 giờ') && cancelDoc.content.includes('100%'),
    'doc_pol_cancellation phải ghi rõ mốc >= 24h hoàn 100%'
  );
  assert(
    cancelDoc.content.includes('12 đến dưới 24 giờ') && cancelDoc.content.includes('75%'),
    'doc_pol_cancellation phải ghi rõ mốc 12 - 24h hoàn 75%'
  );
  assert(
    cancelDoc.content.includes('0 đến dưới 12 giờ') && cancelDoc.content.includes('50%'),
    'doc_pol_cancellation phải ghi rõ mốc 0 - 12h hoàn 50%'
  );
  assert(
    cancelDoc.content.includes('sau thời điểm khám') && cancelDoc.content.includes('0%'),
    'doc_pol_cancellation phải ghi rõ sau thời điểm khám hoàn 0%'
  );
  assert(
    cancelDoc.content.includes('Bác sĩ') && cancelDoc.content.includes('100%'),
    'doc_pol_cancellation phải nêu rõ bác sĩ hủy hoàn 100%'
  );
  assert(
    cancelDoc.content.includes('No-Show') && cancelDoc.content.includes('75%'),
    'doc_pol_cancellation phải phân biệt No-Show hoàn 75%'
  );
  pass('Xác nhận: doc_pol_cancellation chứa đầy đủ 4 mốc chuẩn (100%, 75%, 50%, 0%) kèm Bác sĩ (100%) và No-Show (75%)');

  // ── TEST 2: RUNTIME RETRIEVAL KHI NGƯỜI DÙNG HỎI HỦY LỊCH ──
  console.log(`\n${colors.bright}--- [TEST 2: RUNTIME RAG RETRIEVAL KHI HỎI CHÍNH SÁCH HỦY LỊCH] ---${colors.reset}`);
  const userQuery = 'Chính sách hủy lịch khám và hoàn tiền BookingCare như thế nào?';
  const retrievalResult = await aiKnowledgeService.retrieveRelevantKnowledge(userQuery, { limit: 3 });

  assert(retrievalResult.chunks.length > 0, 'Retrieval phải trả về ít nhất 1 chunk tài liệu');
  const retrievedDoc = retrievalResult.chunks.find((c) => c.documentId === 'doc_pol_cancellation');
  assert(retrievedDoc, 'Retrieval phải trả về đúng doc_pol_cancellation');
  assert.strictEqual(retrievedDoc.source, 'BOOKINGCARE_POLICY_ENGINE');
  assert(
    retrievedDoc.content.includes('75%') && retrievedDoc.content.includes('50%'),
    'Nội dung retrieval trả về phải chứa các mốc chuẩn mới'
  );
  pass(`Truy vấn "${userQuery}" trả về chuẩn xác doc_pol_cancellation (${retrievedDoc.title})`);

  // ── TEST 3: ĐỘC LẬP GIỮA CHÍNH SÁCH HỦY VÀ CHÍNH SÁCH NO-SHOW ──
  console.log(`\n${colors.bright}--- [TEST 3: ĐỘC LẬP CHÍNH SÁCH HỦY VS NO-SHOW] ---${colors.reset}`);
  const noShowQuery = 'Chính sách No-Show được hoàn tiền thế nào?';
  const noShowRetrieval = await aiKnowledgeService.retrieveRelevantKnowledge(noShowQuery, { limit: 3 });
  const noShowDoc = noShowRetrieval.chunks.find((c) => c.documentId === 'doc_pol_noshow');
  assert(noShowDoc, 'Câu hỏi No-Show phải trả về tài liệu doc_pol_noshow');
  assert(noShowDoc.content.includes('75%'), 'doc_pol_noshow phải ghi rõ hoàn 75%');
  pass(`Truy vấn "${noShowQuery}" trả về chuẩn xác doc_pol_noshow (${noShowDoc.title})`);

  // ── TEST 4: INTENT ROUTING SAFETY BẢO VỆ SIDE EFFECTS ──
  console.log(`\n${colors.bright}--- [TEST 4: INTENT ROUTING AN TOÀN & KHÔNG SIDE EFFECT] ---${colors.reset}`);
  const testPhrases = [
    'Chính sách hủy lịch khám được hoàn tiền thế nào?',
    'Hủy lịch trước 15 giờ có được hoàn tiền không?',
    'Quy định hoàn tiền khi hủy khám ra sao?',
    'Chính sách No-Show được hoàn tiền thế nào?',
    'Nếu tôi quên đi khám thì có được hoàn tiền không?',
  ];

  for (const phrase of testPhrases) {
    const res = classifyIntent(phrase);
    assert.strictEqual(
      res.intent,
      INTENTS.POLICY_QUERY,
      `Câu "${phrase}" phải được phân loại vào POLICY_QUERY (thực tế: ${res.intent})`
    );
    assert.notStrictEqual(
      res.intent,
      INTENTS.CANCEL_BOOKING_QUERY,
      `Câu "${phrase}" tuyệt đối không được là CANCEL_BOOKING_QUERY`
    );
    pass(`"${phrase}" -> Intent: ${res.intent} (Chính sách thuần túy, 0 cancel draft)`);
  }

  // ── TEST 5: ĐỐI CHIẾU CHUẨN XÁC VỚI POLICY ENGINE SERVICE RUNTIME ──
  console.log(`\n${colors.bright}--- [TEST 5: ĐỐI CHIẾU VỚI POLICY ENGINE BACKEND] ---${colors.reset}`);
  const baseApptTime = new Date('2026-10-20T10:00:00.000Z');
  const mockBooking = {
    date: String(baseApptTime.getTime()),
    bookingPrice: 200000,
    statusId: 'S2',
    paymentStatus: 'paid',
  };

  // 25 giờ trước giờ khám -> 100%
  const t25 = new Date(baseApptTime.getTime() - 25 * 3600 * 1000);
  const calc25 = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, t25);
  assert.strictEqual(calc25.appliedRefundPercent, 100);
  assert(cancelDoc.content.includes('24 giờ trở lên: hoàn 100%'));

  // 18 giờ trước giờ khám -> 75%
  const t18 = new Date(baseApptTime.getTime() - 18 * 3600 * 1000);
  const calc18 = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, t18);
  assert.strictEqual(calc18.appliedRefundPercent, 75);
  assert(cancelDoc.content.includes('12 đến dưới 24 giờ: hoàn 75%'));

  // 6 giờ trước giờ khám -> 50%
  const t6 = new Date(baseApptTime.getTime() - 6 * 3600 * 1000);
  const calc6 = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, t6);
  assert.strictEqual(calc6.appliedRefundPercent, 50);
  assert(cancelDoc.content.includes('0 đến dưới 12 giờ: hoàn 50%'));

  // 1 giờ trước giờ khám -> 50%
  const t1 = new Date(baseApptTime.getTime() - 1 * 3600 * 1000);
  const calc1 = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, t1);
  assert.strictEqual(calc1.appliedRefundPercent, 50);
  assert(cancelDoc.content.includes('0 đến dưới 12 giờ: hoàn 50%'));

  // Quá giờ khám (-1 giờ) -> 0%
  const tPast = new Date(baseApptTime.getTime() + 1 * 3600 * 1000);
  const calcPast = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, tPast);
  assert.strictEqual(calcPast.appliedRefundPercent, 0);
  assert(cancelDoc.content.includes('sau thời điểm khám (quá giờ hẹn): không hỗ trợ hoàn tiền (0%)'));

  pass('Nội dung doc_pol_cancellation khớp 100% với từng mốc tính toán thực tế của policyEngineService');

  console.log(`\n${colors.green}══════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}🎉 TẤT CẢ 5/5 TEST SUITE REGRESSION ĐỀU PASS HOÀN TOÀN!${colors.reset}`);
  console.log(`${colors.green}══════════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

runRegression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi kiểm thử regression:', err);
    process.exit(1);
  });
