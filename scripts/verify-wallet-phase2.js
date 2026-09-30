// bookingcare-backend/scripts/verify-wallet-phase2.js
// Kiểm thử toàn diện Phase 2: Đặt lịch thanh toán bằng Ví (Hold/Capture) & Tự động hoàn tiền 100% khi hủy (Zero-Admin Refund)
'use strict';

const db = require('../src/models');
const patientService = require('../src/services/patientService');
const walletService = require('../src/services/walletService');

async function runTests() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 2: TÍCH HỢP ĐẶT LỊCH VỚI VÍ & TỰ ĐỘNG HOÀN TIỀN...');
  let passed = 0;
  let failed = 0;

  try {
    // 1. Chuẩn bị Bệnh nhân, Bác sĩ và Lịch khám kiểm thử
    let testPatient = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!testPatient) {
      testPatient = await db.User.create({
        email: `patient_p2_${Date.now()}@example.com`,
        password: 'hash_test_p2',
        firstName: 'Văn',
        lastName: 'Bệnh Nhân P2',
        roleId: 'R3',
      });
    }

    let testDoctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!testDoctor) {
      testDoctor = await db.User.create({
        email: `doctor_p2_${Date.now()}@example.com`,
        password: 'hash_test_p2',
        firstName: 'Tuấn',
        lastName: 'Bác Sĩ',
        roleId: 'R2',
      });
    }

    const testDate = String(new Date().setHours(0, 0, 0, 0) + 86400000 * 3); // 3 ngày sau
    const testTimeType = 'T1';

    let schedule = await db.Schedule.findOne({
      where: { doctorId: testDoctor.id, date: testDate, timeType: testTimeType },
    });
    if (!schedule) {
      schedule = await db.Schedule.create({
        doctorId: testDoctor.id,
        date: testDate,
        timeType: testTimeType,
        maxNumber: 10,
        currentNumber: 0,
      });
    }

    const initialCurrentNumber = schedule.currentNumber;

    // 2. Lấy giá khám thực tế của bác sĩ và Nạp đủ tiền vào ví
    const doctorInfor = await db.Doctor_Info.findOne({
      where: { doctorId: testDoctor.id },
      include: [{ model: db.Allcode, as: 'priceData' }],
    });
    let priceStr = doctorInfor?.priceData?.valueVi || '200000';
    const bookingPrice = parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 200000;

    const wallet = await walletService.getOrCreateWallet(testPatient.id, 'PATIENT');
    const initialAvailable = bookingPrice + 500000;
    await wallet.update({ availableBalance: initialAvailable, reservedBalance: 0 });
    console.log(`👤 Bệnh nhân ID #${testPatient.id}, Giá khám bác sĩ: ${bookingPrice} VND, Đã cấp số dư: ${initialAvailable} VND`);

    // --- TEST 1: ĐẶT LỊCH THANH TOÁN BẰNG VÍ BOOKINGCARE ---
    console.log('\n--- TEST 1: Đặt lịch khám chọn PAYMENT_METHOD = WALLET ---');
    const bookRes = await patientService.postBookAppointment({
      doctorId: testDoctor.id,
      date: testDate,
      timeType: testTimeType,
      fullName: 'Nguyễn Văn Test',
      phoneNumber: '0987654321',
      email: testPatient.email,
      bookingPrice: bookingPrice,
      paymentMethod: 'WALLET',
    }, testPatient.id);

    if (bookRes.errCode === 0 && bookRes.data?.paymentMethod === 'WALLET') {
      console.log(`✅ TEST 1 PASS: Đặt lịch thành công! Mã booking: #${bookRes.data.bookingId}, Status: ${bookRes.data.statusId}`);
      passed++;
    } else {
      console.error('❌ TEST 1 FAIL:', bookRes);
      failed++;
    }

    const bookingId = bookRes.data.bookingId;

    // --- TEST 2: KIỂM TRA SỐ DƯ, WALLET_HOLD & SỔ CÁI BẤT BIẾN ---
    console.log('\n--- TEST 2: Kiểm tra Trừ Available, Cộng Reserved, Wallet_Hold & Sổ cái DEBIT ---');
    const updatedWallet = await db.Wallet.findByPk(wallet.id);
    const expectedAvailAfterBook = initialAvailable - bookingPrice;

    if (
      Number(updatedWallet.availableBalance) === expectedAvailAfterBook &&
      Number(updatedWallet.reservedBalance) >= bookingPrice
    ) {
      console.log(`✅ TEST 2.1 PASS: Số dư chuyển đổi chính xác! Avail: ${updatedWallet.availableBalance} VND, Reserved: ${updatedWallet.reservedBalance} VND`);
      passed++;
    } else {
      console.error(`❌ TEST 2.1 FAIL: Kỳ vọng Avail=${expectedAvailAfterBook}, thực tế=${updatedWallet.availableBalance}`);
      failed++;
    }

    const holdRecord = await db.Wallet_Hold.findOne({
      where: { bookingId, status: 'HELD' },
    });
    if (holdRecord && Number(holdRecord.amount) === bookingPrice) {
      console.log(`✅ TEST 2.2 PASS: Wallet_Hold tạo thành công (HoldID: ${holdRecord.id}, Status: ${holdRecord.status})`);
      passed++;
    } else {
      console.error('❌ TEST 2.2 FAIL: Không tìm thấy bản ghi Wallet_Hold hợp lệ!');
      failed++;
    }

    const debitTx = await db.Wallet_Transaction.findOne({
      where: { idempotencyKey: `BOOKING_PAY_${bookingId}` },
    });
    if (debitTx && debitTx.direction === 'DEBIT' && Number(debitTx.amount) === bookingPrice) {
      console.log(`✅ TEST 2.3 PASS: Sổ cái ghi nhận DEBIT thành công (TxID: ${debitTx.id}, BalanceAfter: ${debitTx.balanceAfter})`);
      passed++;
    } else {
      console.error('❌ TEST 2.3 FAIL: Không tìm thấy giao dịch sổ cái DEBIT tương ứng!');
      failed++;
    }

    // Kiểm tra slot lịch đã tăng
    const updatedScheduleAfterBook = await db.Schedule.findByPk(schedule.id);
    if (updatedScheduleAfterBook.currentNumber === initialCurrentNumber + 1) {
      console.log(`✅ TEST 2.4 PASS: Slot khám đã tăng tự động: ${initialCurrentNumber} -> ${updatedScheduleAfterBook.currentNumber}`);
      passed++;
    } else {
      console.error('❌ TEST 2.4 FAIL: Slot khám không tăng chính xác!');
      failed++;
    }

    // --- TEST 3: HỦY LỊCH & TỰ ĐỘNG HOÀN TIỀN VÀO VÍ (ZERO-ADMIN REFUND) ---
    console.log('\n--- TEST 3: Bệnh nhân Hủy Lịch -> Tự động Hoàn tiền 100% vào Ví (Zero-Admin) ---');
    const cancelRes = await patientService.cancelBooking({ bookingId }, testPatient.id);

    if (
      cancelRes.errCode === 0 &&
      cancelRes.data?.refundStatus === 'completed' &&
      cancelRes.data?.refundMethod === 'WALLET'
    ) {
      console.log(`✅ TEST 3.1 PASS: Hủy lịch thành công! RefundStatus: ${cancelRes.data.refundStatus}, RefundMethod: ${cancelRes.data.refundMethod}, Hoàn: ${cancelRes.data.refundAmount} VND`);
      passed++;
    } else {
      console.error('❌ TEST 3.1 FAIL: Hoàn tiền tự động thất bại:', cancelRes);
      failed++;
    }

    // Kiểm tra số dư ví sau khi hủy: Available phải được cộng lại, Reserved phải giảm
    const walletAfterCancel = await db.Wallet.findByPk(wallet.id);
    const holdAfterCancel = await db.Wallet_Hold.findOne({ where: { bookingId } });

    if (holdAfterCancel && holdAfterCancel.status === 'RELEASED') {
      console.log(`✅ TEST 3.2 PASS: Wallet_Hold đã tự động chuyển sang RELEASED`);
      passed++;
    } else {
      console.error('❌ TEST 3.2 FAIL: Wallet_Hold không ở trạng thái RELEASED:', holdAfterCancel?.status);
      failed++;
    }

    if (Number(walletAfterCancel.availableBalance) === initialAvailable) {
      console.log(`✅ TEST 3.3 PASS: Tiền hoàn về khả dụng đúng 100%: ${walletAfterCancel.availableBalance} VND`);
      passed++;
    } else {
      console.error(`❌ TEST 3.3 FAIL: Tiền hoàn không khớp: ${walletAfterCancel.availableBalance}`);
      failed++;
    }

    // Kiểm tra Sổ cái giao dịch REFUND
    const refundTx = await db.Wallet_Transaction.findOne({
      where: { idempotencyKey: `REFUND_WALLET_${bookingId}` },
    });
    if (refundTx && refundTx.direction === 'CREDIT' && refundTx.transactionType === 'REFUND') {
      console.log(`✅ TEST 3.4 PASS: Sổ cái bất biến ghi nhận giao dịch REFUND thành công (TxID: ${refundTx.id}, +${refundTx.amount} VND)`);
      passed++;
    } else {
      console.error('❌ TEST 3.4 FAIL: Không tìm thấy giao dịch sổ cái REFUND!');
      failed++;
    }

    // Kiểm tra slot lịch đã giảm lại
    const scheduleAfterCancel = await db.Schedule.findByPk(schedule.id);
    if (scheduleAfterCancel.currentNumber === initialCurrentNumber) {
      console.log(`✅ TEST 3.5 PASS: Slot khám đã tự động giải phóng: ${scheduleAfterCancel.currentNumber}`);
      passed++;
    } else {
      console.error('❌ TEST 3.5 FAIL: Slot khám không giảm lại:', scheduleAfterCancel.currentNumber);
      failed++;
    }

    // --- TEST 4: CHẶN ĐẶT LỊCH KHI SỐ DƯ VÍ KHÔNG ĐỦ ---
    console.log('\n--- TEST 4: Chặn đặt lịch khi số dư ví không đủ (Negative Balance Guard) ---');
    // Rút hết tiền trong ví về 0
    await walletAfterCancel.update({ availableBalance: 1000 });
    const failBookRes = await patientService.postBookAppointment({
      doctorId: testDoctor.id,
      date: testDate,
      timeType: testTimeType,
      fullName: 'Nguyễn Văn Test',
      phoneNumber: '0987654321',
      email: testPatient.email,
      bookingPrice: 500000,
      paymentMethod: 'WALLET',
    }, testPatient.id);

    if (failBookRes.errCode === -10) {
      console.log(`✅ TEST 4 PASS: Hệ thống chặn đúng chuẩn khi thiếu tiền (Thông báo: "${failBookRes.message}")`);
      passed++;
    } else {
      console.error('❌ TEST 4 FAIL: Không chặn được khi số dư không đủ:', failBookRes);
      failed++;
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ PHASE 2: ${passed} PASSED, ${failed} FAILED`);
    console.log('══════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Lỗi ngoại lệ trong quá trình kiểm thử:', error);
    process.exit(1);
  }
}

runTests();
