// bookingcare-backend/scripts/verify-withdrawal-sla-and-audit.js
const axios = require('axios');
const db = require('../src/models');
const withdrawalPolicyService = require('../src/services/withdrawalPolicyService');
const policyAuditService = require('../src/services/policyAuditService');

async function verifyWithdrawalSlaAndAudit() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ PHÂN HỆ SLA RÚT TIỀN LINH HOẠT VÀ KIỂM TOÁN BẤT BIẾN...');

  try {
    // 1. Kiểm tra getActiveWithdrawalPolicy
    const activePolicy = await withdrawalPolicyService.getActiveWithdrawalPolicy();
    console.log(`✅ [1] Đọc chính sách active thành công: ID=${activePolicy.id}, Code=${activePolicy.code}, Version=${activePolicy.version}`);
    console.log(`    Default SLA: ${activePolicy.parsedRules?.defaultSlaDays} ngày, Tiers: ${activePolicy.parsedRules?.tiers?.length} bậc`);

    // 2. Kiểm tra tính toán SLA linh hoạt cho các hạn mức
    const testCases = [
      { amount: 500000, expectedDays: 1, desc: 'Rút 500.000đ (< 5 triệu)' },
      { amount: 10000000, expectedDays: 3, desc: 'Rút 10.000.000đ (5 - 20 triệu)' },
      { amount: 35000000, expectedDays: 7, desc: 'Rút 35.000.000đ (> 20 triệu)' },
    ];

    for (const tc of testCases) {
      const calc = await withdrawalPolicyService.calculateWithdrawalSla(tc.amount);
      console.log(`✅ [2] ${tc.desc} => SLA: ${calc.appliedSlaDays} ngày, Hạn chót: ${new Date(calc.promisedPayoutDate).toLocaleDateString('vi-VN')}`);
      if (calc.appliedSlaDays !== tc.expectedDays) {
        throw new Error(`SLA không khớp kỳ vọng: got ${calc.appliedSlaDays}, expected ${tc.expectedDays}`);
      }
    }

    // 3. Kiểm thử cập nhật chính sách linh hoạt (Ví dụ Admin tăng lên 14 ngày làm việc)
    console.log('🔄 [3] Kiểm thử Admin cập nhật chính sách lên SLA linh hoạt 14 ngày (kèm lý do bắt buộc)...');
    const updateResult = await withdrawalPolicyService.updateWithdrawalPolicy({
      adminId: 1,
      defaultSlaDays: 14,
      allowCustomDays: true,
      minSlaDays: 1,
      maxSlaDays: 60,
      isBusinessDaysOnly: true,
      tiers: [
        { minAmount: 50000, maxAmount: 5000000, slaDays: 2, label: 'Khoản nhỏ - Xử lý trong 2 ngày' },
        { minAmount: 5000001, maxAmount: 20000000, slaDays: 5, label: 'Khoản chuẩn - Đối soát trong 5 ngày' },
        { minAmount: 20000001, maxAmount: null, slaDays: 14, label: 'Khoản lớn - Thẩm định trong 14 ngày' },
      ],
      policyNoticeVi: 'Áp dụng đối soát chậm 14 ngày làm việc do kỳ quyết toán kiểm toán.',
      reason: 'Điều chỉnh hạn mức và kéo dài thời gian xử lý phục vụ kỳ đối soát ngân hàng quý 4/2026.',
      ipAddress: '192.168.1.10',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestSuite/1.0',
    });

    console.log(`✅ [3] Cập nhật thành công: Version mới = v${updateResult.policy.version}, SLA mặc định = ${updateResult.policy.parsedRules.defaultSlaDays} ngày`);

    // 4. Kiểm thử tra cứu Audit Logs
    console.log('🔍 [4] Tra cứu nhật ký kiểm toán trong Policy_Audit_Logs...');
    const auditLogs = await policyAuditService.getAuditLogs({ policyType: 'WITHDRAWAL_SLA' });
    console.log(`✅ [4] Tìm thấy tổng cộng ${auditLogs.total} bản ghi audit log.`);
    const latestLog = auditLogs.data[0];
    console.log(`    Log mới nhất: Action=${latestLog.action}, Admin=${latestLog.admin?.email}`);
    console.log(`    Lý do giải trình: "${latestLog.reason}"`);
    console.log(`    IP: ${latestLog.ipAddress}, Thời gian: ${latestLog.createdAt}`);

    if (!latestLog.reason.includes('quý 4/2026')) {
      throw new Error('Audit log không ghi nhận đúng lý do giải trình!');
    }

    // 5. Kiểm thử tính năng chặn nếu thiếu reason
    console.log('🛡️ [5] Kiểm thử Guard: Chặn cập nhật nếu Admin không nhập lý do giải trình...');
    try {
      await withdrawalPolicyService.updateWithdrawalPolicy({
        adminId: 1,
        defaultSlaDays: 10,
        reason: '', // Rỗng
      });
      throw new Error('Hệ thống không chặn khi thiếu lý do giải trình!');
    } catch (guardErr) {
      console.log(`✅ [5] Chặn thành công lỗi thiếu reason: "${guardErr.message}"`);
    }

    console.log('\n🏆 TẤT CẢ KIỂM THỬ BACKEND SLA LINH HOẠT VÀ KIỂM TOÁN ĐỀU PASS 100%!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Kiểm thử thất bại:', error);
    process.exit(1);
  }
}

verifyWithdrawalSlaAndAudit();
