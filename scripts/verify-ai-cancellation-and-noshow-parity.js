'use strict';

// scripts/verify-ai-cancellation-and-noshow-parity.js
// ════════════════════════════════════════════════════════════════════════════════
// CANCEL PREVIEW, NO-SHOW & AI CHATBOT INTEGRATION PARITY VERIFICATION SUITE
// ════════════════════════════════════════════════════════════════════════════════

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models');
const patientService = require('../src/services/patientService');
const doctorService = require('../src/services/doctorService');
const policyEngineService = require('../src/services/policyEngineService');
const { classifyIntent, INTENTS } = require('../src/services/aiIntentRouter');
const {
  handleGetMyBookings,
  handleGetAppointmentDetail,
  handlePrepareCancellationDraft,
} = require('../src/services/aiFunctionHandlers');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(`${colors.red}❌ FAILED:${colors.reset} ${message}`);
    throw new Error(message);
  }
  console.log(`${colors.green}  ✔ [PASS]${colors.reset} ${message}`);
};

async function runParitySuite() {
  console.log(`\n${colors.cyan}╔══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║  🎯 CANCELLATION PREVIEW, NO-SHOW & AI INTEGRATION PARITY VERIFIER  ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const createdFixtureIds = [];

  try {
    // ── 0. Chuẩn bị tài khoản test ──
    const patientA = await db.User.findOne({ where: { roleId: 'R3' } });
    assert(!!patientA, `Tìm thấy bệnh nhân test A (ID: ${patientA?.id})`);

    const patientB = await db.User.findOne({
      where: {
        roleId: 'R3',
        id: { [db.Sequelize.Op.ne]: patientA.id },
      },
    });
    assert(!!patientB, `Tìm thấy bệnh nhân test B (ID: ${patientB?.id})`);

    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    assert(!!doctor, `Tìm thấy bác sĩ test (ID: ${doctor?.id})`);

    // ── 1. TEST SUITE A: SERVER-SIDE CANCEL PREVIEW & TIME TIERS ──
    console.log(`\n${colors.bright}--- [PART 1: SERVER-SIDE CANCEL PREVIEW & POLICY TIERS] ---${colors.reset}`);

    // Tạo booking test trong tương lai (cách 48h -> tier 100%)
    const futureDate48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const booking48h = await db.Booking.create({
      token: 'test_token_' + Math.random().toString(36).substring(2),
      statusId: 'S2',
      doctorId: doctor.id,
      patientId: patientA.id,
      date: String(futureDate48h.getTime()),
      timeType: 'T1',
      bookingPrice: 200000,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      patientName: 'Test Patient A',
      bookingFor: 'SELF',
    });
    createdFixtureIds.push(booking48h.id);

    const preview48h = await patientService.getCancelPreview(booking48h.id, patientA.id);
    assert(preview48h.errCode === 0, 'getCancelPreview thành công cho booking 48h');
    assert(preview48h.data.refundRate === 100, 'Tỷ lệ hoàn trước 48h là 100%');
    assert(preview48h.data.refundAmount === 200000, 'Số tiền hoàn trước 48h là 200.000 VNĐ');

    // Test booking trong khoảng 18h tới (tier 75%)
    const futureDate18h = new Date(Date.now() + 18 * 60 * 60 * 1000);
    const preview18hCalc = policyEngineService.calculateRefundFromBookingSnapshot(
      { date: String(futureDate18h.getTime()), bookingPrice: 200000, createdAt: new Date() },
      new Date()
    );
    assert(preview18hCalc.appliedRefundPercent === 75, 'Mốc 18h trước giờ khám hoàn 75%');
    assert(preview18hCalc.refundAmount === 150000, 'Số tiền hoàn mốc 18h là 150.000 VNĐ');

    // Test booking trong khoảng 6h tới (tier 50%)
    const futureDate6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const preview6hCalc = policyEngineService.calculateRefundFromBookingSnapshot(
      { date: String(futureDate6h.getTime()), bookingPrice: 200000, createdAt: new Date() },
      new Date()
    );
    assert(preview6hCalc.appliedRefundPercent === 50, 'Mốc 6h trước giờ khám hoàn 50%');
    assert(preview6hCalc.refundAmount === 100000, 'Số tiền hoàn mốc 6h là 100.000 VNĐ');

    // ── 2. TEST SUITE B: IDOR PROTECTION ON PREVIEW & CANCEL ──
    console.log(`\n${colors.bright}--- [PART 2: IDOR SECURITY PROTECTION] ---${colors.reset}`);
    const idorPreview = await patientService.getCancelPreview(booking48h.id, patientB.id);
    assert(idorPreview.errCode === 2, 'Bệnh nhân B bị chặn không thể xem preview ca của Bệnh nhân A (errCode: 2)');

    const idorCancel = await patientService.cancelBooking(
      { bookingId: booking48h.id, reason: 'Tấn công IDOR' },
      patientB.id
    );
    assert(idorCancel.errCode === 2, 'Bệnh nhân B bị chặn không thể hủy ca của Bệnh nhân A (errCode: 2)');

    // ── 3. TEST SUITE C: CANCELLATION EXECUTION & IDEMPOTENCY ──
    console.log(`\n${colors.bright}--- [PART 3: CANCELLATION EXECUTION & IDEMPOTENCY] ---${colors.reset}`);
    const cancelResult = await patientService.cancelBooking(
      { bookingId: booking48h.id, reason: 'Bệnh nhân bận công tác' },
      patientA.id
    );
    assert(cancelResult.errCode === 0, 'Bệnh nhân A hủy lịch thành công');
    assert(cancelResult.data.refundRate === 100, 'Xác nhận hủy ghi nhận đúng refundRate 100%');
    assert(cancelResult.data.refundAmount === 200000, 'Xác nhận hủy ghi nhận đúng refundAmount 200.000 VNĐ');

    // Thử hủy lại lần 2 (Idempotency check)
    const cancelRetry = await patientService.cancelBooking(
      { bookingId: booking48h.id, reason: 'Thử hủy lần 2' },
      patientA.id
    );
    assert(cancelRetry.errCode === 0, 'Hủy lần 2 trả về thành công an toàn (No-Op)');
    assert(
      cancelRetry.message.includes('đã được hủy trước đó'),
      'Thông báo giải thích rõ lịch đã được hủy trước đó'
    );

    // ── 4. TEST SUITE D: NO-SHOW POLICY & EXPLANATION ALIGNMENT ──
    console.log(`\n${colors.bright}--- [PART 4: NO-SHOW MECHANISM & POLICY EXPLANATION] ---${colors.reset}`);
    const pastDate = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 tiếng trước
    const bookingNoShow = await db.Booking.create({
      token: 'test_token_' + Math.random().toString(36).substring(2),
      statusId: 'S2',
      doctorId: doctor.id,
      patientId: patientA.id,
      date: String(pastDate.getTime()),
      timeType: 'T1',
      bookingPrice: 400000,
      paymentStatus: 'paid',
      paymentMethod: 'WALLET',
      patientName: 'Test Patient A (No-Show)',
      bookingFor: 'SELF',
    });
    createdFixtureIds.push(bookingNoShow.id);

    // Bác sĩ xác nhận vắng mặt (No-Show)
    const docNoShowResult = await doctorService.cancelBooking({
      bookingId: bookingNoShow.id,
      doctorId: doctor.id,
      isNoShow: true,
      reason: 'PATIENT_NO_SHOW',
    });
    assert(docNoShowResult.errCode === 0, 'Bác sĩ đánh dấu vắng mặt (No-Show) thành công');

    const updatedNoShow = await db.Booking.findByPk(bookingNoShow.id);
    assert(updatedNoShow.statusId === 'S4', 'Ca No-Show chuyển trạng thái sang S4');
    assert(updatedNoShow.cancellationType === 'NO_SHOW', 'cancellationType là NO_SHOW');
    assert(updatedNoShow.cancellationReason === 'PATIENT_NO_SHOW', 'cancellationReason là PATIENT_NO_SHOW');

    // Kiểm tra policyEngineService tính toán cho No-Show
    const noShowCalc = policyEngineService.calculateRefundFromBookingSnapshot(
      updatedNoShow,
      new Date(),
      { cancellationReason: 'PATIENT_NO_SHOW' }
    );
    assert(noShowCalc.appliedRefundPercent === 75, 'Chính sách No-Show hoàn đúng 75% cho bệnh nhân');
    assert(noShowCalc.refundAmount === 300000, 'Số tiền hoàn No-Show là 300.000 VNĐ (75% của 400.000)');
    assert(
      noShowCalc.timingExplanation.includes('Bệnh nhân vắng mặt (No-Show)'),
      `timingExplanation giải thích đúng cơ chế No-Show: "${noShowCalc.timingExplanation}"`
    );

    // ── 5. TEST SUITE E: AI CHATBOT NO-SHOW & APPOINTMENT METADATA ──
    console.log(`\n${colors.bright}--- [PART 5: AI CHATBOT NO-SHOW METADATA & PARITY] ---${colors.reset}`);

    // handleGetMyBookings
    const aiBookings = await handleGetMyBookings({ limit: 5 }, patientA.id, null);
    assert(aiBookings.status === 'success', 'AI handleGetMyBookings thực thi thành công');
    const aiNoShowItem = aiBookings.bookings.find((b) => b.bookingId === bookingNoShow.id);
    assert(!!aiNoShowItem, 'AI tìm thấy ca No-Show trong danh sách');
    assert(aiNoShowItem.isNoShow === true, 'Cờ isNoShow trong AI trả về true');
    assert(Number(aiNoShowItem.refundRate) === 75, 'AI hiển thị đúng tỷ lệ hoàn 75%');

    // handleGetAppointmentDetail
    const aiDetail = await handleGetAppointmentDetail({ bookingId: bookingNoShow.id }, patientA.id, null);
    assert(aiDetail.status === 'success', 'AI handleGetAppointmentDetail thực thi thành công');
    assert(aiDetail.bookingStatus.isNoShow === true, 'Chi tiết ca khám nhận diện đúng isNoShow = true');
    assert(aiDetail.bookingStatus.statusLabel === 'Vắng mặt (No-Show)', 'statusLabel là "Vắng mặt (No-Show)"');
    assert(!!aiDetail.cancellation, 'Đối tượng cancellation được khởi tạo');
    assert(
      aiDetail.cancellation.reasonExplanation.includes('75%'),
      'cancellation.reasonExplanation giải thích rõ hoàn 75% vào ví'
    );

    // ── 6. TEST SUITE F: INTENT ROUTER NO-SHOW & POLICY SAFETY CLASSIFICATION ──
    console.log(`\n${colors.bright}--- [PART 6: INTENT ROUTER NO-SHOW CLASSIFICATION] ---${colors.reset}`);
    const noShowIntent1 = classifyIntent('Tôi quên không đi khám hôm qua có được hoàn tiền không?');
    assert(
      noShowIntent1.intent === INTENTS.POLICY_QUERY,
      `Câu hỏi quên đi khám nhận diện đúng POLICY_QUERY (Kết quả: ${noShowIntent1.intent})`
    );

    const noShowIntent2 = classifyIntent('Ca khám bị vắng mặt no-show thì xử lý thế nào?');
    assert(
      noShowIntent2.intent === INTENTS.POLICY_QUERY,
      `Câu hỏi vắng mặt no-show nhận diện đúng POLICY_QUERY (Kết quả: ${noShowIntent2.intent})`
    );

    const explicitCancelIntent = classifyIntent('Tôi muốn hủy lịch khám này');
    assert(
      explicitCancelIntent.intent === INTENTS.CANCEL_BOOKING_QUERY,
      `Hành động hủy lịch nhận diện đúng CANCEL_BOOKING_QUERY (Kết quả: ${explicitCancelIntent.intent})`
    );

    console.log(`\n${colors.green}══════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}🎉 TẤT CẢ 15/15 BÀI KIỂM ĐỊNH CANCEL PREVIEW & NO-SHOW ĐỀU PASS!${colors.reset}`);
    console.log(`${colors.green}══════════════════════════════════════════════════════════════════════${colors.reset}\n`);
  } finally {
    // Dọn dẹp fixtures an toàn
    for (const id of createdFixtureIds) {
      try {
        await db.Refund_Case.destroy({ where: { bookingId: id } });
        await db.Doctor_Settlement_Item.destroy({ where: { bookingId: id } });
        await db.Booking.destroy({ where: { id } });
      } catch (cleanErr) {
        console.warn(`[CLEANUP_WARN] Không thể dọn dẹp booking #${id}:`, cleanErr.message);
      }
    }
  }
}

runParitySuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi kiểm định:', err);
    process.exit(1);
  });
