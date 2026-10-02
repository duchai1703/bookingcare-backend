// bookingcare-backend/scripts/verify-wallet-phase3.js
// Bộ kiểm thử tích hợp tự động cho Phase 3:
// Luồng Rút tiền về Ngân hàng (Withdrawal Flow) & Kết nối Ví Bác sĩ (Doctor Settlements)
'use strict';

const db = require('../src/models');
const walletService = require('../src/services/walletService');
const doctorManageService = require('../src/services/doctorManageService');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runPhase3Tests() {
  console.log('\n🚀 BẮT ĐẦU KIỂM THỬ TÍCH HỢP TỰ ĐỘNG - FINANCIAL LEDGER PHASE 3');
  console.log('='.repeat(70));

  try {
    // 1. Chuẩn bị User Bệnh nhân (roleId: R3) và Bác sĩ (roleId: R2)
    const patientUser = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!patientUser) {
      throw new Error('Không tìm thấy tài khoản bệnh nhân (roleId: R3) trong database');
    }
    const doctorUser = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctorUser) {
      throw new Error('Không tìm thấy tài khoản bác sĩ (roleId: R2) trong database');
    }
    const adminUser = await db.User.findOne({ where: { roleId: 'R1' } }) || { id: 1 };

    console.log(`\n[SETUP] Kiểm thử với:`);
    console.log(`  - Bệnh nhân ID: #${patientUser.id} (${patientUser.email})`);
    console.log(`  - Bác sĩ ID:    #${doctorUser.id} (${doctorUser.email})`);
    console.log(`  - Admin ID:     #${adminUser.id}`);

    // Đảm bảo Bệnh nhân có tài khoản ngân hàng liên kết
    let [patientBank] = await db.PatientBankAccount.findOrCreate({
      where: { patientId: patientUser.id, accountNumber: '0071000998822' },
      defaults: {
        patientId: patientUser.id,
        bankName: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)',
        accountNumber: '0071000998822',
        accountHolderName: `${patientUser.lastName || ''} ${patientUser.firstName || ''}`.trim().toUpperCase() || 'NGUYEN VAN A',
        isPrimary: true,
      },
    });

    // 2. Chuẩn bị Ví Bệnh nhân và nạp tiền ban đầu
    const patientWallet = await walletService.getOrCreateWallet(patientUser.id, 'PATIENT');
    // Set số dư ban đầu 2.000.000đ để kiểm thử rút tiền
    await patientWallet.update({
      availableBalance: 2000000.0,
      reservedBalance: 0.0,
      status: 'ACTIVE',
    });

    console.log(`\n--- TEST 1: KHỞI TẠO VÍ & KIỂM TRA SỐ DƯ BAN ĐẦU ---`);
    const overview1 = await walletService.getWalletOverview(patientUser.id);
    assert(overview1.errCode === 0, 'Lấy thông tin tổng quan ví thành công');
    assert(Number(overview1.data.availableBalance) === 2000000, 'Số dư khả dụng ban đầu là 2.000.000 VNĐ');

    console.log(`\n--- TEST 2: KIỂM SOÁT VALIDATION HẠN MỨC RÚT TIỀN ---`);
    // 2.1 Rút dưới mức tối thiểu (< 50k)
    const resLow = await walletService.requestWithdrawal(patientUser.id, {
      amount: 30000,
      patientBankAccountId: patientBank.id,
    });
    assert(resLow.errCode === 1, 'Từ chối rút dưới 50.000 VNĐ (errCode 1)');

    // 2.2 Rút vượt quá số dư khả dụng (3 triệu > 2 triệu)
    const resExceed = await walletService.requestWithdrawal(patientUser.id, {
      amount: 3000000,
      patientBankAccountId: patientBank.id,
    });
    assert(resExceed.errCode === 6, 'Từ chối rút vượt quá số dư khả dụng (errCode 6)');

    console.log(`\n--- TEST 3: GỬI YÊU CẦU RÚT TIỀN HỢP LỆ (HOLD TIỀN VÀO RESERVED) ---`);
    // Bệnh nhân yêu cầu rút 500.000đ
    const resWithdraw1 = await walletService.requestWithdrawal(patientUser.id, {
      amount: 500000,
      patientBankAccountId: patientBank.id,
      userNote: 'Rút tiền thử nghiệm Test 3',
    });
    assert(resWithdraw1.errCode === 0, 'Gửi yêu cầu rút 500.000 VNĐ thành công');
    const req1 = resWithdraw1.data;
    assert(req1.status === 'PENDING', 'Yêu cầu có trạng thái PENDING');

    // Kiểm tra ví: available giảm 500k, reserved tăng 500k
    await patientWallet.reload();
    assert(Number(patientWallet.availableBalance) === 1500000, 'Available balance giảm đúng 500.000đ (còn 1.500.000đ)');
    assert(Number(patientWallet.reservedBalance) === 500000, 'Reserved balance tăng đúng 500.000đ (tạm giữ)');

    console.log(`\n--- TEST 4: BỆNH NHÂN TỰ HỦY YÊU CẦU RÚT TIỀN (HOÀN TRẢ SỐ DƯ KHẢ DỤNG) ---`);
    const resCancel = await walletService.cancelMyWithdrawalRequest(patientUser.id, req1.id, 'PATIENT');
    assert(resCancel.errCode === 0, 'Hủy yêu cầu rút tiền thành công');

    await patientWallet.reload();
    assert(Number(patientWallet.availableBalance) === 2000000, 'Số dư khả dụng được hoàn trả lại đủ 2.000.000đ');
    assert(Number(patientWallet.reservedBalance) === 0, 'Reserved balance trở về 0đ');

    console.log(`\n--- TEST 5: ADMIN PHÊ DUYỆT CHUYỂN KHOẢN & GHI SỔ CÁI BẤT BIẾN (TRANSFER) ---`);
    // Gửi yêu cầu rút mới 600.000đ
    const resWithdraw2 = await walletService.requestWithdrawal(patientUser.id, {
      amount: 600000,
      patientBankAccountId: patientBank.id,
      userNote: 'Rút tiền nhận qua Napas247',
    });
    const req2 = resWithdraw2.data;

    // Admin duyệt chuyển khoản
    const bankTxRef = `NAPAS247-PHASE3-${Date.now()}`;
    const resTransfer = await walletService.adminProcessWithdrawal(adminUser.id, {
      requestId: req2.id,
      action: 'TRANSFER',
      bankTransactionRef: bankTxRef,
      adminNote: 'Admin đã chuyển khoản thành công qua Napas247',
    });
    assert(resTransfer.errCode === 0, 'Admin xác nhận chuyển khoản thành công');
    assert(resTransfer.data.status === 'TRANSFERRED', 'Trạng thái yêu cầu cập nhật thành TRANSFERRED');
    assert(resTransfer.data.bankTransactionRef === bankTxRef, 'Mã giao dịch ngân hàng được lưu vết');

    // Kiểm tra ví: reserved giảm 600k, available giữ nguyên 1.400.000đ
    await patientWallet.reload();
    assert(Number(patientWallet.availableBalance) === 1400000, 'Available balance giữ nguyên 1.400.000đ sau khi tiền rời sàn');
    assert(Number(patientWallet.reservedBalance) === 0, 'Reserved balance được giải phóng về 0đ');

    // Kiểm tra Sổ cái Bất biến (Wallet_Transactions)
    const ledgerEntry = await db.Wallet_Transaction.findOne({
      where: {
        walletId: patientWallet.id,
        transactionType: 'WITHDRAWAL',
        referenceId: String(req2.id),
      },
    });
    assert(!!ledgerEntry, 'Bản ghi Sổ cái WITHDRAWAL được tạo thành công');
    assert(ledgerEntry.direction === 'DEBIT', 'Chiều giao dịch là DEBIT (tiền ra khỏi hệ thống)');
    assert(Number(ledgerEntry.amount) === 600000, 'Số tiền ghi sổ là 600.000 VNĐ');
    assert(Number(ledgerEntry.balanceAfter) === 1400000, 'Snapshot balanceAfter khớp 1.400.000 VNĐ');
    assert(ledgerEntry.idempotencyKey === `WITHDRAWAL_${req2.id}`, 'Khóa IdempotencyKey WITHDRAWAL_<id> chính xác');

    console.log(`\n--- TEST 6: ADMIN TỪ CHỐI YÊU CẦU RÚT TIỀN (REJECT & HOÀN TIỀN VÍ) ---`);
    // Gửi yêu cầu rút mới 400.000đ
    const resWithdraw3 = await walletService.requestWithdrawal(patientUser.id, {
      amount: 400000,
      patientBankAccountId: patientBank.id,
      userNote: 'Rút tiền kiểm thử từ chối',
    });
    const req3 = resWithdraw3.data;

    // Admin từ chối vì thông tin sai lệch
    const resReject = await walletService.adminProcessWithdrawal(adminUser.id, {
      requestId: req3.id,
      action: 'REJECT',
      adminNote: 'Tên chủ tài khoản không khớp với hồ sơ bệnh án đã xác minh',
    });
    assert(resReject.errCode === 0, 'Admin từ chối yêu cầu thành công');
    assert(resReject.data.status === 'REJECTED', 'Trạng thái chuyển thành REJECTED');

    // Kiểm tra ví: 400k được nhả từ reserved về available (1.400.000đ)
    await patientWallet.reload();
    assert(Number(patientWallet.availableBalance) === 1400000, 'Available balance được phục hồi nguyên vẹn 1.400.000đ');
    assert(Number(patientWallet.reservedBalance) === 0, 'Reserved balance trở về 0đ');

    console.log(`\n--- TEST 7: KẾT NỐI VÍ BÁC SĨ VÀ ĐỐI SOÁT DOCTOR SETTLEMENT (WALLET PAYOUT) ---`);
    // Khởi tạo Ví Bác sĩ
    const doctorWallet = await walletService.getOrCreateWallet(doctorUser.id, 'DOCTOR');
    const doctorInitialBalance = Number(doctorWallet.availableBalance) || 0;

    // Thực hiện thanh toán đối soát qua phương thức 'wallet'
    const payoutAmount = 1500000;
    const resPayout = await doctorManageService.createDoctorPayout({
      doctorId: doctorUser.id,
      amount: payoutAmount,
      paymentMethod: 'wallet',
      transactionRef: `WAL-SETTLE-${Date.now()}`,
      note: 'Thanh toán đối soát kỳ khám nửa đầu tháng vào Ví Bác sĩ',
      adminId: adminUser.id,
      periodFrom: '2026-09-01',
      periodTo: '2026-09-15',
    });

    assert(resPayout.errCode === 0, 'Tạo quyết toán đối soát kỳ khám thành công');
    const settlementRecord = resPayout.data;
    assert(settlementRecord.paymentMethod === 'wallet', 'Phương thức thanh toán là wallet');

    // Kiểm tra số dư ví bác sĩ đã tăng 1.500.000đ
    await doctorWallet.reload();
    const doctorNewBalance = Number(doctorWallet.availableBalance);
    assert(
      doctorNewBalance === doctorInitialBalance + payoutAmount,
      `Ví Bác sĩ được cộng đúng +1.500.000đ (Từ ${doctorInitialBalance}đ -> ${doctorNewBalance}đ)`
    );

    // Kiểm tra Sổ cái của Bác sĩ
    const docLedger = await db.Wallet_Transaction.findOne({
      where: {
        walletId: doctorWallet.id,
        transactionType: 'DOCTOR_SHARE',
        referenceId: String(settlementRecord.id),
      },
    });
    assert(!!docLedger, 'Bản ghi Sổ cái DOCTOR_SHARE trong Ví Bác sĩ được tạo thành công');
    assert(docLedger.direction === 'CREDIT', 'Chiều giao dịch là CREDIT (tiền vào)');
    assert(Number(docLedger.amount) === payoutAmount, 'Số tiền thù lao ghi sổ là 1.500.000đ');

    console.log(`\n--- TEST 8: BÁC SĨ YÊU CẦU RÚT TIỀN TỪ VÍ BÁC SĨ ---`);
    const docBankInfo = {
      bankName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)',
      accountNumber: '1241000889977',
      accountHolderName: 'BS. ' + (doctorUser.lastName + ' ' + doctorUser.firstName).toUpperCase(),
    };

    const resDocWithdraw = await walletService.requestWithdrawal(doctorUser.id, {
      amount: 1000000,
      bankInfo: docBankInfo,
      userNote: 'Bác sĩ rút thù lao khám bệnh về tài khoản BIDV',
      walletType: 'DOCTOR',
    });

    assert(resDocWithdraw.errCode === 0, 'Bác sĩ gửi yêu cầu rút 1.000.000đ từ Ví Bác sĩ thành công');
    const docWithdrawReq = resDocWithdraw.data;

    await doctorWallet.reload();
    assert(Number(doctorWallet.availableBalance) === doctorNewBalance - 1000000, 'Số dư khả dụng Ví Bác sĩ giảm 1.000.000đ');
    assert(Number(doctorWallet.reservedBalance) === 1000000, 'Tiền rút của Bác sĩ được tạm giữ (Hold) 1.000.000đ');

    // Admin duyệt chuyển khoản cho Bác sĩ
    const resDocTransfer = await walletService.adminProcessWithdrawal(adminUser.id, {
      requestId: docWithdrawReq.id,
      action: 'TRANSFER',
      bankTransactionRef: `BIDV-IBFT-${Date.now()}`,
      adminNote: 'Admin chuyển thù lao khám bệnh bác sĩ qua BIDV',
    });
    assert(resDocTransfer.errCode === 0, 'Admin hoàn tất duyệt chuyển khoản cho Bác sĩ');

    await doctorWallet.reload();
    assert(Number(doctorWallet.reservedBalance) === 0, 'Reserved balance Ví Bác sĩ được giải phóng về 0đ');

    console.log(`\n--- TEST 9: KIỂM TRA TRUY VẤN LỊCH SỬ VÀ THỐNG KÊ ADMIN ---`);
    const adminWithdrawList = await walletService.getAdminWithdrawalRequests({
      page: 1,
      limit: 10,
    });
    assert(adminWithdrawList.errCode === 0, 'Admin truy vấn danh sách rút tiền thành công');
    assert(adminWithdrawList.data.total >= 4, 'Tổng số yêu cầu rút tiền được ghi nhận đầy đủ');
    assert(adminWithdrawList.data.stats.totalRequests >= 4, 'Thống kê tổng số yêu cầu chính xác');

    console.log('\n' + '='.repeat(70));
    console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests} PASSED / ${failedTests} FAILED`);
    if (failedTests === 0) {
      console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ TÍCH HỢP PHASE 3 ĐỀU THÀNH CÔNG (100% PASS)!');
      process.exit(0);
    } else {
      console.error('⚠️ Có bài kiểm thử thất bại, vui lòng kiểm tra lại log!');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 LỖI KHÔNG MONG MUỐN TRONG QUÁ TRÌNH KIỂM THỬ:', error);
    process.exit(1);
  }
}

runPhase3Tests();
