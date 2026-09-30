// bookingcare-backend/scripts/sync-policy-targets.js
const db = require('../src/models');

async function testSync() {
  try {
    console.log('Connecting to database and syncing Policy_Target model...');
    await db.syncSchema();
    console.log('✅ Sync schema successful!');

    // Check table Policy_Targets
    const count = await db.Policy_Target.count();
    console.log(`✅ Policy_Target table ready. Row count: ${count}`);

    // Check column targetMode on Financial_Policy
    const sample = await db.Financial_Policy.findOne();
    if (sample) {
      console.log(`✅ Financial_Policy targetMode sample value: ${sample.targetMode || 'default'}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
}

testSync();
