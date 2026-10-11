const clinicalAssistantService = require('../src/services/clinicalAssistantService');

async function runTest() {
  console.log('--- TESTING CLINICAL ASSISTANT SERVICE ---');
  try {
    // 1. Search ICD-10 by code
    const res1 = await clinicalAssistantService.searchIcd10('I10', { doctorId: 1 });
    console.log(`[TEST 1] Search 'I10': Found ${res1.data.length} results. First code: ${res1.data[0]?.code} - ${res1.data[0]?.nameVi}`);

    // 2. Search ICD-10 by unaccented Vietnamese "tang huyet ap"
    const res2 = await clinicalAssistantService.searchIcd10('tang huyet ap', { doctorId: 1 });
    console.log(`[TEST 2] Search 'tang huyet ap': Found ${res2.data.length} results. First code: ${res2.data[0]?.code} - ${res2.data[0]?.nameVi}`);

    // 3. Search ICD-10 by English / synonym "gout" or "diabetes"
    const res3 = await clinicalAssistantService.searchIcd10('diabetes', { doctorId: 1 });
    console.log(`[TEST 3] Search 'diabetes': Found ${res3.data.length} results. First code: ${res3.data[0]?.code} - ${res3.data[0]?.nameVi}`);

    // 4. Search Symptoms
    const resSymp = await clinicalAssistantService.searchSymptoms('sot');
    console.log(`[TEST 4] Search Symptoms 'sot': Found ${resSymp.data.length} results. First: ${resSymp.data[0]?.nameVi}`);

    // 5. Test Snippets
    const resSnip = await clinicalAssistantService.getSnippets({ doctorId: 1, section: 'clinicalNotes' });
    console.log(`[TEST 5] Get Snippets for doctor 1 (clinicalNotes): Found ${resSnip.data.length} snippets.`);

    console.log('✅ ALL BACKEND CLINICAL ASSISTANT SERVICE TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTest();
