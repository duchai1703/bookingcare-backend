// scripts/verify-policy-engine.js
// Verification suite for Financial Policy Engine
const db = require('../src/models');
const policyEngineService = require('../src/services/policyEngineService');

async function main() {
  console.log('--- 1. Syncing Schema to PostgreSQL ---');
  await db.syncSchema();
  console.log('✅ Schema synced successfully!');

  console.log('\n--- 2. Seeding Default Policies If Empty ---');
  const seedResult = await policyEngineService.seedDefaultPoliciesIfEmpty();
  console.log('Seed result:', seedResult);

  console.log('\n--- 3. Testing Policy Resolution (GLOBAL) ---');
  const activeRevPolicy = await policyEngineService.resolveActivePolicy('REVENUE_SHARE', 'GLOBAL', null, new Date());
  console.log('Resolved Active Revenue Policy:', {
    id: activeRevPolicy?.id,
    code: activeRevPolicy?.code,
    version: activeRevPolicy?.version,
    name: activeRevPolicy?.name,
    rules: activeRevPolicy?.parsedRules,
  });

  const activeRefundPolicy = await policyEngineService.resolveActivePolicy('REFUND_RULE', 'GLOBAL', null, new Date());
  console.log('Resolved Active Refund Policy:', {
    id: activeRefundPolicy?.id,
    code: activeRefundPolicy?.code,
    version: activeRefundPolicy?.version,
    name: activeRefundPolicy?.name,
    rules: activeRefundPolicy?.parsedRules,
  });

  if (!activeRevPolicy || !activeRefundPolicy) {
    throw new Error('❌ Failed to resolve active policies!');
  }

  console.log('\n--- 4. Testing Freezing Booking Financials ---');
  const frozen = await policyEngineService.freezeBookingFinancials({
    doctorId: 1,
    clinicId: 1,
    totalAmount: 500000,
    bookingDate: new Date()
  });

  console.log('Frozen Financial Data:');
  console.log('  revenuePolicyId:', frozen.revenuePolicyId);
  console.log('  refundPolicyId:', frozen.refundPolicyId);
  console.log('  platformFee:', frozen.platformFee);
  console.log('  doctorShare:', frozen.doctorShare);
  console.log('  clinicShare:', frozen.clinicShare);
  console.log('  policySnapshot (parsed):', JSON.parse(frozen.policySnapshot));

  // Check sum equals total
  if (frozen.platformFee + frozen.doctorShare + frozen.clinicShare !== 500000) {
    throw new Error('❌ Frozen amounts do not sum up to 500,000!');
  }
  console.log('✅ Frozen sum validation passed (platformFee + doctorShare + clinicShare == 500,000)');

  // Verify isLocked is true
  const checkLocked = await db.Financial_Policy.findByPk(frozen.revenuePolicyId);
  console.log(`Policy #${checkLocked.id} isLocked:`, checkLocked.isLocked);
  if (!checkLocked.isLocked) {
    throw new Error('❌ Policy should be marked isLocked = true after being referenced by booking!');
  }
  console.log('✅ Policy locking validated successfully!');

  console.log('\n--- 5. Testing Policy Versioning (Creating v+1) ---');
  const v2 = await policyEngineService.createPolicyVersion(
    activeRevPolicy.id,
    {
      name: 'Chính sách Phân bổ Doanh thu Khuyến mãi Mùa hè (v2)',
      rules: {
        platformFeePercent: 12,
        doctorSharePercent: 88,
        clinicSharePercent: 0,
        note: 'Ưu đãi phí sàn giảm từ 15% xuống 12%'
      },
      effectiveFrom: new Date(),
      status: 'ACTIVE',
      description: 'Chương trình trợ giá bác sĩ quý 3'
    },
    1
  );

  console.log('Created Version 2:', {
    id: v2.id,
    code: v2.code,
    version: v2.version,
    status: v2.status,
    rules: JSON.parse(v2.rules),
    effectiveFrom: v2.effectiveFrom
  });

  // Verify v1 is now SUPERSEDED
  const checkV1 = await db.Financial_Policy.findByPk(activeRevPolicy.id);
  console.log('Previous Version 1 status:', checkV1.status, 'effectiveTo:', checkV1.effectiveTo);
  if (checkV1.status !== 'SUPERSEDED' || !checkV1.effectiveTo) {
    throw new Error('❌ Version 1 should be superseded with an effectiveTo timestamp!');
  }
  console.log('✅ Version immutability & retirement validated successfully!');

  console.log('\n--- 6. Testing Refund Calculation from Snapshot ---');
  const mockBooking = {
    date: Date.now() + 36 * 60 * 60 * 1000, // 36 hours in future
    bookingPrice: 500000,
    totalAmount: 500000,
    policySnapshot: frozen.policySnapshot
  };

  const refund36h = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, new Date());
  console.log('Refund for cancellation 36h before appointment (> 24h):', {
    hoursBefore: refund36h.hoursBefore,
    appliedRefundPercent: refund36h.appliedRefundPercent,
    refundAmount: refund36h.refundAmount,
    deductionAmount: refund36h.deductionAmount,
    isFrozenSnapshotUsed: refund36h.isFrozenSnapshotUsed
  });

  if (refund36h.appliedRefundPercent !== 100 || refund36h.refundAmount !== 500000) {
    throw new Error('❌ Expected 100% refund for > 24h cancellation!');
  }
  console.log('✅ Refund tier 1 (> 24h: 100%) validated successfully!');

  // Test 10 hours in future (< 12h tier)
  mockBooking.date = Date.now() + 10 * 60 * 60 * 1000;
  const refund10h = policyEngineService.calculateRefundFromBookingSnapshot(mockBooking, new Date());
  console.log('Refund for cancellation 10h before appointment (< 12h):', {
    hoursBefore: refund10h.hoursBefore,
    appliedRefundPercent: refund10h.appliedRefundPercent,
    refundAmount: refund10h.refundAmount,
    deductionAmount: refund10h.deductionAmount
  });

  if (refund10h.appliedRefundPercent !== 50 || refund10h.refundAmount !== 250000) {
    throw new Error('❌ Expected 50% refund for < 12h cancellation!');
  }
  console.log('✅ Refund tier 3 (< 12h: 50%) validated successfully!');

  console.log('\n======================================================');
  console.log('🎉 ALL FINANCIAL POLICY ENGINE TESTS PASSED 100%! 🎉');
  console.log('======================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
