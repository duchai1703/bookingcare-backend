const doctorShorthandService = require('../src/services/doctorShorthandService');

async function testDoctorShorthand() {
  console.log('--- TESTING DOCTOR SHORTHAND SERVICE ---');
  try {
    // 1. Search 'tha'
    const res1 = await doctorShorthandService.searchShorthands({ doctorId: 1, query: 'tha' });
    console.log(`[TEST 1] Search 'tha': Found ${res1.data.length} results. First: ${res1.data[0]?.shortCode} -> ${res1.data[0]?.expandedText}`);

    // 2. Search 'u2v'
    const res2 = await doctorShorthandService.searchShorthands({ doctorId: 1, query: 'u2v' });
    console.log(`[TEST 2] Search 'u2v': Found ${res2.data.length} results. First: ${res2.data[0]?.shortCode} -> ${res2.data[0]?.expandedText}`);

    // 3. Search 'ktp'
    const res3 = await doctorShorthandService.searchShorthands({ doctorId: 1, query: 'ktp', targetField: 'clinicalNotes' });
    console.log(`[TEST 3] Search 'ktp' for clinicalNotes: Found ${res3.data.length} results. First: ${res3.data[0]?.shortCode}`);

    // 4. Create new personal shorthand for doctor 1
    const newShort = await doctorShorthandService.createShorthand({
      shortCode: 'test-code',
      expandedText: 'Bệnh nhân có đáp ứng điều trị rất tốt, tiếp tục duy trì phác đồ.',
      targetField: 'ALL',
      category: 'CLINICAL',
    }, 1);
    console.log(`[TEST 4] Create Shorthand: errCode=${newShort.errCode}, id=${newShort.data?.id}`);

    // 5. Get doctor shorthands list and stats
    const resList = await doctorShorthandService.getDoctorShorthands({ doctorId: 1 });
    console.log(`[TEST 5] Shorthands list: Total=${resList.data?.stats?.totalCount}, Personal=${resList.data?.stats?.personalCount}`);

    // Clean up test record
    if (newShort.data?.id) {
      await doctorShorthandService.deleteShorthand(newShort.data.id, 1);
      console.log(`[CLEANUP] Deleted test shorthand id=${newShort.data.id}`);
    }

    console.log('✅ ALL DOCTOR SHORTHAND TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

testDoctorShorthand();
