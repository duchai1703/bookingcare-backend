// bookingcare-backend/scripts/test-hierarchy-api.js
const policyEngineService = require('../src/services/policyEngineService');

async function runTest() {
  try {
    console.log('Testing getDoctorHierarchyTree()...');
    const tree = await policyEngineService.getDoctorHierarchyTree();
    console.log(`✅ Hierarchy tree returned ${tree.length} facilities with doctors.`);
    if (tree.length > 0) {
      const first = tree[0];
      console.log(`Facility #1: "${first.name}" has ${first.doctorCount} doctors across ${first.specialties.length} specialties.`);
      if (first.specialties.length > 0) {
        const spec = first.specialties[0];
        console.log(`  Specialty #1: "${spec.name}" has ${spec.doctorCount} doctors:`);
        spec.doctors.slice(0, 3).forEach(d => {
          console.log(`    - [ID: ${d.doctorId}] ${d.fullName} (${d.positionVi || 'Bác sĩ'}) - ${d.roomNumber}`);
        });
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Hierarchy tree failed:', err);
    process.exit(1);
  }
}

runTest();
