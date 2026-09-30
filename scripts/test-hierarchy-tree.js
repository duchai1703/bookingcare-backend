// bookingcare-backend/scripts/test-hierarchy-tree.js
const db = require('../src/models');

async function testHierarchy() {
  try {
    const clinics = await db.Clinic.findAll({
      attributes: ['id', 'name', 'address', 'image'],
      order: [['name', 'ASC']]
    });

    const assignments = await db.Doctor_Assignment.findAll({
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'image', 'phoneNumber'],
          include: [
            {
              model: db.Allcode,
              as: 'positionData',
              attributes: ['valueVi', 'valueEn']
            }
          ]
        },
        {
          model: db.Specialty,
          as: 'specialtyData',
          attributes: ['id', 'name', 'image']
        },
        {
          model: db.Clinic,
          as: 'clinicData',
          attributes: ['id', 'name', 'address', 'image']
        }
      ]
    });

    console.log(`Found ${clinics.length} clinics and ${assignments.length} doctor assignments.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testHierarchy();
