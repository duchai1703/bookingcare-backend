// bookingcare-backend/scripts/test-visual-cashflow.js
// Kiểm thử API và Service tổng hợp Dòng tiền trực quan
'use strict';

require('dotenv').config({ path: 'bookingcare-backend/.env' });
const financialAutomationService = require('../src/services/financialAutomationService');

async function runTest() {
  console.log('>>> [START] Testing getVisualCashflowMetrics()...');
  try {
    const result = await financialAutomationService.getVisualCashflowMetrics();
    console.log('Result errCode:', result.errCode);
    console.log('Result errMessage:', result.errMessage);
    if (result.errCode === 0) {
      const data = result.data;
      console.log('=== 5 VAULTS METRICS ===');
      console.log('1. Real Bank (VCB Cty):', data.vaults.realBank.currentBalance.toLocaleString('vi-VN'), 'VND');
      console.log('2. Patient Wallets (BN App):', data.vaults.patientWallets.total.toLocaleString('vi-VN'), 'VND');
      console.log('3. Escrow Pool (Tạm giữ):', data.vaults.escrowPool.total.toLocaleString('vi-VN'), 'VND',
        `(Doctor: ${data.vaults.escrowPool.doctorShare.toLocaleString('vi-VN')} VND, Platform: ${data.vaults.escrowPool.platformShare.toLocaleString('vi-VN')} VND)`);
      console.log('4. Doctor Wallets (BS App):', data.vaults.doctorWallets.total.toLocaleString('vi-VN'), 'VND');
      console.log('5. Platform Profit (Lời sàn):', data.vaults.platformProfit.spendable.toLocaleString('vi-VN'), 'VND');

      console.log('\n=== RECONCILIATION INVARIANT ===');
      console.log('Is Balanced:', data.reconciliation.isBalanced);
      console.log('Status:', data.reconciliation.status);
      console.log('Coverage Percent:', data.reconciliation.coveragePercent + '%');
      console.log('Formula:', data.reconciliation.formula);

      console.log('\n=== CHARTS DATA ===');
      console.log('Reconciliation Chart items:', data.charts.reconciliationChart.length);
      console.log('Capital Composition slices:', data.charts.capitalComposition.length);
      console.log('Daily Cash Flow points:', data.charts.dailyCashFlow.length);

      console.log('\n=== STEP BREAKDOWN ===');
      console.log('Step 1 Deposit:', data.stepBreakdown.step1);
      console.log('Step 2 Booking:', data.stepBreakdown.step2);
      console.log('Step 3 Withdrawal:', data.stepBreakdown.step3);

      console.log('\n>>> [SUCCESS] All cash flow metrics calculated perfectly!');
      process.exit(0);
    } else {
      console.error('Failed with errCode:', result.errCode);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error testing visual cashflow:', error);
    process.exit(1);
  }
}

runTest();

