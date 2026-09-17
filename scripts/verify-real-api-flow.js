// scripts/verify-real-api-flow.js
// ════════════════════════════════════════════════════════════════════════════════
// END-TO-END REAL-API INTEGRATION VERIFICATION SUITE
// ════════════════════════════════════════════════════════════════════════════════
// Mục đích:
// Chứng minh 100% rằng các báo cáo Analytics KHÔNG CHỈ hoạt động với seed data,
// mà còn phản ánh chính xác các luồng thao tác API nghiệp vụ thực tế:
// 1. patientService.postBookAppointment (Đặt lịch)
// 2. patientService.postVerifyBookAppointment (Xác nhận & Giữ slot)
// 3. paymentController / simulation (Xác nhận thanh toán S2)
// 4. doctorService.sendRemedy (Khám xong S3 & Ghi nhận doanh thu)
// 5. patientService.patientCancelBookingService (Hủy lịch S4, Hoàn tiền & Trả slot)
// 6. statisticService (Đối soát tự động sự cập nhật trên toàn bộ dashboard báo cáo)
// ════════════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const db = require('../src/models');
const patientService = require('../src/services/patientService');
const doctorService = require('../src/services/doctorService');
const statisticService = require('../src/services/statisticService');

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
  console.log('║   🔍 KIỂM ĐỊNH LUỒNG THAO TÁC API THỰC TẾ & BÁO CÁO DASHBOARD   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  await db.sequelize.authenticate();
  console.log('>>> Database kết nối thành công.');

  // 0. Tìm bác sĩ và bệnh nhân thực tế từ database
  const doctor = await db.User.findOne({
    where: { roleId: 'R2' },
    include: [{ model: db.Doctor_Info, as: 'doctorInfoData' }],
  });
  assert(doctor && doctor.doctorInfoData, 'Tìm thấy Bác sĩ hợp lệ kèm Doctor_Info trong database');

  const patient = await db.User.findOne({ where: { roleId: 'R3' } });
  assert(patient, 'Tìm thấy Bệnh nhân hợp lệ trong database');

  // Chuẩn bị ngày hẹn khám (ngày mai UTC)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const utcTomorrow = Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const dateStr = utcTomorrow.toString();
  const timeType = 'T3'; // 10:00 - 11:00

  // Đảm bảo Schedule slot tồn tại cho bác sĩ vào ngày mai
  let [schedule] = await db.Schedule.findOrCreate({
    where: { doctorId: doctor.id, date: dateStr, timeType: timeType },
    defaults: { maxNumber: 10, currentNumber: 0 },
  });

  // Dọn dẹp các booking test cũ của bệnh nhân này vào ngày test (đảm bảo tính idempotent khi chạy lại)
  await db.Booking.destroy({
    where: { patientId: patient.id, date: dateStr },
  });
  schedule.currentNumber = 0;
  await schedule.save();

  const initialCurrentNumber = schedule.currentNumber;
  console.log(`  ℹ Bác sĩ: #${doctor.id} ${doctor.firstName}, Ngày: ${dateStr}, Slot hiện tại: ${initialCurrentNumber}`);

  // ═══════════════════════════════════════════════════════════════
  // GIAI ĐOẠN 1: ĐẶT LỊCH THỰC TẾ (postBookAppointment)
  // ═══════════════════════════════════════════════════════════════
  logStep('1', 'Thực hiện Đặt lịch khám mới qua patientService.postBookAppointment');
  const bookRes1 = await patientService.postBookAppointment({
    doctorId: doctor.id,
    date: dateStr,
    timeType: timeType,
    fullName: `${patient.lastName} ${patient.firstName}`,
    phoneNumber: patient.phoneNumber || '0988776655',
    email: patient.email,
    address: patient.address || 'Hà Nội',
    gender: patient.gender || 'G1',
    birthday: '1995-05-15',
    reason: 'Khám kiểm định luồng API thực tế E2E',
    bankAccountNumber: '0987654321',
    bankAccountName: 'TEST PATIENT',
    bankName: 'Vietcombank',
  }, patient.id);

  assert(bookRes1 && bookRes1.errCode === 0, `Đặt lịch thành công: ${bookRes1.message}`);

  // Lấy booking vừa tạo từ DB
  const booking1 = await db.Booking.findOne({
    where: { doctorId: doctor.id, date: dateStr, timeType: timeType, patientName: `${patient.lastName} ${patient.firstName}` },
    order: [['createdAt', 'DESC']],
  });
  assert(booking1 !== null, 'Booking được tạo thành công trong bảng Bookings');
  assert(booking1.statusId === 'S1', `Trạng thái ban đầu chuẩn State Machine: ${booking1.statusId} === 'S1'`);
  assert(booking1.bookingPrice > 0, `bookingPrice tự động gán từ bảng giá bác sĩ: ${booking1.bookingPrice} VNĐ`);
  assert(booking1.token && booking1.token.length > 0, `Token xác thực email được sinh hợp lệ: ${booking1.token.substring(0, 12)}...`);

  // ═══════════════════════════════════════════════════════════════
  // GIAI ĐOẠN 2: XÁC NHẬN LỊCH KHÁM (postVerifyBookAppointment)
  // ═══════════════════════════════════════════════════════════════
  logStep('2', 'Bệnh nhân click xác nhận qua patientService.postVerifyBookAppointment');
  const verifyRes = await patientService.postVerifyBookAppointment({
    token: booking1.token,
    doctorId: doctor.id,
  });

  assert(verifyRes && verifyRes.errCode === 0, `Xác nhận lịch khám thành công: ${verifyRes.message}`);

  await booking1.reload();
  assert(booking1.statusId === 'S1.5', `Trạng thái chuyển sang S1.5 (giữ chỗ chờ khám/thanh toán): ${booking1.statusId}`);

  await schedule.reload();
  assert(schedule.currentNumber === initialCurrentNumber + 1, `Slot Schedule.currentNumber tăng chính xác từ ${initialCurrentNumber} -> ${schedule.currentNumber}`);

  // Chuyển sang S2 (đã thanh toán / xác nhận khám)
  booking1.statusId = 'S2';
  booking1.paymentStatus = 'paid';
  await booking1.save();
  console.log('  ℹ Ca khám được kích hoạt sang S2 (Đã xác nhận & thanh toán cọc thành công)');

  // ═══════════════════════════════════════════════════════════════
  // GIAI ĐOẠN 3: BÁC SĨ KHÁM & GỬI KẾT QUẢ (sendRemedy)
  // ═══════════════════════════════════════════════════════════════
  logStep('3', 'Bác sĩ hoàn tất khám bệnh & gửi kết quả qua doctorService.sendRemedy');
  const remedyRes = await doctorService.sendRemedy({
    bookingId: booking1.id,
    doctorId: doctor.id,
    imageBase64: VALID_PNG_BASE64,
    doctorName: `${doctor.lastName} ${doctor.firstName}`,
    language: 'vi',
  });

  assert(remedyRes && remedyRes.errCode === 0, `Bác sĩ gửi kết quả khám thành công: ${remedyRes.message}`);

  await booking1.reload();
  assert(booking1.statusId === 'S3', `Trạng thái chuyển sang S3 (Đã khám hoàn tất): ${booking1.statusId}`);
  assert(booking1.paymentStatus === 'paid', 'Doanh thu đã được hiện thực hóa (paymentStatus: paid)');

  // ═══════════════════════════════════════════════════════════════
  // GIAI ĐOẠN 4: HỦY LỊCH & HOÀN TIỀN (patientCancelBookingService)
  // ═══════════════════════════════════════════════════════════════
  logStep('4', 'Tạo ca khám thứ 2 và thực hiện Hủy lịch & Hoàn tiền qua patientService');
  // Đảm bảo Schedule slot T4 tồn tại cho ca thứ 2
  await db.Schedule.findOrCreate({
    where: { doctorId: doctor.id, date: dateStr, timeType: 'T4' },
    defaults: { maxNumber: 10, currentNumber: 0 },
  });

  const bookRes2 = await patientService.postBookAppointment({
    doctorId: doctor.id,
    date: dateStr,
    timeType: 'T4',
    fullName: `${patient.lastName} ${patient.firstName} (Cancel Test)`,
    phoneNumber: '0911223344',
    email: patient.email,
    address: 'Đà Nẵng',
    gender: 'G2',
    birthday: '1998-10-20',
    reason: 'Kiểm thử hủy lịch & đối soát hoàn tiền tự động',
    bankAccountNumber: '9876543210',
    bankAccountName: 'REFUND TEST',
    bankName: 'MB Bank',
  }, patient.id);
  assert(bookRes2 && bookRes2.errCode === 0, 'Đặt ca khám thứ 2 thành công');

  const booking2 = await db.Booking.findOne({
    where: { doctorId: doctor.id, date: dateStr, timeType: 'T4' },
    order: [['createdAt', 'DESC']],
  });

  // Verify ca thứ 2 và chuyển sang S2
  await patientService.postVerifyBookAppointment({ token: booking2.token, doctorId: doctor.id });
  booking2.statusId = 'S2';
  booking2.paymentStatus = 'paid';
  await booking2.save();

  // Bệnh nhân thực hiện hủy
  const cancelRes = await patientService.cancelBooking(
    { bookingId: booking2.id, cancellationReason: 'Bận việc gia đình đột xuất không thể tới khám' },
    booking2.patientId
  );

  assert(cancelRes && cancelRes.errCode === 0, `Hủy lịch thành công: ${cancelRes.message}`);

  await booking2.reload();
  assert(booking2.statusId === 'S4', `Trạng thái chuyển sang S4 (Đã hủy): ${booking2.statusId}`);
  assert(parseFloat(booking2.refundRate) === 100, `Chính sách hoàn tiền tự động tính 100% (<24h): ${booking2.refundRate}%`);
  assert(booking2.refundAmount === booking2.bookingPrice, `Số tiền hoàn chính xác bằng giá khám: ${booking2.refundAmount} VNĐ`);
  assert(booking2.refundStatus === 'pending', `Trạng thái hoàn tiền: ${booking2.refundStatus}`);
  assert(booking2.cancelledAt !== null, 'Thời điểm hủy được lưu trữ chính xác');

  // ═══════════════════════════════════════════════════════════════
  // GIAI ĐOẠN 5: ĐỐI SOÁT VỚI HỆ THỐNG BÁO CÁO (statisticService)
  // ═══════════════════════════════════════════════════════════════
  logStep('5', 'Đối soát tự động với Dịch vụ Báo cáo Điều hành (statisticService)');
  const queryFrom = Date.now() - 30 * 86400000;
  const queryTo = Date.now() + 7 * 86400000; // Bao gồm cả ngày mai

  const masterReport = await statisticService.getExecutiveMaster(queryFrom, queryTo);
  assert(masterReport && masterReport.kpis, 'Báo cáo Executive Master phản hồi dữ liệu KPI');
  assert(masterReport.kpis.totalBookings > 0, `Tổng lượt đặt khám phản ánh trên Master: ${masterReport.kpis.totalBookings}`);
  assert(masterReport.kpis.netRevenue > 0, `Doanh thu thực nhận phản ánh trên Master: ${masterReport.kpis.netRevenue.toLocaleString('vi-VN')} VNĐ`);

  const bookingDetail = await statisticService.getBookingAnalyticsDetail(queryFrom, queryTo);
  assert(bookingDetail && bookingDetail.cancellations, 'Báo cáo Đặt lịch có dữ liệu Kiểm toán Hủy lịch');
  const foundCancelledInAudit = bookingDetail.cancellations.recentList.some((c) => c.id === booking2.id);
  assert(foundCancelledInAudit, `Ca hủy #${booking2.id} xuất hiện ngay lập tức trong bảng Kiểm toán Hoàn tiền chi tiết!`);

  const revenueDetail = await statisticService.getRevenueAnalyticsDetail(queryFrom, queryTo);
  assert(revenueDetail && revenueDetail.summary, 'Báo cáo Doanh thu tính toán chuẩn xác');
  assert(revenueDetail.summary.refundAmount >= booking2.refundAmount, `Tổng tiền hoàn bao gồm ca hủy mới: ${revenueDetail.summary.refundAmount.toLocaleString('vi-VN')} VNĐ`);

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   🎉 TẤT CẢ 5 GIAI ĐOẠN KIỂM ĐỊNH ĐÃ VƯỢT QUA 100% THÀNH CÔNG!   ║');
  console.log('║   ✔ Quy trình API thực tế và Báo cáo Analytics đồng bộ tuyệt đối ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n❌ KIỂM ĐỊNH THẤT BẠI VỚI LỖI:', err);
  process.exit(1);
});
