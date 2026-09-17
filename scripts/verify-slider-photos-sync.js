// scripts/verify-slider-photos-sync.js
const db = require('../src/models');
const clinicService = require('../src/services/clinicService');
const specialtyService = require('../src/services/specialtyService');
const clinicManageService = require('../src/services/clinicManageService');
const specialtyManageService = require('../src/services/specialtyManageService');

async function main() {
  console.log('🚀 [VERIFY-SYNC] Bắt đầu đồng bộ DB và kiểm định Photos Slider...');

  try {
    // 1. Sync alter database models
    await db.Clinic.sync({ alter: true });
    await db.Specialty.sync({ alter: true });
    console.log('✅ [1/5] Đồng bộ bảng Clinic và Specialty với cột photos thành công');

    // 2. Test tạo cơ sở y tế mới với ảnh Slider và Markdown
    const testClinicPayload = {
      name: 'Bệnh viện Đa khoa Quốc tế Test Slider ' + Date.now(),
      address: '123 Đường Test, Quận 1, TP.HCM',
      phone: '0901234567',
      email: 'testclinic@slider.vn',
      status: 'active',
      commissionRate: 18.5,
      descriptionMarkdown: '## Giới thiệu Cơ sở\n\nCơ sở y tế đạt chuẩn quốc tế **JCI** với hệ thống máy móc tiên tiến.\n\n- Phòng khám vô trùng\n- Đội ngũ chuyên gia đầu ngành',
      descriptionHTML: '<h2>Giới thiệu Cơ sở</h2><p>Cơ sở y tế đạt chuẩn quốc tế <strong>JCI</strong> với hệ thống máy móc tiên tiến.</p>',
      photos: [
        {
          image: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=1600&q=80',
          caption: 'Khuôn viên toàn cảnh bệnh viện',
        },
        {
          image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1600&q=80',
          caption: 'Khu khám bệnh tiêu chuẩn quốc tế',
        },
      ],
    };

    const clinicCreateRes = await clinicService.createClinic(testClinicPayload);
    if (clinicCreateRes.errCode !== 0) {
      throw new Error('createClinic failed: ' + clinicCreateRes.message);
    }
    const createdClinicId = clinicCreateRes.data?.id;
    console.log(`✅ [2/5] Tạo cơ sở y tế ID #${createdClinicId} với 2 ảnh slider thành công`);

    // 3. Test cập nhật cơ sở y tế (thêm ảnh thứ 3, đổi caption, cập nhật markdown)
    const updateClinicPayload = {
      id: createdClinicId,
      name: testClinicPayload.name + ' (Đã cập nhật)',
      address: testClinicPayload.address,
      descriptionMarkdown: '## Giới thiệu cập nhật\n\nBổ sung thêm trung tâm chẩn đoán hình ảnh kỹ thuật số.',
      descriptionHTML: '<h2>Giới thiệu cập nhật</h2><p>Bổ sung thêm trung tâm chẩn đoán hình ảnh kỹ thuật số.</p>',
      photos: [
        ...testClinicPayload.photos,
        {
          image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1600&q=80',
          caption: 'Hệ thống chụp MRI & CT 128 lát cắt',
        },
      ],
    };
    const clinicEditRes = await clinicService.editClinic(updateClinicPayload);
    if (clinicEditRes.errCode !== 0) {
      throw new Error('editClinic failed: ' + clinicEditRes.message);
    }
    console.log('✅ [3/5] Cập nhật cơ sở y tế lên 3 ảnh slider và nội dung markdown thành công');

    // Kiểm tra chi tiết qua API công khai & API Control Center
    const clinicDetailRes = await clinicService.getDetailClinicById(createdClinicId);
    const controlCenterRes = await clinicManageService.getAdminClinicControlCenter(createdClinicId);

    const detailPhotos = clinicDetailRes.data?.clinic?.photos || clinicDetailRes.data?.clinic?.getDataValue?.('photos');
    const controlPhotos = controlCenterRes.data?.profile?.photos;

    if (!Array.isArray(detailPhotos) || detailPhotos.length !== 3) {
      throw new Error(`getDetailClinicById photos length mismatch: expected 3, got ${detailPhotos?.length}`);
    }
    if (!Array.isArray(controlPhotos) || controlPhotos.length !== 3) {
      throw new Error(`getAdminClinicControlCenter photos length mismatch: expected 3, got ${controlPhotos?.length}`);
    }
    console.log('✅ [3.1/5] API Public & Control Center của cơ sở y tế trả về chuẩn mảng 3 ảnh slider');

    // 4. Test tạo và cập nhật Chuyên khoa với Slider và Markdown
    const testSpecialtyPayload = {
      name: 'Chuyên khoa Tim mạch Test Slider ' + Date.now(),
      targetCapacity: 60,
      status: 'active',
      descriptionMarkdown: '## Chuyên khoa Mũi nhọn\n\nChẩn đoán & can thiệp tim mạch chất lượng cao.',
      descriptionHTML: '<h2>Chuyên khoa Mũi nhọn</h2><p>Chẩn đoán & can thiệp tim mạch chất lượng cao.</p>',
      photos: [
        {
          image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1600&q=80',
          caption: 'Phòng can thiệp tim mạch Catheterization Lab',
        },
      ],
    };

    const specialtyCreateRes = await specialtyService.createSpecialty(testSpecialtyPayload);
    if (specialtyCreateRes.errCode !== 0) {
      throw new Error('createSpecialty failed: ' + specialtyCreateRes.message);
    }
    const createdSpecialtyId = specialtyCreateRes.data?.id;
    console.log(`✅ [4/5] Tạo chuyên khoa ID #${createdSpecialtyId} với 1 ảnh slider thành công`);

    // Cập nhật chuyên khoa
    const specialtyEditRes = await specialtyService.editSpecialty({
      id: createdSpecialtyId,
      name: testSpecialtyPayload.name,
      targetCapacity: 75,
      photos: [
        ...testSpecialtyPayload.photos,
        {
          image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1600&q=80',
          caption: 'Khu chăm sóc tích cực tim mạch (ICU)',
        },
      ],
      descriptionMarkdown: '## Chuyên khoa Tim mạch cập nhật\n\nĐã mở rộng thêm 2 phòng siêu âm Doppler màu tim.',
    });
    if (specialtyEditRes.errCode !== 0) {
      throw new Error('editSpecialty failed: ' + specialtyEditRes.message);
    }

    const specialtyDetailRes = await specialtyService.getDetailSpecialtyById(createdSpecialtyId);
    const specialtyWsRes = await specialtyManageService.getAdminSpecialtyWorkspace(createdSpecialtyId);

    const specPhotos = specialtyDetailRes.data?.specialty?.photos || specialtyDetailRes.data?.specialty?.getDataValue?.('photos');
    const specWsPhotos = specialtyWsRes.data?.profile?.photos;

    if (!Array.isArray(specPhotos) || specPhotos.length !== 2) {
      throw new Error(`getDetailSpecialtyById photos length mismatch: expected 2, got ${specPhotos?.length}`);
    }
    if (!Array.isArray(specWsPhotos) || specWsPhotos.length !== 2) {
      throw new Error(`getAdminSpecialtyWorkspace photos length mismatch: expected 2, got ${specWsPhotos?.length}`);
    }
    console.log('✅ [5/5] API Public & Intelligence Workspace của chuyên khoa trả về chuẩn mảng 2 ảnh slider');

    // Dọn dẹp dữ liệu test
    await db.Clinic.destroy({ where: { id: createdClinicId } });
    await db.Specialty.destroy({ where: { id: createdSpecialtyId } });
    console.log('🧹 Dọn dẹp bản ghi test thành công.');

    console.log('\n🎉 [HOÀN TẤT] Tất cả các bước kiểm định Backend & Database Photos Slider đều PASS 100%!');
    process.exit(0);
  } catch (error) {
    console.error('❌ [ERROR] Kiểm định thất bại:', error);
    process.exit(1);
  }
}

main();
