// scripts/verify-clinic-specialty-operations.js
// ════════════════════════════════════════════════════════════════════════════════
// END-TO-END CLINIC & SPECIALTY OPERATIONS VERIFICATION SUITE
// ════════════════════════════════════════════════════════════════════════════════
// Mục đích:
// Kiểm chứng 100% tính đúng đắn khi thao tác thực tế với phân hệ:
// 1. Quản lý Cơ sở Y tế (Clinic Control Center)
// 2. Quản lý Chuyên khoa (Specialty Intelligence Hub)
// 3. Phân bổ Bác sĩ vào Cơ sở (Doctor Assignment)
// 4. Cấu hình Tỷ lệ Hoa hồng Cơ sở (Clinic Commission)
// 5. Bật/Tắt Trạng thái Hoạt động Cơ sở & Chuyên khoa (Health Status Governance)
// 6. Tính toán Công suất lấp đầy slot tuần & Ma trận cung cầu
// ════════════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const db = require('../src/models');
const clinicManageService = require('../src/services/clinicManageService');
const specialtyManageService = require('../src/services/specialtyManageService');

const logStep = (step, title) => {
  console.log(`\n\x1b[36m[BƯỚC ${step}]\x1b[0m \x1b[1m${title}\x1b[0m`);
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(`\x1b[31m❌ THẤT BẠI:\x1b[0m ${message}`);
    throw new Error(message);
  }
  console.log(`\x1b[32m  ✔ [PASS]\x1b[0m ${message}`);
};

async function runVerification() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   🔍 KIỂM ĐỊNH LUỒNG VẬN HÀNH PHÒNG KHÁM & CHUYÊN KHOA E2E       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  await db.sequelize.authenticate();
  console.log('>>> Database kết nối thành công.');

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 1: Kiểm định Master List Cơ sở Y tế & KPIs tổng hợp
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(1, 'Kiểm định Master List Cơ sở Y tế & KPIs tổng hợp');
  const clinicsRes = await clinicManageService.getAdminClinicsList({ page: 1, limit: 10 });
  assert(clinicsRes.errCode === 0, 'API getAdminClinicsList trả về mã thành công errCode = 0');
  assert(clinicsRes.data?.clinics?.length > 0, `Lấy thành công danh sách ${clinicsRes.data?.clinics?.length} cơ sở y tế`);
  assert(clinicsRes.data?.summaryKpis?.totalClinics >= 10, `Tổng số cơ sở toàn mạng lưới: ${clinicsRes.data?.summaryKpis?.totalClinics}`);
  assert(clinicsRes.data?.summaryKpis?.totalAssignedDoctors > 0, `Tổng bác sĩ đã phân bổ vào cơ sở: ${clinicsRes.data?.summaryKpis?.totalAssignedDoctors}`);
  assert(clinicsRes.data?.summaryKpis?.avgUtilizationRate >= 0, `Tỷ lệ lấp đầy trung bình toàn sàn: ${clinicsRes.data?.summaryKpis?.avgUtilizationRate}%`);

  const sampleClinic = clinicsRes.data?.clinics?.[0];
  assert(sampleClinic.id && sampleClinic.name, `Cơ sở mẫu: [${sampleClinic.name}] (ID: ${sampleClinic.id})`);
  assert(sampleClinic.healthStatus, `Trạng thái vận hành tự động: [${sampleClinic.healthStatus}]`);
  assert(Array.isArray(sampleClinic.specialties), `Danh sách chuyên khoa tại viện: ${sampleClinic.specialties.join(', ') || 'Đa khoa'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 2: Kiểm định Clinic Control Center Workspace Hub
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(2, `Kiểm định Clinic Control Center Workspace cho cơ sở ID=${sampleClinic.id}`);
  const hubRes = await clinicManageService.getAdminClinicControlCenter(sampleClinic.id);
  assert(hubRes.errCode === 0, 'API getAdminClinicControlCenter trả về errCode = 0');
  assert(hubRes.data?.profile?.name === sampleClinic.name, 'Thông tin profile cơ sở khớp dữ liệu');
  assert(hubRes.data?.kpis?.weeklySlots >= 0, `Tổng số slot lịch tuần này: ${hubRes.data?.kpis?.weeklySlots} slot`);
  assert(Array.isArray(hubRes.data?.doctors), `Đội ngũ bác sĩ công tác tại viện: ${hubRes.data?.doctors?.length} bác sĩ`);
  assert(Array.isArray(hubRes.data?.specialties), `Số lượng chuyên khoa tại viện: ${hubRes.data?.specialties?.length} khoa`);
  assert(Array.isArray(hubRes.data?.weeklySchedule), `Ma trận lịch khám tuần có: ${hubRes.data?.weeklySchedule?.length} ca`);
  assert(Array.isArray(hubRes.data?.performance), `Thống kê xu hướng 7 ngày: ${hubRes.data?.performance?.length} điểm dữ liệu`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 3: Thao tác thực tế Điều chỉnh Hoa hồng Cơ sở (Commission Config)
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(3, 'Thao tác thực tế Điều chỉnh Tỷ lệ Hoa hồng Cơ sở & Đối chiếu DB');
  const oldRate = sampleClinic.commissionRate || 15;
  const testRate = 18.5;

  const updateCommRes = await clinicManageService.updateClinicCommission(sampleClinic.id, { commissionRate: testRate });
  assert(updateCommRes.errCode === 0, 'API updateClinicCommission thực thi thành công');

  const checkClinicDb = await db.Clinic.findByPk(sampleClinic.id);
  assert(parseFloat(checkClinicDb.commissionRate) === testRate, `Database cập nhật chính xác hoa hồng cơ sở = ${testRate}%`);

  // Khôi phục lại hoa hồng ban đầu
  await clinicManageService.updateClinicCommission(sampleClinic.id, { commissionRate: oldRate });
  console.log(`  ✔ [RESTORE] Đã hoàn trả hoa hồng cơ sở về ${oldRate}%`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 4: Thao tác thực tế Bật/Tắt Trạng thái Hoạt động Cơ sở (Working Status)
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(4, 'Thao tác thực tế Bật/Tắt Trạng thái Hoạt động Cơ sở');
  const pauseRes = await clinicManageService.updateClinicWorkingStatus(sampleClinic.id, { status: 'paused' });
  assert(pauseRes.errCode === 0, 'Chuyển trạng thái cơ sở sang [paused] thành công');

  const pausedDb = await db.Clinic.findByPk(sampleClinic.id);
  assert(pausedDb.status === 'paused', 'Database xác nhận cơ sở đã chuyển sang [paused]');

  const activeRes = await clinicManageService.updateClinicWorkingStatus(sampleClinic.id, { status: 'active' });
  assert(activeRes.errCode === 0, 'Kích hoạt lại cơ sở sang [active] thành công');

  const activeDb = await db.Clinic.findByPk(sampleClinic.id);
  assert(activeDb.status === 'active', 'Database xác nhận cơ sở đã kích hoạt trở lại [active]');

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 5: Thao tác thực tế Phân bổ Bác sĩ vào Cơ sở (Doctor Assignment)
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(5, 'Thao tác thực tế Phân bổ Bác sĩ vào Cơ sở Y tế (Doctor Assignment)');
  const doctorCandidate = await db.User.findOne({ where: { roleId: 'R2' } });
  assert(doctorCandidate, `Chọn bác sĩ ứng viên: [${doctorCandidate.lastName} ${doctorCandidate.firstName}] (ID: ${doctorCandidate.id})`);

  const assignRes = await clinicManageService.assignDoctorToClinic(sampleClinic.id, { doctorId: doctorCandidate.id });
  assert(assignRes.errCode === 0, `API assignDoctorToClinic thực thi thành công`);

  const doctorInfoDb = await db.Doctor_Info.findOne({ where: { doctorId: doctorCandidate.id } });
  assert(doctorInfoDb.clinicId === sampleClinic.id, `Doctor_Info xác nhận bác sĩ ID=${doctorCandidate.id} đã thuộc cơ sở ID=${sampleClinic.id}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 6: Kiểm định Master List Chuyên khoa & Chỉ số Cung - Cầu
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(6, 'Kiểm định Master List Chuyên khoa & Chỉ số Cung - Cầu (Demand Balance)');
  const specialtiesRes = await specialtyManageService.getAdminSpecialtiesList({ page: 1, limit: 15 });
  assert(specialtiesRes.errCode === 0, 'API getAdminSpecialtiesList trả về errCode = 0');
  assert(specialtiesRes.data?.specialties?.length >= 10, `Lấy thành công danh sách ${specialtiesRes.data?.specialties?.length} chuyên khoa`);
  assert(specialtiesRes.data?.summaryKpis?.totalSpecialties >= 15, `Tổng số chuyên khoa toàn hệ thống: ${specialtiesRes.data?.summaryKpis?.totalSpecialties}`);
  assert(specialtiesRes.data?.summaryKpis?.totalSpecialists > 0, `Tổng số bác sĩ chuyên khoa: ${specialtiesRes.data?.summaryKpis?.totalSpecialists}`);
  assert(specialtiesRes.data?.summaryKpis?.totalHospitalsCovered > 0, `Số cơ sở tiếp nhận chuyên khoa: ${specialtiesRes.data?.summaryKpis?.totalHospitalsCovered}`);

  const sampleSpecialty = specialtiesRes.data?.specialties?.[0];
  assert(sampleSpecialty.id && sampleSpecialty.name, `Chuyên khoa mẫu: [${sampleSpecialty.name}] (ID: ${sampleSpecialty.id})`);
  assert(sampleSpecialty.healthBalance, `Chỉ số Cung - Cầu thị trường: [${sampleSpecialty.healthBalance}]`);
  assert(sampleSpecialty.totalDoctors >= 0, `Số bác sĩ phụ trách chuyên khoa: ${sampleSpecialty.totalDoctors}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 7: Kiểm định Specialty Intelligence Workspace
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(7, `Kiểm định Specialty Intelligence Workspace cho khoa ID=${sampleSpecialty.id}`);
  const spWsRes = await specialtyManageService.getAdminSpecialtyWorkspace(sampleSpecialty.id);
  assert(spWsRes.errCode === 0, 'API getAdminSpecialtyWorkspace trả về errCode = 0');
  assert(spWsRes.data?.profile?.name === sampleSpecialty.name, 'Thông tin tên chuyên khoa khớp dữ liệu');
  assert(Array.isArray(spWsRes.data?.doctors), `Danh sách bác sĩ thuộc khoa: ${spWsRes.data?.doctors?.length} bác sĩ`);
  assert(Array.isArray(spWsRes.data?.clinics), `Mạng lưới bệnh viện triển khai khoa: ${spWsRes.data?.clinics?.length} cơ sở`);
  assert(spWsRes.data?.demandIntelligence?.peakHour, `Khung giờ cao điểm của khoa: ${spWsRes.data?.demandIntelligence?.peakHour}`);
  assert(Array.isArray(spWsRes.data?.recentBookings), `Lịch sử lượt khám chuyên khoa: ${spWsRes.data?.recentBookings?.length} ca`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BƯỚC 8: Thao tác Bật/Tắt Trạng thái Chuyên khoa
  // ─────────────────────────────────────────────────────────────────────────────
  logStep(8, 'Thao tác thực tế Bật/Tắt Trạng thái Chuyên khoa');
  const pauseSpRes = await specialtyManageService.updateSpecialtyWorkingStatus(sampleSpecialty.id, { status: 'paused' });
  assert(pauseSpRes.errCode === 0, 'Tạm ngưng chuyên khoa thành công');

  const pausedSpDb = await db.Specialty.findByPk(sampleSpecialty.id);
  assert(pausedSpDb.status === 'paused', 'Database xác nhận chuyên khoa đã chuyển sang [paused]');

  const activeSpRes = await specialtyManageService.updateSpecialtyWorkingStatus(sampleSpecialty.id, { status: 'active' });
  assert(activeSpRes.errCode === 0, 'Kích hoạt lại chuyên khoa thành công');

  const activeSpDb = await db.Specialty.findByPk(sampleSpecialty.id);
  assert(activeSpDb.status === 'active', 'Database xác nhận chuyên khoa đã kích hoạt trở lại [active]');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   🎉 TẤT CẢ 8 BƯỚC KIỂM ĐỊNH VẬN HÀNH THỰC TẾ ĐỀU ĐẠT 100% PASS   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal Verification Error:', err);
    process.exit(1);
  });
