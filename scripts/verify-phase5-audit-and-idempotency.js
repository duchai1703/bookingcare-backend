// bookingcare-backend/scripts/verify-phase5-audit-and-idempotency.js
// Kịch bản kiểm thử Phase 5: Audit Trail, Idempotency, Double-Refund Prevention & Role Authorization
'use strict';

require('dotenv').config();
const db = require('../src/models');
const doctorCancellationService = require('../src/services/doctorCancellationService');
const { getOrCreateWallet } = require('../src/services/walletService');

async function runPhase5Audit() {
  console.log('================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ PHASE 5: AUDIT, IDEMPOTENCY & SECURITY');
  console.log('================================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failedCount++;
    }
  }

  try {
    // 1. Chuẩn bị tài khoản
    const doctors = await db.User.findAll({ where: { roleId: 'R2' }, limit: 2 });
    if (doctors.length < 2) {
      throw new Error('Cần ít nhất 2 tài khoản bác sĩ để kiểm thử bảo mật IDOR');
    }
    const docA = doctors[0];
    const docB = doctors[1];

    const patient = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!patient) throw new Error('Không tìm thấy bệnh nhân để test');

    const clinic = await db.Clinic.findOne();
    const clinicId = clinic ? clinic.id : null;
    const testDate = '20261120'; // 20/11/2026

    // Dọn dẹp
    await db.Booking.destroy({ where: { doctorId: docA.id, date: testDate } });
    await db.Schedule.destroy({ where: { doctorId: docA.id, date: testDate } });

    console.log('👉 Bước 1: Khởi tạo 2 Schedule Slots và 2 Bookings đã thanh toán...');
    const sch1 = await db.Schedule.create({
      doctorId: docA.id,
      clinicId,
      date: testDate,
      timeType: 'T3',
      maxNumber: 5,
      currentNumber: 1,
      status: 'ACTIVE',
    });

    const sch2 = await db.Schedule.create({
      doctorId: docA.id,
      clinicId,
      date: testDate,
      timeType: 'T4',
      maxNumber: 5,
      currentNumber: 1,
      status: 'ACTIVE',
    });

    const book1 = await db.Booking.create({
      statusId: 'S2',
      doctorId: docA.id,
      patientId: patient.id,
      date: testDate,
      timeType: 'T3',
      token: `TOK_PHASE5_1_${Date.now()}`,
      bookingPrice: 400000,
      paymentMethod: 'WALLET',
      paymentStatus: 'paid',
      clinicId,
      patientName: 'Bệnh nhân Phase 5 - Ca 1',
    });

    const book2 = await db.Booking.create({
      statusId: 'S2',
      doctorId: docA.id,
      patientId: patient.id,
      date: testDate,
      timeType: 'T4',
      token: `TOK_PHASE5_2_${Date.now()}`,
      bookingPrice: 600000,
      paymentMethod: 'WALLET',
      paymentStatus: 'paid',
      clinicId,
      patientName: 'Bệnh nhân Phase 5 - Ca 2',
    });

    const walletBefore = await getOrCreateWallet(patient.id, 'PATIENT');
    const balanceBefore = Number(walletBefore.availableBalance) || 0;
    console.log(`  ℹ️ Số dư ban đầu Bệnh nhân #${patient.id}: ${balanceBefore.toLocaleString('vi-VN')} ₫\n`);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: BATCH CANCELLATION (PHÂN CẤP)
    // ─────────────────────────────────────────────────────────────
    console.log('👉 Bước 2: Kiểm thử Hủy Phân cấp / Hàng loạt (scope BATCH)...');
    const batchPreview = await doctorCancellationService.previewCancellation({
      doctorId: docA.id,
      clinicId,
      scope: 'BATCH',
      scheduleIds: [sch1.id],
      bookingIds: [book2.id],
    });

    assert(batchPreview.errCode === 0, 'Preview BATCH thành công');
    assert(batchPreview.data.affectedSlotsCount === 1, 'Preview BATCH nhận diện đúng 1 slot mục tiêu');
    assert(batchPreview.data.affectedBookingsCount === 2, 'Preview BATCH nhận diện đủ 2 bookings (1 từ slot + 1 chỉ định)');
    assert(batchPreview.data.totalRefundAmount === 1000000, 'Tổng tiền hoàn preview BATCH đúng 1.000.000 ₫');

    const batchExec = await doctorCancellationService.executeCancellation({
      doctorId: docA.id,
      clinicId,
      scope: 'BATCH',
      scheduleIds: [sch1.id],
      bookingIds: [book2.id],
      reason: 'Bác sĩ A bận tham gia hội thảo quốc tế đột xuất',
      cancelledBy: docA.id,
      cancelledByRole: 'DOCTOR',
    });

    assert(batchExec.errCode === 0, 'Thực thi executeCancellation BATCH thành công');
    assert(batchExec.data.affectedSlotsCount === 1, 'Đóng đúng 1 slot');
    assert(batchExec.data.affectedBookingsCount === 2, 'Hủy đúng 2 bookings');
    assert(batchExec.data.totalRefundAmount === 1000000, 'Hoàn đúng 1.000.000 ₫');

    const walletAfter = await getOrCreateWallet(patient.id, 'PATIENT');
    const balanceAfter = Number(walletAfter.availableBalance) || 0;
    assert(
      balanceAfter === balanceBefore + 1000000,
      `Ví bệnh nhân được cộng đúng +1.000.000 ₫ (Từ ${balanceBefore} -> ${balanceAfter})`
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 2: IDEMPOTENCY & DOUBLE-REFUND PREVENTION
    // ─────────────────────────────────────────────────────────────
    console.log('\n👉 Bước 3: Kiểm thử Tính Bất biến & Chống Hoàn Tiền Trùng (Idempotency)...');
    // Thử thực thi lại chính batch này một lần nữa
    const repeatExec = await doctorCancellationService.executeCancellation({
      doctorId: docA.id,
      clinicId,
      scope: 'BATCH',
      scheduleIds: [sch1.id],
      bookingIds: [book2.id],
      reason: 'Bác sĩ A bấm nhầm 2 lần liên tiếp',
      cancelledBy: docA.id,
      cancelledByRole: 'DOCTOR',
    });

    assert(repeatExec.errCode === 0, 'Hệ thống xử lý an toàn khi gọi lại lần 2');
    assert(repeatExec.data.affectedBookingsCount === 0, 'Số bookings bị ảnh hưởng lần 2 bằng 0 (đã hủy trước đó)');
    assert(repeatExec.data.totalRefundAmount === 0, 'Số tiền hoàn lần 2 bằng 0 ₫ (Không bị double-refund)');

    const walletRepeat = await getOrCreateWallet(patient.id, 'PATIENT');
    assert(
      Number(walletRepeat.availableBalance) === balanceAfter,
      'Số dư ví bệnh nhân giữ nguyên tuyệt đối, không phát sinh giao dịch trùng'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 3: DOUBLE-ENTRY LEDGER & IDEMPOTENCY KEY AUDIT
    // ─────────────────────────────────────────────────────────────
    console.log('\n👉 Bước 4: Kiểm tra Sổ cái Kép (Ledger) và Idempotency Key...');
    const ledgerTxs = await db.Wallet_Transaction.findAll({
      where: {
        walletId: walletAfter.id,
        referenceType: 'BOOKING',
        referenceId: [String(book1.id), String(book2.id)],
      },
    });

    assert(ledgerTxs.length === 2, 'Ghi nhận đúng 2 bút toán Sổ cái cho 2 ca hủy');
    for (const tx of ledgerTxs) {
      assert(tx.direction === 'CREDIT', `Bút toán #${tx.id} ghi Có (CREDIT)`);
      assert(tx.transactionType === 'REFUND', `Loại giao dịch là REFUND`);
      assert(tx.status === 'COMPLETED', `Trạng thái bút toán COMPLETED`);
      assert(
        tx.idempotencyKey && tx.idempotencyKey.startsWith('REFUND_DOC_CANCEL_'),
        `Có Idempotency Key bảo chứng: ${tx.idempotencyKey}`
      );
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: IDOR & ROLE-BASED ACCESS CONTROL
    // ─────────────────────────────────────────────────────────────
    console.log('\n👉 Bước 5: Kiểm thử Bảo mật IDOR & Quyền Bác sĩ / Admin...');
    // Bác sĩ B cố tình mở lại slot của Bác sĩ A
    const idorReopen = await doctorCancellationService.reopenSchedule({
      scheduleId: sch1.id,
      doctorId: docB.id,
      userRole: 'R2',
      userId: docB.id,
      reason: 'Bác sĩ B can thiệp trái phép',
    });
    assert(idorReopen.errCode === 403, 'Chặn thành công hành vi IDOR (Bác sĩ B không thể can thiệp slot Bác sĩ A)');

    // Bác sĩ A (chính chủ) mở lại slot
    const legitReopen = await doctorCancellationService.reopenSchedule({
      scheduleId: sch1.id,
      doctorId: docA.id,
      userRole: 'R2',
      userId: docA.id,
      reason: 'Hội thảo bị hoãn, bác sĩ A quay lại nhận bệnh nhân',
    });
    assert(legitReopen.errCode === 0, 'Bác sĩ chính chủ mở lại slot thành công');

    const sch1Updated = await db.Schedule.findByPk(sch1.id);
    assert(sch1Updated.status === 'ACTIVE', 'Schedule slot đã chuyển về trạng thái ACTIVE');
    assert(sch1Updated.currentNumber === 0, 'currentNumber được reset về 0 sẵn sàng đón lịch mới');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: ZERO DOCTOR DEBT & ZERO SETTLEMENT VERIFICATION
    // ─────────────────────────────────────────────────────────────
    console.log('\n👉 Bước 6: Kiểm tra Triệt tiêu Doanh thu & Công nợ Bác sĩ (Zero Debt)...');
    const updatedBook1 = await db.Booking.findByPk(book1.id);
    assert(Number(updatedBook1.doctorShare) === 0, 'Booking 1: doctorShare triệt tiêu về 0 ₫');
    assert(Number(updatedBook1.platformFee) === 0, 'Booking 1: platformFee triệt tiêu về 0 ₫');
    assert(updatedBook1.cancellationType === 'DOCTOR', 'Booking 1: cancellationType là DOCTOR');
    assert(updatedBook1.statusId === 'S4', 'Booking 1: statusId là S4');

    console.log('\n================================================================');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ PHASE 5: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình kiểm thử:', err);
    process.exit(1);
  }
}

runPhase5Audit();
