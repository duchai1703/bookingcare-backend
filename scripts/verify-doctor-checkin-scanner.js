// scripts/verify-doctor-checkin-scanner.js
// Kiểm thử các định dạng đầu vào của verifyDoctorCheckin: QR token, #BK-id, id thuần, và chặn IDOR
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models');
const patientService = require('../src/services/patientService');

async function testCheckinScanner() {
  console.log('--- BẮT ĐẦU TEST VERIFY DOCTOR CHECK-IN SCANNER ---');
  try {
    // 1. Tìm một booking mẫu trong database
    const sampleBooking = await db.Booking.findOne({
      where: { statusId: ['S1', 'S2', 'S3'] },
      order: [['id', 'DESC']],
    });

    if (!sampleBooking) {
      console.log('Không có booking mẫu trong DB để test!');
      process.exit(0);
    }

    const doctorId = sampleBooking.doctorId;
    const bookingId = sampleBooking.id;
    const qrToken = sampleBooking.qrToken || 'test-sample-token';

    console.log(`Mẫu Booking: ID=${bookingId}, DoctorID=${doctorId}, Status=${sampleBooking.statusId}, QRToken=${qrToken}`);

    // TEST 1: Test chuỗi QR "BKQ:<id>:<token>"
    const qrString = `BKQ:${bookingId}:${qrToken}`;
    const res1 = await patientService.verifyDoctorCheckin(qrString, doctorId);
    console.log('Test 1 (BKQ:id:token):', res1.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${res1.message})`);
    if (res1.errCode !== 0) throw new Error('Test 1 failed');

    // TEST 2: Test mã booking "#BK-<id>"
    const codeWithHash = `#BK-${bookingId}`;
    const res2 = await patientService.verifyDoctorCheckin(codeWithHash, doctorId);
    console.log('Test 2 (#BK-id):', res2.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${res2.message})`);
    if (res2.errCode !== 0) throw new Error('Test 2 failed');

    // TEST 3: Test mã booking "BK-<id>" (không có hash)
    const codeNoHash = `BK-${bookingId}`;
    const res3 = await patientService.verifyDoctorCheckin(codeNoHash, doctorId);
    console.log('Test 3 (BK-id):', res3.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${res3.message})`);
    if (res3.errCode !== 0) throw new Error('Test 3 failed');

    // TEST 4: Test ID số thuần
    const res4 = await patientService.verifyDoctorCheckin(String(bookingId), doctorId);
    console.log('Test 4 (id thuần):', res4.errCode === 0 ? 'PASS ✅' : `FAIL ❌ (${res4.message})`);
    if (res4.errCode !== 0) throw new Error('Test 4 failed');

    // TEST 5: Test IDOR - Bác sĩ khác (sai doctorId)
    const wrongDoctorId = doctorId + 999999;
    const res5 = await patientService.verifyDoctorCheckin(codeWithHash, wrongDoctorId);
    console.log('Test 5 (IDOR prevention):', res5.errCode === 2 ? 'PASS ✅ (Bị chặn chuẩn xác)' : `FAIL ❌ (errCode=${res5.errCode})`);
    if (res5.errCode !== 2) throw new Error('Test 5 failed');

    console.log('--- TẤT CẢ 5/5 TESTS BACKEND VERIFY CHECKIN ĐÃ PASS HOÀN TOÀN! 🎉 ---');
    process.exit(0);
  } catch (err) {
    console.error('>>> LỖI TEST:', err.message);
    process.exit(1);
  }
}

testCheckinScanner();
