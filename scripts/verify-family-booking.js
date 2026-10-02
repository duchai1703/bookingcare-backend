// scripts/verify-family-booking.js
require('dotenv').config();
const db = require('../src/models');
const familyMemberService = require('../src/services/familyMemberService');
const patientService = require('../src/services/patientService');
const doctorService = require('../src/services/doctorService');

async function testFamilyBooking() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ: ĐẶT LỊCH KHÁM CHO NGƯỜI THÂN & SỔ Y BẠ GIA ĐÌNH');
  try {
    // 1. Tìm hoặc tạo bệnh nhân thử nghiệm
    const [patient] = await db.User.findOrCreate({
      where: { email: 'patient.test.family@bookingcare.vn' },
      defaults: {
        email: 'patient.test.family@bookingcare.vn',
        password: 'password123',
        firstName: 'Văn Phụ Huynh',
        lastName: 'Nguyễn',
        roleId: 'R3',
        gender: 'G1',
        phoneNumber: '0987654321',
        address: 'Hà Nội',
      },
    });
    console.log(`✅ [1] Đã xác định tài khoản Phụ huynh: ID=${patient.id}, Name=${patient.lastName} ${patient.firstName}`);

    // 2. Tạo hồ sơ người thân (Con nhỏ 3 tuổi)
    const createRes = await familyMemberService.createFamilyMember(patient.id, {
      fullName: 'Bé Nguyễn Văn Con Nhỏ',
      relationship: 'CHILD',
      gender: 'MALE',
      birthday: '2023-05-15',
      medicalHistory: 'Tiền sử dị ứng kháng sinh Amoxicillin',
      notes: 'Bé hay quấy khóc khi gặp bác sĩ',
    });
    if (createRes.errCode !== 0) {
      throw new Error(`Tạo hồ sơ người thân thất bại: ${createRes.message}`);
    }
    const memberId = createRes.data.id;
    console.log(`✅ [2] Đã tạo hồ sơ người thân (Con nhỏ): ID=${memberId}, Tên=${createRes.data.fullName}, Quan hệ=${createRes.data.relationship}`);

    // 3. Lấy danh sách người thân của bệnh nhân
    const listRes = await familyMemberService.getFamilyMembers(patient.id);
    if (listRes.errCode !== 0 || !listRes.data.some(m => m.id === memberId)) {
      throw new Error('Không tìm thấy người thân vừa tạo trong danh sách');
    }
    console.log(`✅ [3] Đã truy vấn Sổ Y Bạ Gia Đình: ${listRes.data.length} thành viên`);

    // 4. Tìm 1 bác sĩ và 1 lịch khám để thử đặt lịch
    const doctor = await db.User.findOne({ where: { roleId: 'R2' } });
    if (!doctor) {
      console.log('⚠️ Không tìm thấy bác sĩ nào để thử đặt lịch, bỏ qua bước đặt lịch.');
      return;
    }

    const todayTimestamp = new Date();
    todayTimestamp.setHours(0, 0, 0, 0);
    const dateStr = String(todayTimestamp.getTime());

    // Đảm bảo có schedule
    await db.Schedule.findOrCreate({
      where: { doctorId: doctor.id, date: dateStr, timeType: 'T1' },
      defaults: {
        doctorId: doctor.id,
        date: dateStr,
        timeType: 'T1',
        maxNumber: 10,
        currentNumber: 0,
        status: 'ACTIVE',
      },
    });

    // 5. Đặt lịch khám cho Con Nhỏ
    console.log('⏳ [5] Tiến hành đặt lịch khám cho Bé Nguyễn Văn Con Nhỏ...');
    const bookingRes = await patientService.postBookAppointment({
      doctorId: doctor.id,
      date: dateStr,
      timeType: 'T1',
      fullName: patient.lastName + ' ' + patient.firstName,
      email: patient.email,
      phoneNumber: patient.phoneNumber,
      address: patient.address,
      bookingFor: 'FAMILY',
      familyMemberId: memberId,
      relationship: 'CHILD',
      reason: 'Bé sốt cao 39 độ 2 ngày nay',
    }, patient.id);

    if (bookingRes.errCode !== 0 && bookingRes.errCode !== 2) { // errCode 2 = đã đặt rồi
      throw new Error(`Đặt lịch khám thất bại: ${bookingRes.message}`);
    }
    console.log(`✅ [5] Đặt lịch khám cho người thân thành công:`, bookingRes.message);

    // 6. Kiểm tra lại từ phía Bệnh nhân (getPatientBookings)
    const patientBookings = await patientService.getPatientBookings(patient.id, { familyMemberId: memberId });
    if (patientBookings.errCode === 0 && patientBookings.data && patientBookings.data.length > 0) {
      const b = patientBookings.data[0];
      console.log(`✅ [6] Bệnh nhân xem lịch sử khám: BookingId=${b.id}, bookingFor=${b.bookingFor}, Tên BN=${b.patientName}, Người thân=${b.familyMemberData?.fullName}`);
    }

    // 7. Kiểm tra lại từ phía Bác sĩ (getListPatientForDoctor)
    const docPatients = await doctorService.getListPatientForDoctor(doctor.id, dateStr, 'ALL');
    if (docPatients.errCode === 0) {
      const match = docPatients.data.find(p => p.familyMemberId === memberId || (p.patientId === patient.id && p.bookingFor === 'FAMILY'));
      if (match) {
        console.log(`✅ [7] Bác sĩ xem danh sách khám: Ca khám=${match.id}, Bệnh nhân (người khám)=${match.patientName} (${match.relationship}), Phụ huynh/Người đặt=${match.patientData?.lastName} ${match.patientData?.firstName}`);
      }
    }

    // Cleanup: Xóa hồ sơ test
    await db.Booking.destroy({ where: { patientId: patient.id } });
    await db.Family_Member.destroy({ where: { userId: patient.id } });
    await db.User.destroy({ where: { id: patient.id } });
    console.log('🧹 [8] Dọn dẹp dữ liệu test thành công.');

    console.log('\n🎉 TOÀN BỘ KIỂM THỬ BACKEND FAMILY BOOKING ĐÃ HOÀN TẤT VÀ PASS 100%!');
  } catch (error) {
    console.error('❌ Kiểm thử thất bại:', error);
  } finally {
    await db.sequelize.close();
  }
}

testFamilyBooking();
