// bookingcare-backend/scripts/sync-withdrawal-policy-and-audit.js
const db = require('../src/models');

async function syncAndSeedWithdrawalPolicy() {
  try {
    console.log('🔄 Đang kiểm tra và đồng bộ cấu trúc DB cho Policy_Audit_Logs và Withdrawal_Requests...');

    if (db.Policy_Audit_Log) {
      await db.Policy_Audit_Log.sync({ alter: true });
      console.log('✅ Bảng Policy_Audit_Logs đã đồng bộ thành công!');
    }

    if (db.Withdrawal_Request) {
      await db.Withdrawal_Request.sync({ alter: true });
      console.log('✅ Bảng Withdrawal_Requests đã đồng bộ (các cột SLA & Snapshot) thành công!');
    }

    // Kiểm tra xem chính sách WITHDRAWAL_SLA mặc định đã tồn tại chưa
    const existingPolicy = await db.Financial_Policy.findOne({
      where: {
        policyType: 'WITHDRAWAL_SLA',
        scopeType: 'GLOBAL',
        status: 'ACTIVE',
      },
    });

    if (!existingPolicy) {
      console.log('🌱 Đang tạo Chính sách Rút tiền Linh hoạt mặc định (v1)...');

      // Tìm một admin id hợp lệ
      const adminUser = await db.User.findOne({
        where: { roleId: 'R1' },
      });
      const adminId = adminUser ? adminUser.id : 1;

      const defaultRules = {
        defaultSlaDays: 7,
        allowCustomDays: true,
        minSlaDays: 1,
        maxSlaDays: 60,
        isBusinessDaysOnly: false,
        tiers: [
          { minAmount: 50000, maxAmount: 5000000, slaDays: 1, label: 'Hạn mức nhỏ (< 5 triệu) — Giải ngân nhanh trong 24h' },
          { minAmount: 5000001, maxAmount: 20000000, slaDays: 3, label: 'Hạn mức tiêu chuẩn (5 - 20 triệu) — Đối soát chuẩn trong 3 ngày' },
          { minAmount: 20000001, maxAmount: null, slaDays: 7, label: 'Hạn mức lớn (> 20 triệu) — Thẩm định giải ngân trong 7 ngày' },
        ],
        policyNoticeVi: 'Thời gian giải ngân từ 1 đến 7 ngày tùy thuộc vào hạn mức rút tiền và thời gian đối soát của ngân hàng thụ hưởng.',
      };

      const createdPolicy = await db.Financial_Policy.create({
        code: 'POL_WITHDRAWAL_SLA_GLOBAL',
        policyType: 'WITHDRAWAL_SLA',
        name: 'Chính Sách Cam Kết Thời Hạn Rút Tiền & Hoàn Tiền Toàn Sàn (SLA)',
        version: 1,
        scopeType: 'GLOBAL',
        scopeId: null,
        targetMode: 'ALL_DOCTORS',
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
        status: 'ACTIVE',
        rules: JSON.stringify(defaultRules),
        description: 'Chính sách chuẩn hóa cam kết thời gian hoàn tiền & giải ngân rút tiền ví nội bộ với SLA linh hoạt (1 - 60 ngày).',
        isLocked: false,
        createdById: adminId,
      });

      console.log(`✅ Đã khởi tạo chính sách WITHDRAWAL_SLA (ID: ${createdPolicy.id}, Version: 1)`);

      // Ghi nhận Audit Log ban đầu
      await db.Policy_Audit_Log.create({
        policyType: 'WITHDRAWAL_SLA',
        policyId: createdPolicy.id,
        action: 'CREATE',
        oldValue: null,
        newValue: JSON.stringify({
          name: createdPolicy.name,
          version: 1,
          rules: defaultRules,
          effectiveFrom: createdPolicy.effectiveFrom,
        }),
        reason: 'Khởi tạo chính sách SLA rút tiền linh hoạt mặc định toàn hệ thống BookingCare (Hỗ trợ 1 - 60 ngày).',
        adminId: adminId,
        ipAddress: '127.0.0.1',
        userAgent: 'System Seeder / Initial Engine Setup',
      });

      console.log('✅ Đã ghi nhận bản ghi Audit Trail khởi tạo đầu tiên vào Policy_Audit_Logs!');
    } else {
      console.log(`ℹ️ Chính sách WITHDRAWAL_SLA đã tồn tại (ID: ${existingPolicy.id}, Version: ${existingPolicy.version})`);
    }

    console.log('🎉 Hoàn tất đồng bộ schema và seed dữ liệu SLA & Audit Log!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ cấu trúc hoặc seed policy:', error);
    process.exit(1);
  }
}

syncAndSeedWithdrawalPolicy();
