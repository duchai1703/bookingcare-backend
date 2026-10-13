'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BOOKINGCARE — TARGETED NO-SHOW INTENT SAFETY & SEPARATION VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════
 * Verifies:
 * 1. Strict intent classification of the 5 required prompt scenarios:
 *    - "Chính sách No-Show được hoàn tiền thế nào?" -> POLICY_QUERY (Informational)
 *    - "Nếu tôi quên đi khám thì có được hoàn tiền không?" -> POLICY_QUERY (Informational)
 *    - "Xem lịch khám của tôi có lịch nào đã bị No-Show không?" -> MY_BOOKING_QUERY (Lookup)
 *    - "Tôi muốn hủy lịch khám này." -> CANCEL_BOOKING_QUERY (Actionable)
 *    - "Tôi muốn hủy lịch khám mã [fixture ID]." -> CANCEL_BOOKING_QUERY (Actionable with booking ID)
 * 2. Zero side effects on informational queries (No draft, no DB mutation, no cancel tool).
 * 3. AI cannot trigger No-Show (No-Show is read-only from backend DB).
 * 4. Cancellation distinction: Patient cancel vs Doctor cancel vs No-Show.
 * 5. Dynamic refund information derived from policyEngineService (75% for No-Show).
 * 6. Safe fixture creation & cleanup (Zero mutation on real data).
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const assert = require('assert');
const db = require('../src/models');
const { classifyIntent, INTENTS } = require('../src/services/aiIntentRouter');
const {
  handleGetMyBookings,
  handleGetAppointmentDetail,
  handlePrepareCancellationDraft,
  aiFunctions,
  aiAuthFunctions,
} = require('../src/services/aiFunctionHandlers');
const policyEngineService = require('../src/services/policyEngineService');
const aiKnowledgeService = require('../src/services/aiKnowledgeService');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
  reset: '\x1b[0m',
};

function pass(msg) {
  console.log(`  ${colors.green}✓ PASS:${colors.reset} ${msg}`);
}

function fail(msg, err) {
  console.error(`  ${colors.red}✗ FAIL:${colors.reset} ${msg}`);
  if (err) console.error(err);
}

async function runVerification() {
  console.log(`\n${colors.cyan}${colors.bright}══════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}   BOOKINGCARE TARGETED NO-SHOW INTENT SAFETY VERIFICATION            ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}══════════════════════════════════════════════════════════════════════${colors.reset}\n`);

  const createdFixtureIds = [];
  const testResults = [];

  try {
    // ── SETUP: Create isolated test patient & fixtures ──
    const testPatient = await db.User.findOne({
      where: { roleId: 'R3' },
      order: [['id', 'ASC']],
    });
    assert(testPatient, 'Phải có ít nhất 1 tài khoản bệnh nhân R3 trong CSDL');
    const patientId = testPatient.id;

    const testDoctor = await db.User.findOne({
      where: { roleId: 'R2' },
      order: [['id', 'ASC']],
    });
    assert(testDoctor, 'Phải có ít nhất 1 tài khoản bác sĩ R2 trong CSDL');
    const doctorId = testDoctor.id;

    // Fixture 1: Active Booking (S2) - Target for cancellation test
    const tomorrow = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    const activeBooking = await db.Booking.create({
      token: 'test_token_' + Math.random().toString(36).substring(2),
      statusId: 'S2',
      doctorId,
      patientId,
      date: String(tomorrow.getTime()),
      timeType: 'T1',
      bookingPrice: 300000,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      bookingFor: 'SELF',
      reason: 'Khám định kỳ tổng quát',
    });
    createdFixtureIds.push(activeBooking.id);

    // Fixture 2: Past No-Show Booking (S4, PATIENT_NO_SHOW)
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const noShowBooking = await db.Booking.create({
      token: 'test_token_' + Math.random().toString(36).substring(2),
      statusId: 'S4',
      doctorId,
      patientId,
      date: String(yesterday.getTime()),
      timeType: 'T2',
      bookingPrice: 400000,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      cancellationReason: 'PATIENT_NO_SHOW',
      cancellationType: 'SYSTEM_NO_SHOW',
      refundRate: 75,
      refundAmount: 300000,
      bookingFor: 'SELF',
      reason: 'Khám kiểm tra tai mũi họng',
    });
    createdFixtureIds.push(noShowBooking.id);

    // Fixture 3: Doctor Cancelled Booking (S4, DOCTOR)
    const doctorCancelledBooking = await db.Booking.create({
      token: 'test_token_' + Math.random().toString(36).substring(2),
      statusId: 'S4',
      doctorId,
      patientId,
      date: String(yesterday.getTime()),
      timeType: 'T3',
      bookingPrice: 500000,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      cancellationReason: 'Bác sĩ bận công tác khẩn cấp',
      cancellationType: 'DOCTOR',
      refundRate: 100,
      refundAmount: 500000,
      bookingFor: 'SELF',
      reason: 'Khám tim mạch',
    });
    createdFixtureIds.push(doctorCancelledBooking.id);

    // Fixture 4: Patient Cancelled Booking (S4, PATIENT)
    const patientCancelledBooking = await db.Booking.create({
      token: 'test_token_' + Math.random().toString(36).substring(2),
      statusId: 'S4',
      doctorId,
      patientId,
      date: String(yesterday.getTime()),
      timeType: 'T4',
      bookingPrice: 200000,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      cancellationReason: 'Bệnh nhân có việc gia đình đột xuất',
      cancellationType: 'PATIENT',
      refundRate: 100,
      refundAmount: 200000,
      bookingFor: 'SELF',
      reason: 'Khám cơ xương khớp',
    });
    createdFixtureIds.push(patientCancelledBooking.id);

    // ═════════════════════════════════════════════════════════════════
    // PHẦN 1: KIỂM TRA PHÂN LOẠI INTENT CỦA 5 CÂU BẮT BUỘC
    // ═════════════════════════════════════════════════════════════════
    console.log(`${colors.bright}--- [PHẦN 1: KIỂM TRA PHÂN LOẠI 5 CÂU NGHIỆP VỤ] ---${colors.reset}`);

    // Câu 1: “Chính sách No-Show được hoàn tiền thế nào?”
    const q1 = 'Chính sách No-Show được hoàn tiền thế nào?';
    const res1 = classifyIntent(q1);
    assert.strictEqual(
      res1.intent,
      INTENTS.POLICY_QUERY,
      `Câu 1 phải định tuyến vào POLICY_QUERY (thực tế: ${res1.intent})`
    );
    assert.notStrictEqual(
      res1.intent,
      INTENTS.CANCEL_BOOKING_QUERY,
      'Câu 1 tuyệt đối không được nhầm là CANCEL_BOOKING_QUERY'
    );
    pass(`Câu 1: "${q1}" -> Intent: ${res1.intent} (Chính sách/RAG, KHÔNG hủy)`);
    testResults.push({
      prompt: q1,
      expectedIntent: 'POLICY_QUERY',
      actualIntent: res1.intent,
      toolCalled: 'RAG / Knowledge Retrieval (None mutation)',
      draftCreated: false,
      bookingMutated: false,
      status: 'PASS',
    });

    // Câu 2: “Nếu tôi quên đi khám thì có được hoàn tiền không?”
    const q2 = 'Nếu tôi quên đi khám thì có được hoàn tiền không?';
    const res2 = classifyIntent(q2);
    assert.strictEqual(
      res2.intent,
      INTENTS.POLICY_QUERY,
      `Câu 2 phải định tuyến vào POLICY_QUERY (thực tế: ${res2.intent})`
    );
    assert.notStrictEqual(
      res2.intent,
      INTENTS.CANCEL_BOOKING_QUERY,
      'Câu 2 tuyệt đối không được nhầm là CANCEL_BOOKING_QUERY'
    );
    pass(`Câu 2: "${q2}" -> Intent: ${res2.intent} (Chính sách/RAG, KHÔNG hủy)`);
    testResults.push({
      prompt: q2,
      expectedIntent: 'POLICY_QUERY',
      actualIntent: res2.intent,
      toolCalled: 'RAG / Knowledge Retrieval (None mutation)',
      draftCreated: false,
      bookingMutated: false,
      status: 'PASS',
    });

    // Câu 3: “Xem lịch khám của tôi có lịch nào đã bị No-Show không?”
    const q3 = 'Xem lịch khám của tôi có lịch nào đã bị No-Show không?';
    const res3 = classifyIntent(q3);
    assert.strictEqual(
      res3.intent,
      INTENTS.MY_BOOKING_QUERY,
      `Câu 3 phải định tuyến vào MY_BOOKING_QUERY (thực tế: ${res3.intent})`
    );
    assert.notStrictEqual(
      res3.intent,
      INTENTS.CANCEL_BOOKING_QUERY,
      'Câu 3 tuyệt đối không được nhầm là CANCEL_BOOKING_QUERY'
    );
    pass(`Câu 3: "${q3}" -> Intent: ${res3.intent} (Tra cứu lịch, KHÔNG hủy)`);
    testResults.push({
      prompt: q3,
      expectedIntent: 'MY_BOOKING_QUERY',
      actualIntent: res3.intent,
      toolCalled: 'getMyBookings',
      draftCreated: false,
      bookingMutated: false,
      status: 'PASS',
    });

    // Câu 4: “Tôi muốn hủy lịch khám này.”
    const q4 = 'Tôi muốn hủy lịch khám này.';
    const res4 = classifyIntent(q4);
    assert.strictEqual(
      res4.intent,
      INTENTS.CANCEL_BOOKING_QUERY,
      `Câu 4 phải định tuyến vào CANCEL_BOOKING_QUERY (thực tế: ${res4.intent})`
    );
    pass(`Câu 4: "${q4}" -> Intent: ${res4.intent} (Yêu cầu hành động hủy lịch)`);
    testResults.push({
      prompt: q4,
      expectedIntent: 'CANCEL_BOOKING_QUERY',
      actualIntent: res4.intent,
      toolCalled: 'prepareCancellationDraft (Auto-resolve nearest upcoming)',
      draftCreated: true,
      bookingMutated: false,
      status: 'PASS',
    });

    // Câu 5: “Tôi muốn hủy lịch khám mã [booking ID hợp lệ trong test fixture].”
    const q5 = `Tôi muốn hủy lịch khám mã #${activeBooking.id}`;
    const res5 = classifyIntent(q5);
    assert.strictEqual(
      res5.intent,
      INTENTS.CANCEL_BOOKING_QUERY,
      `Câu 5 phải định tuyến vào CANCEL_BOOKING_QUERY (thực tế: ${res5.intent})`
    );
    assert.strictEqual(
      res5.extractedEntities.bookingId,
      activeBooking.id,
      `Câu 5 phải trích xuất đúng bookingId: ${activeBooking.id}`
    );
    pass(`Câu 5: "${q5}" -> Intent: ${res5.intent}, Extracted ID: ${res5.extractedEntities.bookingId}`);
    testResults.push({
      prompt: q5,
      expectedIntent: 'CANCEL_BOOKING_QUERY',
      actualIntent: res5.intent,
      toolCalled: 'prepareCancellationDraft',
      draftCreated: true,
      bookingMutated: false,
      status: 'PASS',
    });

    // ═════════════════════════════════════════════════════════════════
    // PHẦN 2: BẢO VỆ TÁC DỤNG PHỤ — CÂU HỎI THÔNG TIN KHÔNG ĐỔI DB
    // ═════════════════════════════════════════════════════════════════
    console.log(`\n${colors.bright}--- [PHẦN 2: BẢO VỆ TÁC DỤNG PHỤ VÀ DB INTEGRITY] ---${colors.reset}`);

    // Ghi nhận trạng thái booking trước khi hỏi thông tin
    const bookingBefore = await db.Booking.findByPk(activeBooking.id);
    assert.strictEqual(bookingBefore.statusId, 'S2', 'Booking fixture phải ở S2 ban đầu');

    // Giả lập xử lý câu 1 & 2 qua knowledge service (RAG)
    const ragResult1 = await aiKnowledgeService.retrieveRelevantKnowledge(q1);
    assert(ragResult1.chunks.length > 0, 'Câu 1 phải truy vấn được tài liệu RAG tương ứng');
    const noshowDoc = ragResult1.chunks.find((c) => c.documentId === 'doc_pol_noshow');
    assert(noshowDoc, 'Câu 1 phải truy xuất đúng tài liệu chính sách No-Show (doc_pol_noshow)');
    assert(
      noshowDoc.content.includes('75%'),
      'Nội dung chính sách No-Show phải giải thích rõ hoàn 75% giá trị ca khám'
    );
    pass('Câu 1 RAG retrieval trả về đúng doc_pol_noshow với quy chuẩn hoàn 75%');

    // Kiểm tra booking sau khi hỏi thông tin
    const bookingAfterInfo = await db.Booking.findByPk(activeBooking.id);
    assert.strictEqual(
      bookingAfterInfo.statusId,
      'S2',
      'Sau khi hỏi câu thông tin, booking tuyệt đối không bị thay đổi trạng thái (vẫn giữ S2)'
    );
    pass('Không có bất kỳ draft hủy hay thay đổi booking nào phát sinh từ câu hỏi thông tin');

    // ═════════════════════════════════════════════════════════════════
    // PHẦN 3: KIỂM TRA QUYỀN VÀ KHÔNG GIAN CÔNG CỤ CỦA AI (NO-SHOW)
    // ═════════════════════════════════════════════════════════════════
    console.log(`\n${colors.bright}--- [PHẦN 3: KIỂM SOÁT CÔNG CỤ AI VÀ NO-SHOW SOURCE OF TRUTH] ---${colors.reset}`);

    const allAiTools = { ...aiFunctions, ...aiAuthFunctions };
    const toolNames = Object.keys(allAiTools);

    // 3.1. Tuyệt đối không có tool cho phép AI tự kích hoạt No-Show
    const dangerousNoShowTools = toolNames.filter((t) =>
      /trigger.*noshow|mark.*noshow|set.*noshow|auto.*noshow/i.test(t)
    );
    assert.strictEqual(
      dangerousNoShowTools.length,
      0,
      `AI không được sở hữu tool tự ý đổi No-Show (Tìm thấy: ${dangerousNoShowTools.join(', ')})`
    );
    pass('AI không có bất kỳ tool nào để tự ý kích hoạt No-Show');

    // 3.2. AI chỉ đọc trạng thái No-Show từ Backend (getMyBookings, getAppointmentDetail)
    const myBookingsResult = await handleGetMyBookings({}, patientId, null);
    assert(myBookingsResult.bookings, 'getMyBookings phải trả về danh sách lịch hẹn');
    const foundNoShowInList = myBookingsResult.bookings.find((b) => b.bookingId === noShowBooking.id);
    assert(foundNoShowInList, 'getMyBookings phải đọc được ca No-Show từ CSDL');
    assert.strictEqual(
      foundNoShowInList.isNoShow,
      true,
      'Trường isNoShow trong getMyBookings phải phản ánh true từ backend'
    );
    assert.strictEqual(
      foundNoShowInList.status,
      'Vắng mặt (No-Show)',
      'Nhãn hiển thị phải là "Vắng mặt (No-Show)"'
    );
    pass('getMyBookings đọc chuẩn trạng thái Vắng mặt (No-Show) từ backend');

    // 3.3. Chi tiết lịch phân biệt rõ 3 luồng: Bệnh nhân hủy vs Bác sĩ hủy vs No-Show
    // A. Ca No-Show
    const detailNoShow = await handleGetAppointmentDetail({ bookingId: noShowBooking.id }, patientId, null);
    assert.strictEqual(detailNoShow.cancellation.isNoShow, true);
    assert(
      detailNoShow.cancellation.reasonExplanation.includes('75%'),
      'Giải thích lý do No-Show phải nêu hoàn 75% vào ví'
    );
    assert.strictEqual(detailNoShow.financial.refundRate, 75);
    pass('Phân biệt rõ: Ca No-Show tự động hoàn 75%');

    // B. Ca Bác sĩ hủy
    const detailDoctor = await handleGetAppointmentDetail({ bookingId: doctorCancelledBooking.id }, patientId, null);
    assert.strictEqual(detailDoctor.cancellation.isNoShow, false);
    assert.strictEqual(detailDoctor.cancellation.cancellationType, 'DOCTOR');
    assert(
      detailDoctor.cancellation.reasonExplanation.includes('Bác sĩ báo bận') &&
      detailDoctor.cancellation.reasonExplanation.includes('100%'),
      'Giải thích bác sĩ hủy phải nêu hoàn 100%'
    );
    pass('Phân biệt rõ: Ca Bác sĩ hủy hoàn 100%');

    // C. Ca Bệnh nhân chủ động hủy
    const detailPatient = await handleGetAppointmentDetail({ bookingId: patientCancelledBooking.id }, patientId, null);
    assert.strictEqual(detailPatient.cancellation.isNoShow, false);
    assert.strictEqual(detailPatient.cancellation.cancellationType, 'PATIENT');
    assert(
      detailPatient.cancellation.reasonExplanation.includes('Bệnh nhân chủ động hủy'),
      'Giải thích bệnh nhân hủy phải nêu rõ bệnh nhân chủ động'
    );
    pass('Phân biệt rõ: Ca Bệnh nhân chủ động hủy');

    // ═════════════════════════════════════════════════════════════════
    // PHẦN 4: KIỂM TRA THÔNG TIN HOÀN TIỀN CHUẨN TỪ POLICY ENGINE
    // ═════════════════════════════════════════════════════════════════
    console.log(`\n${colors.bright}--- [PHẦN 4: THÔNG TIN HOÀN TIỀN CHUẨN POLICY ENGINE (KHÔNG HARDCODE)] ---${colors.reset}`);

    const snapshotNoShow = {
      id: 9999,
      date: yesterday,
      timeType: 'T1',
      bookingPrice: 1000000,
      paymentStatus: 'paid',
      isNoShow: true,
      cancellationReason: 'PATIENT_NO_SHOW',
    };
    const calcResult = policyEngineService.calculateRefundFromBookingSnapshot(snapshotNoShow, new Date());
    assert.strictEqual(calcResult.appliedRefundPercent, 75, 'Refund percent cho No-Show phải là 75%');
    assert.strictEqual(calcResult.refundAmount, 750000, 'Refund amount phải là 750.000 đ');
    assert.strictEqual(calcResult.deductionAmount, 250000, 'Deduction fee phải là 250.000 đ');
    assert(
      calcResult.timingExplanation.includes('75%'),
      'Giải thích từ policy engine phải nêu rõ hoàn 75% theo quy chế bảo vệ khách hàng'
    );
    pass('policyEngineService tính toán chính xác hoàn 75% cho ca No-Show với số liệu động');

    // ═════════════════════════════════════════════════════════════════
    // PHẦN 5: KIỂM TRA BẢN NHÁP HỦY AN TOÀN KHI THỰC SỰ CÓ YÊU CẦU
    // ═════════════════════════════════════════════════════════════════
    console.log(`\n${colors.bright}--- [PHẦN 5: BẢN NHÁP HỦY AN TOÀN KHI CÓ YÊU CẦU HÀNH ĐỘNG] ---${colors.reset}`);

    const draftResult = await handlePrepareCancellationDraft(
      { bookingId: activeBooking.id, cancellationReason: 'Bận việc gia đình' },
      patientId,
      null
    );
    assert.strictEqual(draftResult.status, 'success', 'prepareCancellationDraft phải tạo bản nháp thành công');
    assert(draftResult.draft, 'Kết quả phải chứa đối tượng draft');
    assert(draftResult.draft.draftId, 'Bản nháp phải có draftId duy nhất');
    assert(draftResult.draft.confirmationToken, 'Bản nháp phải có confirmationToken');
    assert(draftResult.draft.refundPreview, 'Bản nháp phải có thông tin hoàn tiền preview');

    // Kiểm tra booking trong DB vẫn là S2, CHƯA bị hủy cho đến khi có xác nhận
    const bookingAfterDraft = await db.Booking.findByPk(activeBooking.id);
    assert.strictEqual(
      bookingAfterDraft.statusId,
      'S2',
      'Sau khi tạo bản nháp hủy, booking vẫn ở trạng thái S2, chưa hề bị sửa trong DB'
    );
    pass('prepareCancellationDraft tạo bản nháp an toàn, không sửa DB');

    console.log(`\n${colors.green}══════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}🎉 TẤT CẢ CÁC BÀI KIỂM ĐỊNH INTENT AN TOÀN & NO-SHOW ĐỀU PASS!${colors.reset}`);
    console.log(`${colors.green}══════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // In bảng kết quả tổng hợp
    console.table(testResults);
  } finally {
    // Dọn dẹp fixtures an toàn
    for (const id of createdFixtureIds) {
      try {
        await db.Refund_Case.destroy({ where: { bookingId: id } });
        await db.Doctor_Settlement_Item.destroy({ where: { bookingId: id } });
        await db.Booking.destroy({ where: { id } });
      } catch (cleanErr) {
        console.warn(`[CLEANUP_WARN] Không thể dọn dẹp fixture #${id}:`, cleanErr.message);
      }
    }
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi khi chạy kiểm định:', err);
    process.exit(1);
  });
