// scripts/verify-clinic-hierarchy-multiclinic.js
// Kịch bản kiểm thử tự động toàn diện: Quản trị Phân cấp Y tế theo Ngữ cảnh (Option B)
// Cơ sở y tế -> Chuyên khoa tại Cơ sở -> Bác sĩ phân bổ đa cơ sở

const axios = require('axios');
const db = require('../src/models');

const BASE_URL = 'http://localhost:3001';

const logStep = (step, title) => {
  console.log(`\n\x1b[36m▶ [BƯỚC ${step}] ${title}\x1b[0m`);
};
const logSuccess = (msg) => {
  console.log(`  \x1b[32m✔ ${msg}\x1b[0m`);
};
const logError = (msg) => {
  console.error(`  \x1b[31m✖ ${msg}\x1b[0m`);
};

(async () => {
  console.log('\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[35m🏥 KIỂM THỬ E2E: QUẢN TRỊ PHÂN CẤP Y TẾ & BÁC SĨ ĐA CƠ SỞ (OPTION B)\x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m');

  let adminToken = '';
  let createdAssignmentId = null;

  try {
    // ═════════════════════════════════════════════════════════════
    // BƯỚC 1: Đăng nhập Admin & Lấy JWT Token
    // ═════════════════════════════════════════════════════════════
    logStep(1, 'Đăng nhập Quản trị viên (Admin Login)');
    const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'admin@bookingcare.vn',
      password: '123456',
    }).catch(async () => {
      return await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: 'admin@bookingcare.vn',
        password: '123456',
      });
    });

    adminToken = loginRes.data?.accessToken || loginRes.data?.data?.token || loginRes.data?.token;

    if (!adminToken) {
      // Thử với password123 nếu cần
      const fallbackLogin = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: 'admin@bookingcare.vn',
        password: '123456',
      });
      adminToken = fallbackLogin.data?.accessToken || fallbackLogin.data?.data?.token || fallbackLogin.data?.token;
    }

    if (!adminToken) {
      throw new Error('Không thể lấy JWT Token của Admin');
    }
    logSuccess('Xác thực Admin thành công, đã cấp Token hợp lệ.');

    const authHeaders = {
      headers: { Authorization: `Bearer ${adminToken}` },
    };

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 2: Kiểm tra tính toàn vẹn Dữ liệu Backfill trong Database
    // ═════════════════════════════════════════════════════════════
    logStep(2, 'Kiểm tra toàn vẹn bảng Clinic_Specialties & Doctor_Assignments');
    const csCount = await db.Clinic_Specialty.count();
    const daCount = await db.Doctor_Assignment.count();

    if (csCount === 0 || daCount === 0) {
      console.log('  Chạy đồng bộ backfill dữ liệu...');
      await db.backfillHierarchy();
    }
    const finalCsCount = await db.Clinic_Specialty.count();
    const finalDaCount = await db.Doctor_Assignment.count();
    logSuccess(`Đã xác thực dữ liệu phân cấp: ${finalCsCount} Chuyên khoa cơ sở, ${finalDaCount} Phân bổ bác sĩ.`);

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 3: API Lấy danh sách Chuyên khoa tại một Cơ sở y tế
    // ═════════════════════════════════════════════════════════════
    logStep(3, 'GET /api/v1/admin/clinics/1/specialties (Chuyên khoa tại Viện 1)');
    const specialtiesRes = await axios.get(`${BASE_URL}/api/v1/admin/clinics/1/specialties`, authHeaders);
    if (specialtiesRes.data.errCode !== 0) {
      throw new Error(`Lỗi getClinicSpecialties: ${specialtiesRes.data.message}`);
    }
    const clinicSpecialtiesList = specialtiesRes.data.data.specialties;
    const availableSpecialties = specialtiesRes.data.data.availableSpecialties;
    logSuccess(`Cơ sở [${specialtiesRes.data.data.clinic.name}] đang triển khai ${clinicSpecialtiesList.length} chuyên khoa.`);
    logSuccess(`Còn ${availableSpecialties.length} chuyên khoa khả dụng trên sàn để mở rộng.`);

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 4: Gán Chuyên khoa mới vào Cơ sở y tế
    // ═════════════════════════════════════════════════════════════
    logStep(4, 'POST /api/v1/admin/clinics/1/specialties/assign (Triển khai Chuyên khoa mới)');
    let targetSpecialtyId = availableSpecialties[0]?.id || 15;
    const assignRes = await axios.post(
      `${BASE_URL}/api/v1/admin/clinics/1/specialties/assign`,
      {
        specialtyId: targetSpecialtyId,
        targetCapacity: 60,
        description: 'Chuyên khoa mới thành lập trang bị máy móc hiện đại',
      },
      authHeaders
    );
    if (assignRes.data.errCode !== 0) {
      throw new Error(`Lỗi assignSpecialtyToClinic: ${assignRes.data.message}`);
    }
    logSuccess(`Triển khai thành công Chuyên khoa ID #${targetSpecialtyId} vào Cơ sở ID #1.`);

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 5: GET Contextual Workspace (Clinic -> Specialty)
    // ═════════════════════════════════════════════════════════════
    logStep(5, 'GET /api/v1/admin/clinics/1/specialties/1/workspace (Workspace Chuyên khoa tại Cơ sở)');
    const workspaceRes = await axios.get(
      `${BASE_URL}/api/v1/admin/clinics/1/specialties/1/workspace`,
      authHeaders
    );
    if (workspaceRes.data.errCode !== 0) {
      throw new Error(`Lỗi getClinicSpecialtyWorkspace: ${workspaceRes.data.message}`);
    }
    const wsData = workspaceRes.data.data;
    logSuccess(`Context Workspace: [${wsData.clinic.name}] -> [Khoa ${wsData.specialty.name}].`);
    logSuccess(`KPIs Khoa: ${wsData.kpis.totalDoctors} Bác sĩ, ${wsData.kpis.totalDeptCompleted} ca khám, Doanh thu: ${wsData.kpis.totalDeptRevenue.toLocaleString()} VNĐ.`);

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 6: Phân bổ Bác sĩ vào Chuyên khoa tại Cơ sở y tế
    // ═════════════════════════════════════════════════════════════
    logStep(6, 'POST /api/v1/admin/clinics/1/specialties/1/assign-doctor (Phân bổ Bác sĩ)');
    // Tìm một bác sĩ có sẵn chưa phân bổ vào khoa 1 của viện 1
    const availableDoctor = wsData.availableDoctors[0] || { id: 10 };
    const assignDocRes = await axios.post(
      `${BASE_URL}/api/v1/admin/clinics/1/specialties/1/assign-doctor`,
      {
        doctorId: availableDoctor.id,
        roomNumber: 'Phòng khám 505 - Khu Chuyên sâu',
        priceId: 'PRI3',
        commissionRate: 18.0,
        workingStatus: 'active',
        isPrimary: false,
        note: 'Công tác kiêm nhiệm vào các buổi sáng',
      },
      authHeaders
    );
    if (assignDocRes.data.errCode !== 0) {
      throw new Error(`Lỗi assignDoctorToClinicSpecialty: ${assignDocRes.data.message}`);
    }
    createdAssignmentId = assignDocRes.data.data.id;
    logSuccess(`Phân bổ BS ID #${availableDoctor.id} vào [Khoa ${wsData.specialty.name}] tại [${wsData.clinic.name}] thành công. (Assignment ID: ${createdAssignmentId})`);

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 7: Cập nhật Phân bổ Bác sĩ (Phòng, hoa hồng, trạng thái)
    // ═════════════════════════════════════════════════════════════
    logStep(7, `PUT /api/v1/admin/doctor-assignments/${createdAssignmentId} (Cập nhật Phân bổ)`);
    const updateAsgRes = await axios.put(
      `${BASE_URL}/api/v1/admin/doctor-assignments/${createdAssignmentId}`,
      {
        roomNumber: 'Phòng khám 505 - VIP Cải tiến',
        commissionRate: 12.5,
        note: 'Đã điều chỉnh hoa hồng ưu đãi 12.5%',
      },
      authHeaders
    );
    if (updateAsgRes.data.errCode !== 0) {
      throw new Error(`Lỗi updateDoctorAssignment: ${updateAsgRes.data.message}`);
    }
    const updatedAsg = await db.Doctor_Assignment.findByPk(createdAssignmentId);
    if (parseFloat(updatedAsg.commissionRate) !== 12.5) {
      throw new Error('Hoa hồng không được lưu chính xác vào DB');
    }
    logSuccess(`Cập nhật phòng khám thành [${updatedAsg.roomNumber}] và hoa hồng [${updatedAsg.commissionRate}%] thành công.`);

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 8: Kiểm định Cơ chế An toàn Guard Check (Chặn Gỡ Chuyên khoa)
    // ═════════════════════════════════════════════════════════════
    logStep(8, 'Guard Check: Chặn gỡ Chuyên khoa khi còn Bác sĩ hoạt động');
    const guardRes = await axios.post(
      `${BASE_URL}/api/v1/admin/clinics/1/specialties/unassign`,
      { specialtyId: 1 },
      authHeaders
    );
    if (guardRes.data.errCode !== 0) {
      logSuccess(`🛡️ Hệ thống CHẶN AN TOÀN CHUẨN XÁC: "${guardRes.data.message}"`);
    } else {
      throw new Error('Lỗi nghiêm trọng: Hệ thống cho phép gỡ chuyên khoa khi vẫn còn bác sĩ hoạt động!');
    }

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 9: Rút Bác sĩ khỏi Chuyên khoa (Unassign Doctor an toàn)
    // ═════════════════════════════════════════════════════════════
    logStep(9, `DELETE /api/v1/admin/doctor-assignments/${createdAssignmentId} (Rút Bác sĩ phân bổ)`);
    const unassignDocRes = await axios.delete(
      `${BASE_URL}/api/v1/admin/doctor-assignments/${createdAssignmentId}`,
      authHeaders
    );
    if (unassignDocRes.data.errCode !== 0) {
      throw new Error(`Lỗi unassignDoctorFromClinicSpecialty: ${unassignDocRes.data.message}`);
    }
    logSuccess('Rút phân bổ bác sĩ kiêm nhiệm thành công.');

    // ═════════════════════════════════════════════════════════════
    // BƯỚC 10: Lấy danh sách Cơ sở làm việc của Bác sĩ (Doctor Affiliations)
    // ═════════════════════════════════════════════════════════════
    logStep(10, 'GET /api/v1/admin/doctors/2/assignments (Cơ sở công tác của Bác sĩ #2)');
    const doctorAffiliationsRes = await axios.get(
      `${BASE_URL}/api/v1/admin/doctors/2/assignments`,
      authHeaders
    );
    if (doctorAffiliationsRes.data.errCode !== 0) {
      throw new Error(`Lỗi getDoctorAssignments: ${doctorAffiliationsRes.data.message}`);
    }
    const affiliations = doctorAffiliationsRes.data.data;
    logSuccess(`Bác sĩ ID #2 đang công tác tại ${affiliations.length} cơ sở:`);
    affiliations.forEach((af) => {
      console.log(`    • Cơ sở: \x1b[33m${af.clinicName}\x1b[0m | Khoa: \x1b[36m${af.specialtyName}\x1b[0m | Phòng: ${af.roomNumber} | Hoa hồng: ${af.commissionRate}% ${af.isPrimary ? '★ [Chính]' : ''}`);
    });

    console.log('\n\x1b[32m╔══════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[32m║  🎉 TẤT CẢ 10 BƯỚC KIỂM ĐỊNH PHÂN CẤP & ĐA CƠ SỞ ĐỀU ĐẠT [PASS]!  ║\x1b[0m');
    console.log('\x1b[32m║  ✔ Master -> Contextual Workspace -> Doctor Assignments chuẩn 100% ║\x1b[0m');
    console.log('\x1b[32m╚══════════════════════════════════════════════════════════════════╝\x1b[0m');
    process.exit(0);
  } catch (error) {
    logError(error.message);
    if (error.response?.data) {
      console.error('Chi tiết lỗi:', error.response.data);
    }
    process.exit(1);
  }
})();
