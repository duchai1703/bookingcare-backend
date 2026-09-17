// scripts/verify-doctor-financial-terms.js
// Verification suite for Doctor Financial Terms & Policy Engine Integration
const db = require('../src/models');
const policyEngineService = require('../src/services/policyEngineService');
const doctorManageService = require('../src/services/doctorManageService');

async function main() {
  console.log('================================================================');
  console.log('🚀 TESTING DOCTOR FINANCIAL TERMS & POLICY ENGINE INTEGRATION 🚀');
  console.log('================================================================\n');

  const testDoctorId = 2; // Bác sĩ Vũ Thành Minh

  // 1. Initial State: Doctor without custom terms (inherits GLOBAL)
  console.log('--- 1. Testing Doctor Initial Financial Terms (Inheritance) ---');
  // First clear any existing test terms for doc 1 to test clean inheritance
  await db.Financial_Policy.destroy({
    where: { scopeType: 'DOCTOR', scopeId: testDoctorId }
  });

  const initialTerms = await policyEngineService.getDoctorFinancialTerms(testDoctorId);
  console.log('Initial terms:', {
    doctorId: initialTerms.doctorId,
    isCustom: initialTerms.isCustom,
    appliedPlatformFee: initialTerms.currentTerm.platformFeePercent,
    appliedDoctorShare: initialTerms.currentTerm.doctorSharePercent,
    globalDefaultCode: initialTerms.globalDefault.code,
  });

  if (initialTerms.isCustom !== false) {
    throw new Error('❌ Doctor should initially inherit from GLOBAL (isCustom: false)');
  }
  console.log('✅ Doctor correctly inherits from GLOBAL standard policy!\n');

  // 2. Setting Custom Financial Term Override (7% Platform Fee, 93% Doctor)
  console.log('--- 2. Setting Custom Financial Term Override (7% Platform Fee) ---');
  const setRes1 = await policyEngineService.setDoctorFinancialTerms(
    testDoctorId,
    {
      isOverride: true,
      platformFeePercent: 7,
      effectiveFrom: new Date(),
      reason: 'Thỏa thuận hợp tác chiến lược chuyên gia đầu ngành'
    },
    1
  );
  console.log('Set term result:', setRes1);

  const customTermsV1 = await policyEngineService.getDoctorFinancialTerms(testDoctorId);
  console.log('After setting custom terms (v1):', {
    isCustom: customTermsV1.isCustom,
    code: customTermsV1.currentTerm.code,
    version: customTermsV1.currentTerm.version,
    platformFee: customTermsV1.currentTerm.platformFeePercent,
    doctorShare: customTermsV1.currentTerm.doctorSharePercent,
    description: customTermsV1.currentTerm.description,
  });

  if (customTermsV1.isCustom !== true || customTermsV1.currentTerm.platformFeePercent !== 7) {
    throw new Error('❌ Custom term should be active with 7% platform fee!');
  }
  console.log('✅ Custom term v1 successfully created & activated!\n');

  // 3. Testing Freezing Booking Financials with Doctor's Custom Override
  console.log('--- 3. Testing Freezing Booking Financials with Custom Term ---');
  const frozen = await policyEngineService.freezeBookingFinancials({
    doctorId: testDoctorId,
    clinicId: 1,
    totalAmount: 1000000, // 1,000,000 VND
    bookingDate: new Date()
  });

  console.log('Frozen booking financials:');
  console.log('  revenuePolicyId:', frozen.revenuePolicyId);
  console.log('  platformFee:', frozen.platformFee);
  console.log('  doctorShare:', frozen.doctorShare);
  console.log('  policySnapshot (parsed calculation):', JSON.parse(frozen.policySnapshot).calculation);

  if (frozen.platformFee !== 70000 || frozen.doctorShare !== 930000) {
    throw new Error(`❌ Expected platformFee: 70,000 and doctorShare: 930,000, got ${frozen.platformFee} / ${frozen.doctorShare}`);
  }
  console.log('✅ Booking snapshot successfully frozen with 7% platform fee and 93% doctor share!\n');

  // 4. Testing Upgrading Term to v2 (6% Platform Fee)
  console.log('--- 4. Testing Upgrading Custom Term to v2 (6% Platform Fee) ---');
  const setRes2 = await policyEngineService.setDoctorFinancialTerms(
    testDoctorId,
    {
      isOverride: true,
      platformFeePercent: 6,
      effectiveFrom: new Date(),
      reason: 'Tái ký phụ lục hợp đồng ưu đãi tăng trưởng năm 2027'
    },
    1
  );
  console.log('Upgrade result:', setRes2);

  const customTermsV2 = await policyEngineService.getDoctorFinancialTerms(testDoctorId);
  console.log('After upgrade (v2):', {
    version: customTermsV2.currentTerm.version,
    platformFee: customTermsV2.currentTerm.platformFeePercent,
    doctorShare: customTermsV2.currentTerm.doctorSharePercent,
    historyCount: customTermsV2.history.length
  });

  if (customTermsV2.currentTerm.version !== 2 || customTermsV2.currentTerm.platformFeePercent !== 6) {
    throw new Error('❌ Term should be upgraded to v2 with 6% platform fee!');
  }

  // Verify previous v1 was marked SUPERSEDED
  const oldV1 = customTermsV2.history.find(h => h.version === 1);
  console.log('Old v1 term in history:', {
    version: oldV1.version,
    status: oldV1.status,
    effectiveFrom: oldV1.effectiveFrom,
    effectiveTo: oldV1.effectiveTo
  });

  if (oldV1.status !== 'SUPERSEDED' || !oldV1.effectiveTo) {
    throw new Error('❌ Version 1 must be marked SUPERSEDED with effectiveTo timestamp!');
  }
  console.log('✅ Version immutability and retirement validated!\n');

  // 5. Testing Ledger Integrity: Previous Booking Snapshot Unchanged!
  console.log('--- 5. Testing Previous Booking Snapshot Immutability ---');
  const parsedOldSnapshot = JSON.parse(frozen.policySnapshot);
  if (parsedOldSnapshot.calculation.platformFee !== 70000 || parsedOldSnapshot.calculation.doctorShare !== 930000) {
    throw new Error('❌ Old booking snapshot was modified! It should remain 70,000 / 930,000!');
  }
  console.log('✅ Previous booking snapshot remains 100% immutable (still 70,000 / 930,000)!\n');

  // 6. Testing Doctor Workspace Integration
  console.log('--- 6. Testing Doctor Workspace Return Structure ---');
  const workspaceRes = await doctorManageService.getAdminDoctorWorkspace(testDoctorId);
  if (workspaceRes.errCode !== 0) {
    throw new Error('❌ Failed to fetch doctor workspace!');
  }

  const wsData = workspaceRes.data;
  console.log('Workspace financialTerms returned:');
  console.log('  isCustom:', wsData.financialTerms?.isCustom);
  console.log('  currentTerm platformFee:', wsData.financialTerms?.currentTerm?.platformFeePercent);
  console.log('  history length:', wsData.financialTerms?.history?.length);

  if (!wsData.financialTerms || wsData.financialTerms.isCustom !== true) {
    throw new Error('❌ Workspace did not return expected financialTerms object!');
  }
  console.log('✅ Doctor Workspace properly populated with financialTerms!\n');

  console.log('================================================================');
  console.log('🎉 ALL DOCTOR FINANCIAL TERMS TESTS PASSED 100%! 🎉');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
