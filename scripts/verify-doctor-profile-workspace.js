// scripts/verify-doctor-profile-workspace.js
// Kiểm thử API và logic nghiệp vụ Doctor Profile & Settings Workspace
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models');
const doctorService = require('../src/services/doctorService');

async function testDoctorProfileWorkspace() {
  console.log('=== BẮT ĐẦU KIỂM THỬ DOCTOR PROFILE & SETTINGS WORKSPACE ===');
  try {
    // 1. Lấy bác sĩ mẫu trong DB
    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) {
      console.log('❌ Không tìm thấy Bác sĩ (R2) trong DB!');
      process.exit(1);
    }
    const doctorId = doctor.id;
    console.log(`📌 Bác sĩ thử nghiệm: ID=${doctorId}, Tên=${doctor.lastName} ${doctor.firstName}`);

    // TEST 1: getDoctorOwnProfile trả về đầy đủ các cấu trúc dữ liệu mới
    console.log('\n--- Test 1: getDoctorOwnProfile(doctorId) ---');
    const profileRes = await doctorService.getDoctorOwnProfile(doctorId);
    if (profileRes.errCode !== 0 || !profileRes.data) {
      throw new Error(`getDoctorOwnProfile thất bại: ${profileRes.message}`);
    }
    const p = profileRes.data;
    console.log('✅ Test 1.1: Trả về thành công errCode=0');

    // Kiểm tra facilityAssignments
    if (!Array.isArray(p.facilityAssignments) || p.facilityAssignments.length === 0) {
      throw new Error('facilityAssignments không hợp lệ hoặc rỗng');
    }
    console.log(`✅ Test 1.2: facilityAssignments gồm ${p.facilityAssignments.length} cơ sở y tế`);
    console.log(`   - Cơ sở 1: ${p.facilityAssignments[0].clinicName} | Giá: ${p.facilityAssignments[0].priceVnd} | Phòng: ${p.facilityAssignments[0].roomNumber}`);

    // Kiểm tra credentials
    if (!p.credentials || !p.credentials.degree || !p.credentials.medicalLicense) {
      throw new Error('credentials thiếu thông tin degree hoặc medicalLicense');
    }
    console.log(`✅ Test 1.3: credentials xác minh:`);
    console.log(`   - Bằng cấp: ${p.credentials.degree.title} (${p.credentials.degree.university}) | Xác minh: ${p.credentials.degree.isVerified}`);
    console.log(`   - CCHN: ${p.credentials.medicalLicense.licenseNumber} (${p.credentials.medicalLicense.issuedBy})`);

    // Kiểm tra payoutAccount
    if (!p.payoutAccount || !p.payoutAccount.maskedAccountNumber) {
      throw new Error('payoutAccount thiếu thông tin hoặc chưa che số tài khoản nhạy cảm');
    }
    console.log(`✅ Test 1.4: payoutAccount: Ngân hàng=${p.payoutAccount.bankName} | STK che=${p.payoutAccount.maskedAccountNumber}`);

    // Kiểm tra consultationSettings
    if (!p.consultationSettings || typeof p.consultationSettings.allowChatFollowUp !== 'boolean') {
      throw new Error('consultationSettings thiếu cấu hình');
    }
    console.log(`✅ Test 1.5: consultationSettings: Chat=${p.consultationSettings.allowChatFollowUp} (${p.consultationSettings.chatDurationDays} ngày) | Video=${p.consultationSettings.allowVideoFollowUp}`);

    // Kiểm tra completeness & checklist
    if (typeof p.completenessPercent !== 'number' || !Array.isArray(p.checklist)) {
      throw new Error('completenessPercent hoặc checklist không hợp lệ');
    }
    console.log(`✅ Test 1.6: completenessPercent=${p.completenessPercent}% | checklist=${p.checklist.length} mục`);

    // TEST 2: updateDoctorOwnProfile
    console.log('\n--- Test 2: updateDoctorOwnProfile(doctorId, data) ---');
    const updatePayload = {
      phoneNumber: '0988776655',
      address: '789 Đường Y Dược, Quận 5, TP.HCM',
      description: 'Bác sĩ chuyên khoa sâu về Cơ Xương Khớp và Y học thể thao.',
      bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)',
      bankAccountNumber: '0071000889911',
      bankAccountName: `${doctor.lastName} ${doctor.firstName}`.toUpperCase(),
      consultationSettings: {
        allowChatFollowUp: true,
        chatDurationDays: 14,
        allowVideoFollowUp: true,
        videoCount: 1,
        videoDurationMinutes: 20,
      },
    };

    const updateRes = await doctorService.updateDoctorOwnProfile(doctorId, updatePayload);
    if (updateRes.errCode !== 0) {
      throw new Error(`updateDoctorOwnProfile thất bại: ${updateRes.message}`);
    }
    console.log('✅ Test 2.1: Cập nhật thành công errCode=0');

    // TEST 3: Đọc lại để kiểm tra tính nhất quán (persistence)
    console.log('\n--- Test 3: Xác minh dữ liệu đã lưu sau khi update ---');
    const recheckRes = await doctorService.getDoctorOwnProfile(doctorId);
    const recheck = recheckRes.data;

    if (recheck.phoneNumber !== '0988776655') {
      throw new Error(`phoneNumber không khớp: ${recheck.phoneNumber}`);
    }
    if (recheck.address !== '789 Đường Y Dược, Quận 5, TP.HCM') {
      throw new Error(`address không khớp: ${recheck.address}`);
    }
    if (recheck.consultationSettings?.chatDurationDays !== 14) {
      throw new Error(`chatDurationDays không khớp: ${recheck.consultationSettings?.chatDurationDays}`);
    }
    if (!recheck.payoutAccount.maskedAccountNumber.endsWith('9911')) {
      throw new Error(`maskedAccountNumber không kết thúc bằng 9911: ${recheck.payoutAccount.maskedAccountNumber}`);
    }
    console.log('✅ Test 3.1: Dữ liệu hồ sơ, ngân hàng và cài đặt tư vấn đã lưu chính xác và bảo mật!');

    console.log('\n============================================================');
    console.log('🎉 TẤT CẢ TEST DOCTOR PROFILE WORKSPACE ĐỀU PASS THÀNH CÔNG!');
    console.log('============================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

testDoctorProfileWorkspace();
