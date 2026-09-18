// scripts/verify-doctor-encounter-workspace.js
// Kiểm thử API và quy trình nghiệp vụ Encounter Workspace (3-Zone Clinical Workstation)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models');
const doctorService = require('../src/services/doctorService');

async function testEncounterWorkspace() {
  console.log('=== BẮT ĐẦU KIỂM THỬ DOCTOR ENCOUNTER WORKSPACE BACKEND ===');
  try {
    // 1. Tìm 1 booking hợp lệ để test
    let booking = await db.Booking.findOne({
      where: { statusId: ['S2', 'S3'] },
      include: [
        { model: db.User, as: 'doctorBookingData' },
        { model: db.User, as: 'patientData' },
      ],
    });

    if (!booking) {
      // Fallback lấy bất kỳ booking nào
      booking = await db.Booking.findOne();
    }

    if (!booking) {
      console.log('❌ Không tìm thấy booking trong database!');
      process.exit(1);
    }

    const bookingId = booking.id;
    const doctorId = booking.doctorId;
    console.log(`📌 Ca khám thử nghiệm: ID=${bookingId}, Bác sĩ ID=${doctorId}, Bệnh nhân=${booking.patientName || 'BN'}`);

    // TEST 1: getDoctorEncounter
    console.log('\n--- Test 1: getDoctorEncounter(bookingId, doctorId) ---');
    const encounterRes = await doctorService.getDoctorEncounter(bookingId, doctorId);
    if (encounterRes.errCode !== 0 || !encounterRes.data) {
      throw new Error(`getDoctorEncounter thất bại: ${encounterRes.message}`);
    }
    const enc = encounterRes.data;
    console.log('✅ Test 1.1: Gọi thành công errCode=0');
    console.log(`   - Mã ca khám: ${enc.bookingCode} | Mã BN: ${enc.patientCode} | Tuổi: ${enc.patientAge}`);
    console.log(`   - Trạng thái hiện tại: statusId=${enc.statusId} | encounterStatus=${enc.encounterStatus || 'not_started'}`);

    if (!Array.isArray(enc.patientHistory)) {
      throw new Error('patientHistory không phải là mảng');
    }
    console.log(`✅ Test 1.2: Tiền sử khám bệnh nhân gồm ${enc.patientHistory.length} ca khám cũ`);

    if (!enc.followUpEntitlements || !enc.followUpEntitlements.chat || !enc.followUpEntitlements.video) {
      throw new Error('Thiếu cấu hình followUpEntitlements (Chat / Video)');
    }
    console.log(`✅ Test 1.3: Quyền lợi Follow-up: Chat ${enc.followUpEntitlements.chat.days} ngày | Video ${enc.followUpEntitlements.video.durationMinutes} phút`);

    // TEST 2: uploadEncounterAttachments (Tải lên nhiều tài liệu X-quang, xét nghiệm)
    console.log('\n--- Test 2: uploadEncounterAttachments (Multi-file upload) ---');
    const mockFiles = [
      {
        fileName: 'xquang_khop_goi_thang_nghieng.jpg',
        fileType: 'image/jpeg',
        fileSize: 4200000,
        fileData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        category: 'xray',
        uploadedBy: 'DOCTOR',
        examinationDate: '2026-09-18',
        note: 'Gai xương mâm chày thoái hóa độ 2',
      },
      {
        fileName: 'ket_qua_xet_nghiem_mau_crp.pdf',
        fileType: 'application/pdf',
        fileSize: 1800000,
        fileData: 'data:application/pdf;base64,JVBERi0xLjQKJ...',
        category: 'lab',
        uploadedBy: 'DOCTOR',
        examinationDate: '2026-09-18',
        note: 'Chỉ số viêm CRP trong giới hạn bình thường',
      },
    ];

    const uploadRes = await doctorService.uploadEncounterAttachments(bookingId, doctorId, mockFiles);
    if (uploadRes.errCode !== 0) {
      throw new Error(`uploadEncounterAttachments thất bại: ${uploadRes.message}`);
    }
    console.log(`✅ Test 2.1: Tải lên thành công ${mockFiles.length} tài liệu y tế`);
    const createdAttachmentId = uploadRes.data?.[0]?.id;

    // TEST 3: saveDoctorEncounter (Lưu nháp / Draft Auto-save)
    console.log('\n--- Test 3: saveDoctorEncounter (Draft / Auto-save) ---');
    // Tìm 1 loại thuốc mẫu trong DB nếu có
    const medicine = await db.Medicine.findOne({ where: { isActive: true } });
    const sampleMedicines = medicine
      ? [
          {
            medicineId: medicine.id,
            quantity: 30,
            dosage: '1 viên x 2 lần/ngày',
            usageInstructions: 'Uống sau bữa ăn sáng và tối',
          },
        ]
      : [];

    const draftData = {
      action: 'draft',
      chiefComplaint: 'Đau buốt khớp gối phải khi lên xuống cầu thang',
      symptoms: 'Khớp gối sưng nhẹ, đau âm ỉ 2 tuần nay, có tiếng lục cục khi gập duỗi',
      clinicalNotes: 'Khớp gối không nóng đỏ, không tràn dịch rõ, nghiệm pháp bập bành xương bánh chè âm tính',
      diagnosis: 'Thoái hóa khớp gối phải giai đoạn 2 (ICD-10: M17)',
      treatmentPlan: 'Nghỉ ngơi, tập vật lý trị liệu cơ tứ đầu đùi, tránh mang vác nặng',
      careInstructions: 'Chườm ấm mỗi tối 15 phút, bổ sung canxi và glucosamine',
      followUpDate: '2026-09-25',
      medicines: sampleMedicines,
    };

    const draftRes = await doctorService.saveDoctorEncounter(bookingId, doctorId, draftData);
    if (draftRes.errCode !== 0) {
      throw new Error(`saveDoctorEncounter draft thất bại: ${draftRes.message}`);
    }
    console.log('✅ Test 3.1: Lưu nháp phiên khám thành công, cập nhật lastSavedAt');

    // TEST 4: saveDoctorEncounter (Hoàn tất phiên khám -> statusId = S3)
    console.log('\n--- Test 4: saveDoctorEncounter (Action: complete) ---');
    const completeRes = await doctorService.saveDoctorEncounter(bookingId, doctorId, {
      ...draftData,
      action: 'complete',
    });
    if (completeRes.errCode !== 0) {
      throw new Error(`saveDoctorEncounter complete thất bại: ${completeRes.message}`);
    }
    console.log('✅ Test 4.1: Hoàn tất phiên khám thành công!');

    // TEST 5: Tái kiểm tra dữ liệu đã lưu
    console.log('\n--- Test 5: Xác minh tính nhất quán sau khi hoàn tất ---');
    const recheckRes = await doctorService.getDoctorEncounter(bookingId, doctorId);
    const recheck = recheckRes.data;

    if (recheck.statusId !== 'S3') {
      throw new Error(`statusId chưa cập nhật thành S3: ${recheck.statusId}`);
    }
    if (recheck.encounterStatus !== 'completed') {
      throw new Error(`encounterStatus chưa cập nhật thành completed: ${recheck.encounterStatus}`);
    }
    if (recheck.diagnosis !== draftData.diagnosis) {
      throw new Error(`diagnosis không khớp: ${recheck.diagnosis}`);
    }
    if (recheck.chiefComplaint !== draftData.chiefComplaint) {
      throw new Error(`chiefComplaint không khớp: ${recheck.chiefComplaint}`);
    }
    console.log('✅ Test 5.1: Dữ liệu chẩn đoán, kế hoạch, trạng thái S3 hoàn tất chuẩn xác!');

    // TEST 6: deleteEncounterAttachment
    if (createdAttachmentId) {
      console.log('\n--- Test 6: deleteEncounterAttachment ---');
      const delRes = await doctorService.deleteEncounterAttachment(bookingId, doctorId, createdAttachmentId);
      if (delRes.errCode !== 0) {
        throw new Error(`deleteEncounterAttachment thất bại: ${delRes.message}`);
      }
      console.log('✅ Test 6.1: Gỡ bỏ tài liệu thành công');
    }

    console.log('\n===============================================================');
    console.log('🎉 TẤT CẢ TEST ENCOUNTER WORKSPACE BACKEND ĐỀU PASS THÀNH CÔNG!');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

testEncounterWorkspace();
