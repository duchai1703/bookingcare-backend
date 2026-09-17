// bookingcare-backend/scripts/verify-doctor-onboarding.js
// Automated verification suite for Doctor Self-Onboarding & Verification Workflow
const db = require('../src/models/index');
const doctorOnboardingService = require('../src/services/doctorOnboardingService');

async function runTests() {
  console.log('🚀 [START TEST] Doctor Self-Onboarding & Verification Workflow Verification...');
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Đảm bảo sync schema
    await db.sequelize.sync({ alter: true });
    console.log('✅ Sequelize sync complete');

    // Tìm 1 Clinic và 1 Specialty có sẵn để test
    const clinic = await db.Clinic.findOne();
    const specialty = await db.Specialty.findOne();

    if (!clinic || !specialty) {
      throw new Error('Database cần ít nhất 1 Clinic và 1 Specialty để chạy test!');
    }

    const testEmail = `bs.test.onboard.${Date.now()}@bookingcare.vn`;
    const testLicense = `CCHN-TEST-${Math.floor(100000 + Math.random() * 900000)}`;

    // TEST 1: Nộp hồ sơ thiếu trường bắt buộc -> Phải báo lỗi
    console.log('\n--- TEST 1: Validation bắt buộc khi nộp hồ sơ ---');
    const failRes = await doctorOnboardingService.submitOnboarding({
      email: testEmail,
      // Thiếu firstName, lastName, phoneNumber, licenseNumber, clinicId, specialtyId
    });
    if (failRes.errCode !== 0) {
      console.log('✅ PASS Test 1: Đã chặn thành công hồ sơ thiếu thông tin bắt buộc:', failRes.message);
      testsPassed++;
    } else {
      console.error('❌ FAIL Test 1: Lẽ ra phải chặn nộp thiếu trường!');
      testsFailed++;
    }

    // TEST 2: Nộp hồ sơ đầy đủ với CCHN và ảnh scan -> Thành công & tính completenessScore
    console.log('\n--- TEST 2: Nộp hồ sơ đầy đủ hợp lệ & Chấm điểm Completeness ---');
    const submitRes = await doctorOnboardingService.submitOnboarding({
      email: testEmail,
      phoneNumber: '0987654321',
      password: 'DoctorPassword123@',
      firstName: 'Thành Long',
      lastName: 'Bác sĩ',
      gender: 'M',
      birthday: '1988-10-15',
      address: 'Quận 1, TP. Hồ Chí Minh',
      nationalId: '079088001234',
      avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      specialtyId: specialty.id,
      subSpecialtyIds: [],
      licenseNumber: testLicense,
      licenseIssueDate: '2018-05-20',
      licenseIssuePlace: 'Sở Y tế TP. Hồ Chí Minh',
      licenseImages: ['https://example.com/cchn-front.jpg', 'https://example.com/cchn-back.jpg'],
      qualificationDegree: 'Tiến sĩ Y khoa',
      experienceYears: 12,
      bioDescription: 'Bác sĩ chuyên khoa sâu hơn 12 năm kinh nghiệm trong chẩn đoán và điều trị.',
      clinicId: clinic.id,
      proposedRoom: 'Phòng 204 - Tòa nhà A',
      priceId: 'PRI2',
      bankAccountNumber: '1903567890123',
      bankName: 'Techcombank',
      bankAccountName: 'BAC SI THANH LONG',
    });

    if (submitRes.errCode === 0 && submitRes.data && submitRes.data.requestId) {
      console.log('✅ PASS Test 2: Nộp hồ sơ thành công, Request ID:', submitRes.data.requestId);
      console.log(`   - Completeness Score: ${submitRes.data.completenessScore}%`);
      console.log(`   - Risk Flags: ${JSON.stringify(submitRes.data.riskFlags)}`);
      testsPassed++;
    } else {
      console.error('❌ FAIL Test 2: Nộp hồ sơ thất bại:', submitRes.message);
      testsFailed++;
    }

    const requestId = submitRes.data.requestId;

    // TEST 3: Admin lấy danh sách thẩm định (Verification Queue)
    console.log('\n--- TEST 3: Verification Queue của Admin ---');
    const queueRes = await doctorOnboardingService.getVerificationQueue({ status: 'ALL' });
    if (queueRes.errCode === 0 && queueRes.data && queueRes.data.items) {
      const found = queueRes.data.items.find(item => item.id === requestId);
      if (found) {
        console.log('✅ PASS Test 3: Đã tìm thấy hồ sơ trong hàng đợi thẩm định của Admin!');
        console.log(`   - Total items: ${queueRes.data.totalItems}`);
        console.log(`   - Summary:`, queueRes.data.summary);
        testsPassed++;
      } else {
        console.error('❌ FAIL Test 3: Không tìm thấy request vừa nộp trong queue!');
        testsFailed++;
      }
    } else {
      console.error('❌ FAIL Test 3: Lỗi khi lấy Verification Queue:', queueRes.message);
      testsFailed++;
    }

    // TEST 4: Admin yêu cầu bổ sung hồ sơ (Request Changes)
    console.log('\n--- TEST 4: Admin yêu cầu bổ sung hồ sơ ---');
    const changeRes = await doctorOnboardingService.requestChanges(requestId, {
      feedback: 'Vui lòng cung cấp thêm ảnh mặt sau bằng Tiến sĩ y khoa rõ nét hơn.',
      requiredFields: ['licenseImages'],
    }, 1);

    if (changeRes.errCode === 0 && changeRes.data.status === 'CHANGES_REQUESTED') {
      console.log('✅ PASS Test 4: Chuyển trạng thái sang CHANGES_REQUESTED thành công:', changeRes.data.adminFeedback);
      testsPassed++;
    } else {
      console.error('❌ FAIL Test 4: Lỗi khi yêu cầu bổ sung:', changeRes.message);
      testsFailed++;
    }

    // TEST 5: Admin Phê duyệt (Approve) & Auto-Provisioning Transaction
    console.log('\n--- TEST 5: Admin Phê duyệt (Approve) & Auto-Provisioning toàn diện ---');
    const approveRes = await doctorOnboardingService.approveOnboarding(requestId, 1);
    if (approveRes.errCode === 0 && approveRes.data && approveRes.data.doctorId) {
      const createdDoctorId = approveRes.data.doctorId;
      console.log('✅ PASS Test 5.1: Approve transaction thành công, Doctor ID:', createdDoctorId);

      // Kiểm chứng User đã được tạo với role R2
      const createdUser = await db.User.findByPk(createdDoctorId);
      if (createdUser && createdUser.roleId === 'R2') {
        console.log(`✅ PASS Test 5.2: User role R2 đã được tạo với email: ${createdUser.email}, Position: ${createdUser.positionId}`);
        testsPassed++;
      } else {
        console.error('❌ FAIL Test 5.2: User không đúng role R2!');
        testsFailed++;
      }

      // Kiểm chứng Doctor_Info đã được tự động liên kết
      const doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId: createdDoctorId } });
      if (doctorInfo && doctorInfo.specialtyId === specialty.id && doctorInfo.clinicId === clinic.id) {
        console.log(`✅ PASS Test 5.3: Doctor_Info được auto-provision liên kết Specialty: ${doctorInfo.specialtyId}, Clinic: ${doctorInfo.clinicId}, Bank: ${doctorInfo.bankName}`);
        testsPassed++;
      } else {
        console.error('❌ FAIL Test 5.3: Doctor_Info chưa được tạo hoặc sai liên kết!');
        testsFailed++;
      }

      // Kiểm chứng Doctor_Assignment đã được liên kết
      const assignment = await db.Doctor_Assignment.findOne({
        where: { doctorId: createdDoctorId, clinicId: clinic.id, specialtyId: specialty.id }
      });
      if (assignment && assignment.isPrimary === true) {
        console.log(`✅ PASS Test 5.4: Doctor_Assignment đã được kích hoạt làm việc tại cơ sở với room: ${assignment.roomNumber}`);
        testsPassed++;
      } else {
        console.error('❌ FAIL Test 5.4: Doctor_Assignment chưa được kích hoạt!');
        testsFailed++;
      }
      testsPassed++;
    } else {
      console.error('❌ FAIL Test 5: Lỗi khi Approve hồ sơ:', approveRes.message);
      testsFailed++;
    }

    console.log(`\n========================================`);
    console.log(`KẾT QUẢ TEST: PASSED ${testsPassed} / ${testsPassed + testsFailed} TESTS`);
    console.log(`========================================`);

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('💥 Unexpected test error:', err);
    process.exit(1);
  }
}

runTests();
