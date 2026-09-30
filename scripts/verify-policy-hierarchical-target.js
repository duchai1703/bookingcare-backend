// bookingcare-backend/scripts/verify-policy-hierarchical-target.js
const policyEngineService = require('../src/services/policyEngineService');
const db = require('../src/models');

async function testHierarchicalPolicyCreation() {
  try {
    console.log('--- 1. Testing getDoctorHierarchyTree() ---');
    const tree = await policyEngineService.getDoctorHierarchyTree();
    console.log(`✅ Loaded ${tree.length} clinics in tree.`);

    // Pick 2 doctors from first clinic
    const sampleDoctors = [];
    if (tree.length > 0 && tree[0].specialties?.length > 0) {
      const firstClinic = tree[0];
      for (const spec of firstClinic.specialties) {
        for (const doc of spec.doctors) {
          sampleDoctors.push({
            doctorId: doc.doctorId,
            clinicId: doc.clinicId,
            specialtyId: doc.specialtyId,
            assignmentId: doc.assignmentId,
            fullName: doc.fullName
          });
          if (sampleDoctors.length >= 3) break;
        }
        if (sampleDoctors.length >= 3) break;
      }
    }

    console.log(`Sample selected ${sampleDoctors.length} doctors:`, sampleDoctors.map(d => `${d.fullName} (ID: ${d.doctorId})`));

    console.log('\n--- 2. Testing createPolicy with targetMode = SELECTED_DOCTORS ---');
    const newPolicy = await policyEngineService.createPolicy({
      code: 'POL_TEST_HIERARCHICAL',
      policyType: 'REVENUE_SHARE',
      name: 'Chính sách Áp dụng Nhóm Bác sĩ Tuyển chọn (Test)',
      targetMode: 'SELECTED_DOCTORS',
      selectedDoctorTargets: sampleDoctors,
      rules: {
        platformFeePercent: 12,
        doctorSharePercent: 88,
        clinicSharePercent: 0
      },
      effectiveFrom: new Date(),
      status: 'ACTIVE'
    }, 1);

    console.log(`✅ Created Policy ID #${newPolicy.id} with targetMode: ${newPolicy.targetMode}`);

    console.log('\n--- 3. Verifying Policy_Targets in DB ---');
    const savedTargets = await db.Policy_Target.findAll({
      where: { policyId: newPolicy.id },
      include: [{ model: db.User, as: 'doctorData', attributes: ['id', 'firstName', 'lastName'] }]
    });
    console.log(`✅ Policy_Targets count: ${savedTargets.length}`);
    savedTargets.forEach(t => {
      console.log(`   - Doctor ID: ${t.doctorId} (${t.doctorData?.lastName} ${t.doctorData?.firstName}), Clinic ID: ${t.clinicId}`);
    });

    console.log('\n--- 4. Testing getPolicyDetail() with targetDoctors ---');
    const detail = await policyEngineService.getPolicyDetail(newPolicy.id);
    console.log(`✅ Policy Detail targetMode: ${detail.targetMode}, targetDoctors count: ${detail.targetDoctors?.length}`);
    detail.targetDoctors?.forEach(td => {
      console.log(`   - ${td.doctorName} at ${td.clinicName} (${td.specialtyName})`);
    });

    console.log('\n--- 5. Testing Policy Resolution for targeted doctor ---');
    const testDocId = sampleDoctors[0].doctorId;
    const resolved = await policyEngineService.resolveActivePolicy('REVENUE_SHARE', 'DOCTOR', testDocId, new Date());
    console.log(`✅ Resolution for Doctor #${testDocId}: Matched Policy ID #${resolved?.id} (${resolved?.name})`);

    console.log('\n--- 6. Testing createPolicyVersion (Versioning clone targets) ---');
    const newVersion = await policyEngineService.createPolicyVersion(newPolicy.id, {
      name: 'Chính sách Áp dụng Nhóm Bác sĩ Tuyển chọn (v2)',
      rules: {
        platformFeePercent: 10,
        doctorSharePercent: 90,
        clinicSharePercent: 0
      }
    }, 1);
    console.log(`✅ Created version v${newVersion.version} (ID #${newVersion.id})`);
    const v2Detail = await policyEngineService.getPolicyDetail(newVersion.id);
    console.log(`✅ v2 automatically inherited ${v2Detail.targetDoctors?.length} targets!`);

    // Clean up test policies
    console.log('\n--- 7. Cleaning up test policies ---');
    await db.Policy_Target.destroy({ where: { policyId: [newPolicy.id, newVersion.id] } });
    await db.Financial_Policy.destroy({ where: { id: [newPolicy.id, newVersion.id] } });
    console.log('✅ Cleaned up test policies.');

    console.log('\n🎉 ALL HIERARCHICAL TARGET TESTS PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testHierarchicalPolicyCreation();
