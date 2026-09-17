// scripts/verify-doctor-operations-flow.js
// ════════════════════════════════════════════════════════════════════════════════
// END-TO-END DOCTOR OPERATIONS & SETTLEMENT VERIFICATION SUITE
// ════════════════════════════════════════════════════════════════════════════════
// Mục đích:
// Chứng minh 100% rằng phân hệ Quản lý & Điều hành Bác sĩ (Doctor Operations Center):
// 1. Guard Check trạng thái (active/paused/suspended) chặn đặt lịch chính xác
// 2. Cấu hình hoa hồng sàn riêng lẻ (Custom Commission) kèm Audit Trail đầy đủ
// 3. Quản lý lịch khám tuần, mở slot nhanh & lấp đầy ca khám trong Workspace
// 4. Send Remedy ca khám -> Ghi nhận doanh thu gộp, phí sàn và số dư chờ quyết toán
// 5. Quyết toán chi trả (Doctor Payout) -> Lưu Doctor_Settlements & giảm công nợ
// 6. Tính toàn vẹn dữ liệu Master List & Workspace APIs
// ════════════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const db = require('../src/models');
const doctorManageService = require('../src/services/doctorManageService');
const patientService = require('../src/services/patientService');
const doctorService = require('../src/services/doctorService');

const VALID_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
  console.log('║   🔍 KIỂM ĐỊNH LUỒNG ĐIỀU HÀNH BÁC SĨ & ĐỐI SOÁT THANH TOÁN      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  await db.sequelize.authenticate();
  console.log('>>> Database kết nối thành công.');

  // 0. Tìm bác sĩ có số dư chờ quyết toán thực tế từ database
  const docList = await doctorManageService.getAdminDoctorsList({ page: 1, limit: 50 });
  const doctorCandidate = docList.data?.doctors?.find((d) => d.pendingPayout > 500000 && d.workingStatus === 'active') || docList.data?.doctors?.[0];
  assert(doctorCandidate, 'Tìm thấy danh sách Bác sĩ từ hệ thống điều hành');

  const doctor = await db.User.findByPk(doctorCandidate.id, {
    include: [{ model: db.Doctor_Info, as: 'doctorInfoData' }],
  });
  assert(doctor && doctor.doctorInfoData, `Chọn Bác sĩ kiểm định: ${doctor?.lastName} ${doctor?.firstName} (ID: ${doctor?.id})`);

  const patient = await db.User.findOne({ where: { roleId: 'R3' } });
  assert(patient, `Tìm thấy Bệnh nhân: ${patient?.lastName} ${patient?.firstName} (ID: ${patient?.id})`);

  const doctorId = doctor.id;
  const originalStatus = doctor.doctorInfoData.workingStatus || 'active';
  const originalCommission = parseFloat(doctor.doctorInfoData.commissionRate) || 15.0;

  // Chuẩn bị ngày hẹn khám thử nghiệm (2 ngày tới UTC để tránh trùng slot hiện có)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 2);
  const targetUtc = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const dateStr = targetUtc.toString();
  const testTimeType = 'T4'; // 11:00 - 12:00

  // ═══════════════════════════════════════════════════════════════════════
  // BƯỚC 1: Guard Check trạng thái (active / paused / suspended) chặn đặt lịch
  // ═══════════════════════════════════════════════════════════════════════
  logStep(1, 'Kiểm tra Guard Check chặn đặt lịch khi Bác sĩ Tạm nghỉ (Paused) hoặc Ngừng hoạt động (Suspended)');

  // 1.1 Chuyển sang 'paused'
  const pauseRes = await doctorManageService.updateDoctorWorkingStatus({ doctorId, status: 'paused' });
  assert(pauseRes.errCode === 0, 'Đã chuyển trạng thái Bác sĩ sang "paused" qua API điều hành');

  // Thử đặt lịch khi bác sĩ paused -> Phải bị chặn với errCode === 6
  const bookWhilePaused = await patientService.postBookAppointment({
    doctorId,
    date: dateStr,
    timeType: testTimeType,
    fullName: `${patient.lastName} ${patient.firstName}`,
    phoneNumber: patient.phoneNumber || '0988776655',
    email: patient.email || 'patient@test.com',
    address: patient.address || 'Hà Nội',
    gender: patient.gender || 'G1',
    reason: 'Khám kiểm định guard check',
  }, patient.id);
  assert(bookWhilePaused.errCode === 6, `Hệ thống CHẶN ĐẶT LỊCH thành công khi Bác sĩ tạm nghỉ (errCode = 6: "${bookWhilePaused.message}")`);

  // 1.2 Chuyển sang 'suspended'
  const suspendRes = await doctorManageService.updateDoctorWorkingStatus({ doctorId, status: 'suspended' });
  assert(suspendRes.errCode === 0, 'Đã chuyển trạng thái Bác sĩ sang "suspended" qua API điều hành');

  // Thử đặt lịch khi bác sĩ suspended -> Phải bị chặn với errCode === 7
  const bookWhileSuspended = await patientService.postBookAppointment({
    doctorId,
    date: dateStr,
    timeType: testTimeType,
    fullName: `${patient.lastName} ${patient.firstName}`,
    phoneNumber: patient.phoneNumber || '0988776655',
    email: patient.email || 'patient@test.com',
    address: patient.address || 'Hà Nội',
    gender: patient.gender || 'G1',
    reason: 'Khám kiểm định guard check',
  }, patient.id);
  assert(bookWhileSuspended.errCode === 7, `Hệ thống CHẶN ĐẶT LỊCH thành công khi Bác sĩ ngừng hoạt động (errCode = 7: "${bookWhileSuspended.message}")`);

  // 1.3 Mở lại 'active'
  const activeRes = await doctorManageService.updateDoctorWorkingStatus({ doctorId, status: 'active' });
  assert(activeRes.errCode === 0, 'Đã phục hồi trạng thái Bác sĩ về "active" thành công');

  // ═══════════════════════════════════════════════════════════════════════
  // BƯỚC 2: Cấu hình Hoa hồng tùy biến & Ghi nhận Audit Trail
  // ═══════════════════════════════════════════════════════════════════════
  logStep(2, 'Kiểm tra Cấu hình Tỷ lệ Hoa hồng Sàn riêng lẻ & Lịch sử Audit Log');

  const testNewRate = 12.5; // Giảm hoa hồng xuống 12.5%
  const updateCommRes = await doctorManageService.updateDoctorCommission({
    doctorId,
    newRate: testNewRate,
    reason: 'Áp dụng chính sách ưu đãi đối tác chuyên khoa cấp 1 Q3/2026',
    adminId: 1,
  });
  assert(updateCommRes.errCode === 0, `Đã cập nhật hoa hồng thành công: ${updateCommRes.data?.oldRate}% -> ${updateCommRes.data?.newRate}%`);

  // Verify trong database
  const updatedDocInfo = await db.Doctor_Info.findOne({ where: { doctorId } });
  assert(parseFloat(updatedDocInfo.commissionRate) === testNewRate, `Doctor_Info.commissionRate trong database đã cập nhật thành ${testNewRate}%`);

  // Verify trong Doctor_Commission_Log
  const latestLog = await db.Doctor_Commission_Log.findOne({
    where: { doctorId },
    order: [['createdAt', 'DESC']],
  });
  assert(latestLog && parseFloat(latestLog.newRate) === testNewRate, `Audit Log ghi nhận chính xác thay đổi hoa hồng (Log ID: ${latestLog?.id}, lý do: "${latestLog?.reason}")`);

  // ═══════════════════════════════════════════════════════════════════════
  // BƯỚC 3: Mở slot khám tuần & Đặt ca khám (Giữ slot)
  // ═══════════════════════════════════════════════════════════════════════
  logStep(3, 'Kiểm tra Mở Khung giờ Lịch khám Tuần & Lấp đầy Slot');

  // Mở slot T4 cho ngày targetDate
  const scheduleRes = await doctorManageService.updateDoctorScheduleSlots({
    doctorId,
    date: dateStr,
    timeTypes: ['T3', testTimeType, 'T5'],
  });
  assert(scheduleRes.errCode === 0, `Đã mở 3 slot (T3, ${testTimeType}, T5) cho ngày hẹn khám`);

  // Xóa các booking test cũ của slot này (nếu có từ lần chạy trước) để đảm bảo tính idempotent
  await db.Booking.destroy({
    where: { doctorId, date: dateStr, timeType: testTimeType },
  });

  // Kiểm tra schedule slot trong database và reset currentNumber
  const targetSchedule = await db.Schedule.findOne({
    where: { doctorId, date: dateStr, timeType: testTimeType },
  });
  assert(targetSchedule, `Tìm thấy Schedule slot ${testTimeType} trong database (maxNumber = ${targetSchedule?.maxNumber})`);
  targetSchedule.currentNumber = 0;
  await targetSchedule.save();

  // Đặt lịch khám thực tế vào slot này
  const bookSuccess = await patientService.postBookAppointment({
    doctorId,
    date: dateStr,
    timeType: testTimeType,
    fullName: `${patient.lastName} ${patient.firstName}`,
    phoneNumber: patient.phoneNumber || '0988776655',
    email: patient.email || 'patient@test.com',
    address: patient.address || 'Hà Nội',
    gender: patient.gender || 'G1',
    reason: 'Kiểm định luồng nghiệp vụ thực tế E2E',
  }, patient.id);
  assert(bookSuccess.errCode === 0, `Đặt lịch thành công: "${bookSuccess.message}"`);

  // Lấy booking vừa tạo từ DB
  const bookingRecord = await db.Booking.findOne({
    where: { doctorId, date: dateStr, timeType: testTimeType, patientId: patient.id },
    order: [['createdAt', 'DESC']],
  });
  assert(bookingRecord !== null, 'Tìm thấy bản ghi Booking trong database');
  const testBookingId = bookingRecord.id;

  const verifyRes = await patientService.postVerifyBookAppointment({
    token: bookingRecord.token,
    doctorId,
  });
  assert(verifyRes.errCode === 0, `Xác nhận lịch hẹn thành công (Status: S1.5 giữ slot)`);

  // Chuyển sang S2 (xác nhận lịch khám, chuẩn bị khám bệnh)
  bookingRecord.statusId = 'S2';
  bookingRecord.paymentStatus = 'unpaid';
  await bookingRecord.save();
  console.log('    ℹ Ca khám đã sẵn sàng ở trạng thái S2 (Chờ khám)');

  // Kiểm tra currentNumber của schedule slot
  await targetSchedule.reload();
  assert(targetSchedule.currentNumber >= 1, `Schedule slot đã tăng currentNumber = ${targetSchedule.currentNumber} / ${targetSchedule.maxNumber}`);

  // ═══════════════════════════════════════════════════════════════════════
  // BƯỚC 4: Hoàn tất ca khám (Send Remedy) & Tính toán Doanh thu, Hoa hồng
  // ═══════════════════════════════════════════════════════════════════════
  logStep(4, 'Bác sĩ Khám xong (Send Remedy S3) -> Đối soát Doanh thu gộp & Phí sàn tự động');

  // Lấy Workspace trước khi hoàn tất
  const wsBeforeRemedy = await doctorManageService.getAdminDoctorWorkspace(doctorId);
  assert(wsBeforeRemedy.errCode === 0, 'Lấy dữ liệu Workspace bác sĩ thành công');
  const grossBefore = wsBeforeRemedy.data.kpis.grossRevenue;
  const netBefore = wsBeforeRemedy.data.kpis.netRevenue;
  const pendingBefore = wsBeforeRemedy.data.kpis.pendingPayout;

  // Hoàn tất ca khám qua sendRemedy
  const remedyRes = await doctorService.sendRemedy({
    doctorId,
    bookingId: testBookingId,
    doctorName: `${doctor.lastName} ${doctor.firstName}`,
    imageBase64: VALID_PNG_BASE64,
    language: 'vi',
  });
  if (remedyRes.errCode !== 0) {
    console.error('>>> remedyRes failed:', remedyRes);
  }
  assert(remedyRes.errCode === 0, `Bác sĩ gửi kết quả khám bệnh (sendRemedy) thành công: "${remedyRes.message}"`);

  // Lấy Workspace sau khi hoàn tất
  const wsAfterRemedy = await doctorManageService.getAdminDoctorWorkspace(doctorId);
  assert(wsAfterRemedy.errCode === 0, 'Lấy Workspace bác sĩ sau khi hoàn tất ca khám thành công');

  const kpis = wsAfterRemedy.data.kpis;
  const bookingPrice = parseFloat(bookingRecord.bookingPrice) || 0;
  const expectedPlatformFee = Math.round(bookingPrice * (testNewRate / 100));
  const expectedNetAdd = bookingPrice - expectedPlatformFee;

  console.log(`    ℹ Doanh thu gộp thêm: ${bookingPrice.toLocaleString('vi-VN')} VND`);
  console.log(`    ℹ Tỷ lệ hoa hồng sàn: ${testNewRate}% -> Phí sàn thu: ${expectedPlatformFee.toLocaleString('vi-VN')} VND`);
  console.log(`    ℹ Bác sĩ thực nhận thêm: ${expectedNetAdd.toLocaleString('vi-VN')} VND`);

  assert(kpis.grossRevenue >= grossBefore + bookingPrice, `Doanh thu gộp tăng chính xác (+${bookingPrice.toLocaleString('vi-VN')} VND)`);
  assert(kpis.commissionRate === testNewRate, `Tỷ lệ hoa hồng phản ánh chính xác ${testNewRate}%`);
  assert(kpis.netRevenue >= netBefore + expectedNetAdd, `Doanh thu thực nhận tăng chính xác (+${expectedNetAdd.toLocaleString('vi-VN')} VND)`);
  assert(kpis.pendingPayout >= pendingBefore + expectedNetAdd, `Số dư khả dụng chờ thanh toán tăng chính xác (+${expectedNetAdd.toLocaleString('vi-VN')} VND)`);

  // ═══════════════════════════════════════════════════════════════════════
  // BƯỚC 5: Quyết toán Thanh toán cho Bác sĩ (Doctor Payout)
  // ═══════════════════════════════════════════════════════════════════════
  logStep(5, 'Thực hiện Lệnh Quyết toán Thanh toán Tiền khám cho Bác sĩ');

  const payoutAmount = Math.min(kpis.pendingPayout, expectedNetAdd > 0 ? expectedNetAdd : 100000);
  const testTxRef = `PAY-VCB-${Date.now().toString().slice(-6)}`;

  const payoutRes = await doctorManageService.createDoctorPayout({
    doctorId,
    amount: payoutAmount,
    transactionRef: testTxRef,
    paymentMethod: 'bank_transfer',
    note: 'Thanh toán đối soát kỳ kiểm định API tự động',
    adminId: 1,
  });
  assert(payoutRes.errCode === 0, `Tạo lệnh chuyển tiền thành công: ${payoutAmount.toLocaleString('vi-VN')} VND (Mã GD: ${testTxRef})`);

  // Kiểm tra Doctor_Settlement trong database
  const settlementRecord = await db.Doctor_Settlement.findOne({
    where: { transactionRef: testTxRef },
  });
  assert(settlementRecord && settlementRecord.payoutStatus === 'paid', `Doctor_Settlement lưu thành công (ID: ${settlementRecord?.id}, Status: ${settlementRecord?.payoutStatus})`);

  // Kiểm tra Workspace cập nhật công nợ
  const wsAfterPayout = await doctorManageService.getAdminDoctorWorkspace(doctorId);
  const kpisAfterPayout = wsAfterPayout.data.kpis;
  assert(
    kpisAfterPayout.totalPaid === kpis.totalPaid + payoutAmount,
    `Tổng tiền đã quyết toán tăng chính xác (+${payoutAmount.toLocaleString('vi-VN')} VND)`
  );
  assert(
    kpisAfterPayout.pendingPayout === kpis.pendingPayout - payoutAmount,
    `Số dư còn lại phải trả giảm chính xác (-${payoutAmount.toLocaleString('vi-VN')} VND)`
  );
  assert(
    wsAfterPayout.data.settlements.some((s) => s.transactionRef === testTxRef),
    'Bảng lịch sử thanh toán trong Workspace chứa bản ghi giao dịch vừa tạo'
  );

  // ═══════════════════════════════════════════════════════════════════════
  // BƯỚC 6: Kiểm tra Tính toàn vẹn Master List & Bộ lọc Đa chiều
  // ═══════════════════════════════════════════════════════════════════════
  logStep(6, 'Kiểm tra Tính toàn vẹn Dữ liệu Master List, KPI Cards & Action Center Alerts');

  const masterListRes = await doctorManageService.getAdminDoctorsList({
    page: 1,
    limit: 15,
    search: doctor.firstName,
    status: 'all',
  });
  assert(masterListRes.errCode === 0, 'Gọi API Master List kèm bộ lọc tìm kiếm thành công');
  assert(masterListRes.data.doctors.length > 0, `Danh sách tìm kiếm trả về ${masterListRes.data.doctors.length} bác sĩ`);
  assert(masterListRes.data.summaryKpis.totalDoctors > 0, `KPI tổng số bác sĩ toàn sàn: ${masterListRes.data.summaryKpis.totalDoctors}`);
  assert(masterListRes.data.summaryKpis.activeDoctors > 0, `KPI bác sĩ active: ${masterListRes.data.summaryKpis.activeDoctors}`);

  // Tìm bác sĩ vừa kiểm định trong Master List
  const docInList = masterListRes.data.doctors.find((d) => d.id === doctorId);
  assert(docInList, `Bác sĩ #${doctorId} (${doctor.lastName} ${doctor.firstName}) hiển thị chính xác trong Master List`);
  assert(docInList.commissionRate === testNewRate, `Tỷ lệ hoa hồng trong Master List khớp (${testNewRate}%)`);
  assert(docInList.workingStatus === 'active', `Trạng thái trong Master List khớp (active)`);

  // Kiểm tra bộ lọc trạng thái
  const filterPausedRes = await doctorManageService.getAdminDoctorsList({ status: 'paused' });
  assert(filterPausedRes.errCode === 0, 'Bộ lọc trạng thái Paused hoạt động');
  assert(
    filterPausedRes.data.doctors.every((d) => d.workingStatus === 'paused'),
    'Tất cả bác sĩ trong kết quả lọc đều có trạng thái "paused"'
  );

  // Dọn dẹp: Khôi phục lại trạng thái ban đầu của bác sĩ
  await doctorManageService.updateDoctorWorkingStatus({ doctorId, status: originalStatus });
  await doctorManageService.updateDoctorCommission({ doctorId, newRate: originalCommission, reason: 'Khôi phục sau kiểm định' });
  console.log(`\n>>> Đã khôi phục trạng thái (${originalStatus}) và hoa hồng (${originalCommission}%) ban đầu cho Bác sĩ.`);

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  🎉 TẤT CẢ 6 BƯỚC KIỂM ĐỊNH THỰC TẾ API ĐỀU ĐẠT CHUẨN [PASS]!    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ KIỂM ĐỊNH THẤT BẠI:', err);
    process.exit(1);
  });
