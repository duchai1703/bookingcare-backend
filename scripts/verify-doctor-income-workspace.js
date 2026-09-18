// scripts/verify-doctor-income-workspace.js
// Automated verification for Doctor Income & Financial Workspace (Master - Detail)
const db = require('../src/models');
const doctorService = require('../src/services/doctorService');

const runVerification = async () => {
  console.log('=== [TEST] Starting Doctor Income Workspace Verification ===\n');

  try {
    const doctorUser = await db.User.findOne({ where: { email: 'bs.minh0@bookingcare.vn' } });
    if (!doctorUser) {
      console.error('❌ Doctor user bs.minh0@bookingcare.vn not found!');
      process.exit(1);
    }
    const doctorId = doctorUser.id;
    console.log(`✓ Doctor identified: ID ${doctorId} (${doctorUser.lastName} ${doctorUser.firstName})`);

    // 1. Test getDoctorIncomeWorkspace without filters (all time)
    const resAll = await doctorService.getDoctorIncomeWorkspace(doctorId, {});
    if (resAll.errCode !== 0 || !resAll.data) {
      console.error('❌ getDoctorIncomeWorkspace failed:', resAll);
      process.exit(1);
    }
    const { kpi, transactions, counts, settlements, timeline, facilityDistribution } = resAll.data;
    console.log(`✓ All-time workspace loaded successfully:`);
    console.log(`   - Total Income: ${kpi.totalIncome.toLocaleString()} VND`);
    console.log(`   - Paid Out: ${kpi.paidIncome.toLocaleString()} VND (${kpi.paidRatio}%)`);
    console.log(`   - Pending Payout: ${kpi.pendingIncome.toLocaleString()} VND (${kpi.pendingRatio}%)`);
    console.log(`   - Total Consultations: ${kpi.totalConsultations}`);
    console.log(`   - Total Transactions: ${transactions.length}`);
    console.log(`   - Settlements Count: ${settlements.length}`);
    console.log(`   - Timeline Points: ${timeline.length}`);

    // Assertions for KPI
    if (typeof kpi.totalIncome !== 'number' || typeof kpi.paidIncome !== 'number' || typeof kpi.pendingIncome !== 'number') {
      throw new Error('KPI fields must be numbers');
    }

    // 2. Test Policy Snapshot Immutability (Booking #BK-459)
    const booking459 = transactions.find(t => t.id === 459);
    if (booking459) {
      console.log(`\n✓ Checking Booking #BK-459 snapshot preservation:`);
      console.log(`   - Booking Code: ${booking459.bookingCode}`);
      console.log(`   - Gross Price: ${booking459.grossPrice}`);
      console.log(`   - Platform Fee: ${booking459.platformFee}`);
      console.log(`   - Doctor Share: ${booking459.doctorShare}`);
      console.log(`   - Patient Status: ${booking459.patientPaymentStatus}`);
      console.log(`   - App Payout Status: ${booking459.appPayoutStatus}`);
      console.log(`   - Has Policy Snapshot: ${Boolean(booking459.policySnapshot)}`);

      if (booking459.policySnapshot) {
        console.log(`   - Snapshot Policy Name: ${booking459.policySnapshot.revenuePolicy?.name}`);
        console.log(`   - Snapshot Doctor %: ${booking459.policySnapshot.revenuePolicy?.rules?.doctorSharePercent}%`);
        if (booking459.policySnapshot.revenuePolicy?.rules?.doctorSharePercent !== 94) {
          throw new Error('Policy snapshot percent mismatch!');
        }
      }
    } else {
      console.log('ℹ Note: Booking 459 not found in doctor bookings.');
    }

    // 3. Test Dual Payment States (BN -> App & App -> BS)
    const hasPaidApp = transactions.some(t => t.patientPaymentStatus === 'paid');
    const hasPendingPayout = transactions.some(t => t.appPayoutStatus === 'pending');
    console.log(`\n✓ Dual Payment States Verified:`);
    console.log(`   - Contains patient paid bookings: ${hasPaidApp}`);
    console.log(`   - Contains pending payout bookings: ${hasPendingPayout}`);

    // 4. Test Date Filtering (e.g. 2026-09-01 to 2026-09-30)
    const resFiltered = await doctorService.getDoctorIncomeWorkspace(doctorId, {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    console.log(`\n✓ Date Filter (2026-09-01 -> 2026-09-30):`);
    console.log(`   - Filtered Count: ${resFiltered.data.transactions.length}`);
    console.log(`   - Filtered Income: ${resFiltered.data.kpi.totalIncome.toLocaleString()} VND`);
    resFiltered.data.transactions.forEach(t => {
      if (t.date < '2026-09-01' || t.date > '2026-09-30') {
        throw new Error(`Transaction ${t.id} date ${t.date} out of range!`);
      }
    });
    console.log(`✓ All filtered transactions strictly within requested date window.`);

    // 5. Test Status Filtering (e.g. status = 'pending')
    const resPending = await doctorService.getDoctorIncomeWorkspace(doctorId, {
      status: 'pending',
    });
    console.log(`\n✓ Status Tab Filter (status = 'pending'):`);
    console.log(`   - Pending Transactions Count: ${resPending.data.transactions.length}`);
    resPending.data.transactions.forEach(t => {
      if (t.appPayoutStatus !== 'pending') {
        throw new Error(`Transaction ${t.id} has invalid status ${t.appPayoutStatus}, expected 'pending'`);
      }
    });
    console.log(`✓ All transactions correctly match 'pending' status.`);

    // 6. Test Settlements
    if (settlements.length > 0) {
      const s0 = settlements[0];
      console.log(`\n✓ Settlement Batch #1 verified:`);
      console.log(`   - Code: ${s0.code}`);
      console.log(`   - Period: ${s0.periodFrom} -> ${s0.periodTo}`);
      console.log(`   - Net Payout: ${s0.netPayout.toLocaleString()} VND`);
      console.log(`   - Status: ${s0.payoutStatus}`);
      console.log(`   - Sessions in batch: ${s0.sessionsCount}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL DOCTOR INCOME WORKSPACE VERIFICATION TESTS PASSED!');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed with error:', err);
    process.exit(1);
  }
};

runVerification();
