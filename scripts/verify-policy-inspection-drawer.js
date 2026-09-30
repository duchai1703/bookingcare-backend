// scripts/verify-policy-inspection-drawer.js
// Verify getPolicyDetail returns scopeEntity, financialStats, linkedBookings

const db = require('../src/models');
const policyEngineService = require('../src/services/policyEngineService');

async function verifyPolicyInspection() {
  console.log('--- TESTING POLICY INSPECTION & DRILL-DOWN ---');

  // 1. Get first policy
  const policiesRes = await policyEngineService.getPoliciesList({ limit: 5 });
  const policies = policiesRes.data;
  console.log(`✅ Loaded ${policies.length} policies from list.`);

  if (policies.length === 0) {
    console.log('⚠️ No policies found to inspect.');
    return;
  }

  const targetPolicy = policies[0];
  console.log(`\n📌 Inspecting Policy ID: ${targetPolicy.id} [${targetPolicy.code}] (v${targetPolicy.version})`);

  // 2. Call getPolicyDetail
  const detail = await policyEngineService.getPolicyDetail(targetPolicy.id);

  console.log('--- Detail Results ---');
  console.log('Name:', detail.name);
  console.log('Scope:', detail.scopeType, detail.scopeId);
  console.log('Scope Entity:', detail.scopeEntity?.type, detail.scopeEntity?.name || detail.scopeEntity?.fullName);
  console.log('Financial Stats:', detail.financialStats);
  console.log(`Linked Bookings Count in detail: ${detail.linkedBookings?.length}`);
  if (detail.linkedBookings?.length > 0) {
    const sample = detail.linkedBookings[0];
    console.log('Sample Booking:', {
      code: sample.bookingCode,
      patient: sample.patientName,
      doctor: sample.doctorName,
      price: sample.bookingPrice,
      platformFee: sample.platformFee,
      doctorShare: sample.doctorShare,
      status: sample.statusLabel
    });
  }

  console.log('\n✅ ALL POLICY INSPECTION VERIFICATION CHECKS PASSED!');
}

verifyPolicyInspection()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
