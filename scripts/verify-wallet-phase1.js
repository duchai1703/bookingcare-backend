// bookingcare-backend/scripts/verify-wallet-phase1.js
// Kiểm thử toàn diện Phân hệ Ví & Sổ cái Bất biến (Phase 1)
'use strict';

const crypto = require('crypto');
const qs = require('qs');
const db = require('../src/models');
const walletService = require('../src/services/walletService');

const VNP_HASH_SECRET = process.env.VNP_HASH_SECRET;

function sortObject(obj) {
  const sorted = {};
  const str = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (let key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
}

async function runTests() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ PHÂN HỆ VÍ & SỔ CÁI BẤT BIẾN (PHASE 1)...');
  let passed = 0;
  let failed = 0;

  try {
    // 1. Tìm hoặc tạo bệnh nhân thử nghiệm
    let testPatient = await db.User.findOne({ where: { roleId: 'R3' } });
    if (!testPatient) {
      testPatient = await db.User.create({
        email: `test_patient_${Date.now()}@example.com`,
        password: 'hash_password_test',
        firstName: 'Thử',
        lastName: 'Bệnh Nhân',
        roleId: 'R3',
      });
    }
    console.log(`👤 Bệnh nhân kiểm thử ID: ${testPatient.id} (${testPatient.email})`);

    // 2. Test getOrCreateWallet & getWalletOverview
    console.log('\n--- TEST 1: Khởi tạo Ví và đọc Tổng quan ---');
    const overview = await walletService.getWalletOverview(testPatient.id);
    if (overview.errCode === 0 && overview.data.currency === 'VND') {
      console.log(`✅ TEST 1 PASS: Ví #${overview.data.walletId} khởi tạo thành công. Số dư khả dụng: ${overview.data.availableBalance} VND`);
      passed++;
    } else {
      console.error('❌ TEST 1 FAIL:', overview);
      failed++;
    }

    const initialBalance = overview.data.availableBalance;

    // 3. Test createDepositPaymentUrl
    console.log('\n--- TEST 2: Tạo URL nạp tiền VNPay (100.000 VNĐ) ---');
    const depositAmount = 100000;
    const depositRes = await walletService.createDepositPaymentUrl(testPatient.id, {
      amount: depositAmount,
      ipAddr: '127.0.0.1',
      bankCode: 'NCB',
    });

    if (depositRes.errCode === 0 && depositRes.data.paymentUrl.includes('vnp_SecureHash=')) {
      console.log(`✅ TEST 2 PASS: Tạo URL thành công. Mã TxnRef: ${depositRes.data.txnRef}`);
      passed++;
    } else {
      console.error('❌ TEST 2 FAIL:', depositRes);
      failed++;
    }

    const txnRef = depositRes.data.txnRef;

    // 4. Test processVNPayDepositIPN (Simulate VNPay IPN Webhook)
    console.log('\n--- TEST 3: Giả lập Webhook VNPay IPN nạp tiền hợp lệ ---');
    const vnpParams = {
      vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: String(depositAmount * 100),
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: `VNP${Date.now()}`,
      vnp_CardType: 'ATM',
      vnp_PayDate: '20260930180000',
      vnp_OrderInfo: `Nap tien vi BookingCare ${txnRef}`,
      vnp_TransactionNo: `TRX_${Date.now()}`,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: txnRef,
      vnp_SecureHashType: 'SHA512',
    };

    // Ký chữ ký HMAC-SHA512 chuẩn VNPay (không bao gồm vnp_SecureHash và vnp_SecureHashType)
    const signObj = Object.assign({}, vnpParams);
    delete signObj.vnp_SecureHash;
    delete signObj.vnp_SecureHashType;

    const sorted = sortObject(signObj);
    const signData = qs.stringify(sorted, { encode: false });
    const signature = crypto
      .createHmac('sha512', VNP_HASH_SECRET)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');
    vnpParams.vnp_SecureHash = signature;

    const ipnRes = await walletService.processVNPayDepositIPN(vnpParams);
    if (ipnRes.RspCode === '00') {
      console.log('✅ TEST 3 PASS: VNPay IPN xác nhận thành công (RspCode: 00)');
      passed++;
    } else {
      console.error('❌ TEST 3 FAIL:', ipnRes);
      failed++;
    }

    // 5. Kiểm tra số dư và Sổ cái sau khi nạp
    console.log('\n--- TEST 4: Kiểm tra Số dư và Sổ cái Bất biến (Ledger Verification) ---');
    const updatedOverview = await walletService.getWalletOverview(testPatient.id);
    const expectedBalance = initialBalance + depositAmount;

    if (updatedOverview.data.availableBalance === expectedBalance) {
      console.log(`✅ TEST 4 PASS: Số dư ví tăng chính xác: ${initialBalance} -> ${updatedOverview.data.availableBalance} VND`);
      passed++;
    } else {
      console.error(`❌ TEST 4 FAIL: Kỳ vọng ${expectedBalance} nhưng nhận được ${updatedOverview.data.availableBalance}`);
      failed++;
    }

    const txHistory = await walletService.getWalletTransactions(testPatient.id, { page: 1, limit: 10 });
    const depositTx = txHistory.data.transactions.find((tx) => tx.idempotencyKey === `DEPOSIT_VNP_${txnRef}`);
    if (depositTx && depositTx.direction === 'CREDIT' && Number(depositTx.amount) === depositAmount) {
      console.log(`✅ TEST 4.1 PASS: Ghi sổ thành công: TxID ${depositTx.id}, Direction: ${depositTx.direction}, BalanceAfter: ${depositTx.balanceAfter}`);
      passed++;
    } else {
      console.error('❌ TEST 4.1 FAIL: Không tìm thấy giao dịch sổ cái tương ứng!');
      failed++;
    }

    // 6. Test Idempotency Guard (Chống nạp lặp đúp tiền khi VNPay gửi lại IPN)
    console.log('\n--- TEST 5: Khóa chống lặp (Idempotency Guard — VNPay gửi lại IPN lần 2) ---');
    const duplicateIpnRes = await walletService.processVNPayDepositIPN(vnpParams);
    const balanceAfterDuplicate = (await walletService.getWalletOverview(testPatient.id)).data.availableBalance;

    if (duplicateIpnRes.RspCode === '00' && balanceAfterDuplicate === expectedBalance) {
      console.log(`✅ TEST 5 PASS: Idempotency bảo vệ thành công! RspCode vẫn là 00 nhưng số dư KHÔNG bị cộng đúp: ${balanceAfterDuplicate} VND`);
      passed++;
    } else {
      console.error(`❌ TEST 5 FAIL: Rủi ro cộng đúp tiền! Số dư: ${balanceAfterDuplicate}`);
      failed++;
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passed} PASSED, ${failed} FAILED`);
    console.log('══════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Lỗi ngoại lệ trong quá trình kiểm thử:', error);
    process.exit(1);
  }
}

runTests();
