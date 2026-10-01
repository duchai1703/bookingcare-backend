// bookingcare-backend/scripts/verify-doctor-cancellation.js
// Kịch bản kiểm thử toàn diện: Doctor Schedule Cancellation & Compensation Engine
'use strict';

require('dotenv').config();
const db = require('../src/models');
const doctorCancellationService = require('../src/services/doctorCancellationService');
const { getOrCreateWallet } = require('../src/services/walletService');

async function runVerification() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ: DOCTOR SCHEDULE CANCELLATION & COMPENSATION ENGINE...\n');
  let passedCount = 0;
  let failedCount = 0;

  try {
    // 1. Chuẩn bị dữ liệu mẫu (Doctor, Patient, Clinic)
    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) {
      throw new Error('Không tìm thấy bác sĩ (roleId R2) để test');
    }
    const patient = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!patient) {
      throw new Error('Không tìm thấy bệnh nhân (roleId R3) để test');
    }
    const clinic = await db.Clinic.findOne();
    const clinicId = clinic ? clinic.id : null;

    const testDate = '20261015'; // 15/10/2026

    // Dọn dẹp dữ liệu test cũ nếu có
    await db.Booking.destroy({ where: { doctorId: doctor.id, date: testDate } });
    await db.Schedule.destroy({ where: { doctorId: doctor.id, date: testDate } });

    // Tạo 2 schedule slots: T1 (08:00 - 09:00), T2 (09:00 - 10:00)
    const sch1 = await db.Schedule.create({
      doctorId: doctor.id,
      clinicId,
      date: testDate,
      timeType: 'T1',
      maxNumber: 10,
      currentNumber: 1,
      status: 'ACTIVE',
    });

    const sch2 = await db.Schedule.create({
      doctorId: doctor.id,
      clinicId,
      date: testDate,
      timeType: 'T2',
      maxNumber: 10,
      currentNumber: 1,
      status: 'ACTIVE',
    });

    // Tạo 2 bookings: B1 (slot T1, 500k), B2 (slot T2, 300k)
    const booking1 = await db.Booking.create({
      statusId: 'S2', // Confirmed
      doctorId: doctor.id,
      patientId: patient.id,
      date: testDate,
      timeType: 'T1',
      token: `TEST_TOKEN_${Date.now()}_1`,
      bookingPrice: 500000,
      paymentMethod: 'WALLET',
      paymentStatus: 'paid',
      clinicId,
      patientName: 'Bệnh nhân Test Hủy Slot',
    });

    const booking2 = await db.Booking.create({
      statusId: 'S2',
      doctorId: doctor.id,
      patientId: patient.id,
      date: testDate,
      timeType: 'T2',
      token: `TEST_TOKEN_${Date.now()}_2`,
      bookingPrice: 300000,
      paymentMethod: 'WALLET',
      paymentStatus: 'paid',
      clinicId,
      patientName: 'Bệnh nhân Test Hủy Ngày',
    });

    // Tạo ví bệnh nhân ban đầu và ghi nhận số dư
    const patientWallet = await getOrCreateWallet(patient.id, 'PATIENT');
    const initialBalance = Number(patientWallet.availableBalance) || 0;
    console.log(`ℹ️ Số dư ví ban đầu của Bệnh nhân #${patient.id}: ${initialBalance.toLocaleString('vi-VN')} VND`);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Xem trước ảnh hưởng (Impact Preview)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 1: Xem trước ảnh hưởng (Impact Preview) ---');
    
    // 1.1 Preview theo Slot
    const previewSlot = await doctorCancellationService.previewCancellation({
      doctorId: doctor.id,
      clinicId,
      scope: 'SLOT',
      date: testDate,
      timeType: 'T1',
    });

    if (
      previewSlot.errCode === 0 &&
      previewSlot.data.affectedSlotsCount === 1 &&
      previewSlot.data.affectedBookingsCount === 1 &&
      previewSlot.data.totalRefundAmount === 500000
    ) {
      console.log('✅ TEST 1.1 PASS: Preview theo Slot T1 chính xác (1 slot, 1 booking, 500.000 ₫)');
      passedCount++;
    } else {
      console.error('❌ TEST 1.1 FAIL:', previewSlot);
      failedCount++;
    }

    // 1.2 Preview theo Cả ngày
    const previewDay = await doctorCancellationService.previewCancellation({
      doctorId: doctor.id,
      clinicId,
      scope: 'DAY',
      date: testDate,
    });

    if (
      previewDay.errCode === 0 &&
      previewDay.data.affectedSlotsCount === 2 &&
      previewDay.data.affectedBookingsCount === 2 &&
      previewDay.data.totalRefundAmount === 800000
    ) {
      console.log('✅ TEST 1.2 PASS: Preview theo Cả ngày chính xác (2 slot, 2 booking, 800.000 ₫)');
      passedCount++;
    } else {
      console.error('❌ TEST 1.2 FAIL:', previewDay);
      failedCount++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Thực thi hủy 1 Slot & Hoàn tiền 100% về Ví Bệnh nhân
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Thực thi hủy Slot T1 & Hoàn tiền 100% về Ví ---');
    const execSlot = await doctorCancellationService.executeCancellation({
      doctorId: doctor.id,
      clinicId,
      scope: 'SLOT',
      date: testDate,
      timeType: 'T1',
      reason: 'Bác sĩ bận hội chẩn ca bệnh nặng tại khoa cấp cứu',
      cancelledBy: doctor.id,
      cancelledByRole: 'DOCTOR',
    });

    if (execSlot.errCode === 0) {
      console.log('✅ TEST 2.1 PASS: Thực thi executeCancellation thành công');
      passedCount++;
    } else {
      console.error('❌ TEST 2.1 FAIL:', execSlot);
      failedCount++;
    }

    // Kiểm tra Schedule slot T1
    await sch1.reload();
    if (sch1.status === 'CLOSED_BY_DOCTOR') {
      console.log('✅ TEST 2.2 PASS: Schedule slot T1 đã được cập nhật status = CLOSED_BY_DOCTOR');
      passedCount++;
    } else {
      console.error(`❌ TEST 2.2 FAIL: Schedule status is ${sch1.status}`);
      failedCount++;
    }

    // Kiểm tra Booking 1
    await booking1.reload();
    if (
      booking1.statusId === 'S4' &&
      booking1.cancellationType === 'DOCTOR' &&
      booking1.refundAmount === 500000 &&
      booking1.refundRate == 100.0 &&
      booking1.refundMethod === 'WALLET'
    ) {
      console.log('✅ TEST 2.3 PASS: Booking 1 chuyển S4, cancellationType=DOCTOR, hoàn 100% qua WALLET');
      passedCount++;
    } else {
      console.error('❌ TEST 2.3 FAIL: Booking status/cancellation info mismatch', booking1.toJSON());
      failedCount++;
    }

    // Kiểm tra Ví Bệnh nhân được cộng đúng +500.000 VND
    await patientWallet.reload();
    const balanceAfterSlot = Number(patientWallet.availableBalance) || 0;
    if (balanceAfterSlot === initialBalance + 500000) {
      console.log(`✅ TEST 2.4 PASS: Ví bệnh nhân được cộng đúng +500.000 ₫ (Từ ${initialBalance} -> ${balanceAfterSlot})`);
      passedCount++;
    } else {
      console.error(`❌ TEST 2.4 FAIL: Wallet balance mismatch: ${balanceAfterSlot} vs expected ${initialBalance + 500000}`);
      failedCount++;
    }

    // Kiểm tra Bút toán Sổ cái Wallet_Transaction
    const tx = await db.Wallet_Transaction.findOne({
      where: {
        walletId: patientWallet.id,
        referenceId: String(booking1.id),
        transactionType: 'REFUND',
      },
    });
    if (tx && Number(tx.amount) === 500000 && tx.direction === 'CREDIT' && tx.status === 'COMPLETED') {
      console.log(`✅ TEST 2.5 PASS: Sổ cái bất biến ghi nhận bút toán CREDIT +500.000 ₫ hoàn tiền tự động`);
      passedCount++;
    } else {
      console.error('❌ TEST 2.5 FAIL: Wallet_Transaction not found or invalid');
      failedCount++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Thực thi hủy Booking đơn lẻ còn lại (Booking 2)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Thực thi hủy Booking 2 đơn lẻ ---');
    const execBooking = await doctorCancellationService.executeCancellation({
      doctorId: doctor.id,
      clinicId,
      scope: 'BOOKING',
      bookingId: booking2.id,
      reason: 'Bác sĩ có lịch giảng dạy chuyên khoa đột xuất',
      cancelledBy: doctor.id,
      cancelledByRole: 'DOCTOR',
    });

    if (execBooking.errCode === 0) {
      console.log('✅ TEST 3.1 PASS: Hủy booking đơn lẻ thành công');
      passedCount++;
    } else {
      console.error('❌ TEST 3.1 FAIL:', execBooking);
      failedCount++;
    }

    await patientWallet.reload();
    const balanceAfterBooking2 = Number(patientWallet.availableBalance) || 0;
    if (balanceAfterBooking2 === balanceAfterSlot + 300000) {
      console.log(`✅ TEST 3.2 PASS: Ví bệnh nhân tiếp tục nhận +300.000 ₫ từ ca Booking 2 (Tổng số dư: ${balanceAfterBooking2} ₫)`);
      passedCount++;
    } else {
      console.error(`❌ TEST 3.2 FAIL: Wallet balance mismatch`);
      failedCount++;
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Tra cứu Lịch sử & Chi tiết Đợt Hủy (Cancellation Center)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Tra cứu Lịch sử & Chi tiết Master-Detail ---');
    const history = await doctorCancellationService.getCancellationHistory({
      doctorId: doctor.id,
      page: 1,
      limit: 5,
    });

    if (history.errCode === 0 && history.data.cancellations.length >= 2) {
      console.log(`✅ TEST 4.1 PASS: Lấy được danh sách lịch sử đợt hủy (${history.data.total} đợt)`);
      passedCount++;
    } else {
      console.error('❌ TEST 4.1 FAIL:', history);
      failedCount++;
    }

    const latestCancelId = execSlot.data.cancellationId;
    const detail = await doctorCancellationService.getCancellationDetail(latestCancelId);
    if (detail.errCode === 0 && detail.data && detail.data.targets.length >= 2) {
      console.log(`✅ TEST 4.2 PASS: Lấy chi tiết đợt hủy ${latestCancelId} kèm ${detail.data.targets.length} targets (Schedule & Booking)`);
      passedCount++;
    } else {
      console.error('❌ TEST 4.2 FAIL:', detail);
      failedCount++;
    }

    // Dọn dẹp dữ liệu test
    await db.Booking.destroy({ where: { doctorId: doctor.id, date: testDate } });
    await db.Schedule.destroy({ where: { doctorId: doctor.id, date: testDate } });

    console.log('\n══════════════════════════════════════════════════════');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('══════════════════════════════════════════════════════\n');

    process.exit(failedCount === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Lỗi runtime trong verify-doctor-cancellation:', err);
    process.exit(1);
  }
}

runVerification();
