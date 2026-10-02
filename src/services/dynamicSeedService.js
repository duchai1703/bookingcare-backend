// src/services/dynamicSeedService.js
// Dynamic Rolling Seeder — Tự động cuộn lịch khám 7 ngày tới & dữ liệu live testing
// Đảm bảo Idempotency (Không trùng lặp, an toàn khi chạy nhiều lần)

'use strict';

const db = require('../models');
const { v4: uuidv4 } = require('uuid');

const TIME_SLOTS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

const CLINICAL_DIAGNOSES = [
  {
    symptoms: 'Đau mỏi vai gáy lan xuống cánh tay, cứng cổ vào buổi sáng',
    clinicalNotes: 'Hạn chế vận động cột sống cổ, không có dấu hiệu chèn ép tủy cấp',
    diagnosis: 'Thoái hóa cột sống cổ C5-C6 / Đau cơ cân mạc',
    careInstructions: 'Nghỉ ngơi, tập vật lý trị liệu, tránh cúi đầu dùng điện thoại lâu',
  },
  {
    symptoms: 'Sốt nhẹ 38 độ C, đau rát họng, ho khan từng cơn',
    clinicalNotes: 'Niêm mạc họng sung huyết đỏ, hai amidan quá phát độ I không có giả mạc',
    diagnosis: 'Viêm mũi họng cấp tính do virus',
    careInstructions: 'Súc họng nước muối sinh lý 0.9%, uống nhiều nước ấm, theo dõi thân nhiệt',
  },
  {
    symptoms: 'Đau âm ỉ vùng thượng vị sau ăn, ợ hơi, nóng rát thực quản',
    clinicalNotes: 'Bụng mềm, ấn đau tức nhẹ thượng vị, nghiệm pháp Murphy âm tính',
    diagnosis: 'Trào ngược dạ dày thực quản (GERD) độ A / Viêm dạ dày',
    careInstructions: 'Chia nhỏ bữa ăn, không nằm ngay sau ăn, kiêng đồ chua cay, cà phê',
  },
  {
    symptoms: 'Mắt mờ, mỏi mắt khi làm việc máy tính, chảy nước mắt sống',
    clinicalNotes: 'Thị lực hai mắt giảm nhẹ, kết mạc khô, giác mạc trong suốt',
    diagnosis: 'Hội chứng thị giác màn hình / Khô mắt mức độ nhẹ',
    careInstructions: 'Thực hiện quy tắc 20-20-20, nhỏ nước mắt nhân tạo 4-6 lần/ngày',
  },
];

/**
 * Lấy UTC timestamp (00:00:00 UTC) dạng string cho ngày theo offset
 * Khớp hoàn toàn với moment.utc().startOf('day').valueOf().toString() ở Frontend
 */
function getUtcDayTimestampStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()).toString();
}

/**
 * Tự động bù đắp và đồng bộ dữ liệu khám bệnh cho 7 ngày tới
 */
async function ensureRollingSchedulesAndBookings() {
  const results = {
    schedulesCreated: 0,
    bookingsCreated: 0,
    assignmentsEnsured: 0,
    walletsEnsured: 0,
    policiesEnsured: 0,
    callSessionsEnsured: 0,
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1. TÌM DOCTORS, PATIENTS, SPECIALTIES, CLINICS
    // ═══════════════════════════════════════════════════════════════
    const doctors = await db.User.findAll({
      where: { roleId: 'R2' },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'address'],
      order: [['id', 'ASC']],
    });

    if (!doctors || doctors.length === 0) {
      console.log('[DYNAMIC SEED] Không tìm thấy bác sĩ nào trong DB. Bỏ qua rolling seed.');
      return results;
    }

    const patients = await db.User.findAll({
      where: { roleId: 'R3' },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'address', 'gender'],
      order: [['id', 'ASC']],
    });

    const clinics = await db.Clinic.findAll({ attributes: ['id', 'name'] });
    const specialties = await db.Specialty.findAll({ attributes: ['id', 'name'] });

    // ═══════════════════════════════════════════════════════════════
    // 2. ENSURE DOCTOR_ASSIGNMENTS & CLINIC_SPECIALTIES (Multi-Facility)
    // ═══════════════════════════════════════════════════════════════
    const doctorInfos = await db.Doctor_Info.findAll();
    const docInfoMap = new Map();
    for (const info of doctorInfos) {
      docInfoMap.set(info.doctorId, info);
    }

    for (let i = 0; i < doctors.length; i++) {
      const doc = doctors[i];
      const docInfo = docInfoMap.get(doc.id);
      const clinicId = docInfo?.clinicId || (clinics.length > 0 ? clinics[i % clinics.length].id : 1);
      const specialtyId = docInfo?.specialtyId || (specialties.length > 0 ? specialties[i % specialties.length].id : 1);

      // Ensure Clinic_Specialty
      if (clinicId && specialtyId) {
        await db.Clinic_Specialty.findOrCreate({
          where: { clinicId, specialtyId },
          defaults: {
            clinicId,
            specialtyId,
            status: 'active',
            targetCapacity: 60,
          },
        });
      }

      // Ensure Doctor_Assignment
      const [assignment, created] = await db.Doctor_Assignment.findOrCreate({
        where: { doctorId: doc.id, clinicId, specialtyId },
        defaults: {
          doctorId: doc.id,
          clinicId,
          specialtyId,
          roomNumber: `Phòng ${201 + (i % 20)} - Tòa A`,
          priceId: docInfo?.priceId || 'PRI2',
          commissionRate: 15.00,
          workingStatus: 'active',
          isPrimary: true,
          startDate: '2025-01-01',
          note: 'Phân công công tác thường trực khám bệnh chuyên khoa',
        },
      });

      if (created) results.assignmentsEnsured++;
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. ENSURE FINANCIAL POLICIES & WALLETS
    // ═══════════════════════════════════════════════════════════════
    const defaultRefundRule = JSON.stringify({
      cancelBeforeHours24: 100, // Hoàn 100% trước 24 giờ
      cancelBeforeHours2: 50,   // Hoàn 50% trước 2 giờ
      cancelUnderHours2: 0,     // Không hoàn dưới 2 giờ
      doctorCancelRefund: 100,  // Bác sĩ hủy hoàn 100%
      compensationRate: 10,     // Bồi thường 10% nếu lỗi do cơ sở
    });

    const [policy, policyCreated] = await db.Financial_Policy.findOrCreate({
      where: { code: 'POL_REFUND_DEFAULT' },
      defaults: {
        code: 'POL_REFUND_DEFAULT',
        policyType: 'REFUND_RULE',
        name: 'Chính sách Hoàn tiền & Hủy lịch Mặc định Toàn hệ thống',
        version: 1,
        scopeType: 'GLOBAL',
        targetMode: 'ALL_DOCTORS',
        effectiveFrom: new Date('2025-01-01'),
        status: 'ACTIVE',
        rules: defaultRefundRule,
        description: 'Bảo vệ quyền lợi đặt khám và hoàn phí minh bạch cho người bệnh',
        isLocked: false,
        createdById: 1,
      },
    });
    if (policyCreated) results.policiesEnsured++;

    // Ensure Wallets cho Patient & Doctor
    for (const pat of patients.slice(0, 30)) {
      const [wallet, wCreated] = await db.Wallet.findOrCreate({
        where: { ownerId: pat.id, walletType: 'PATIENT' },
        defaults: {
          ownerId: pat.id,
          walletType: 'PATIENT',
          currency: 'VND',
          availableBalance: 2500000.00,
          reservedBalance: 0.00,
          status: 'ACTIVE',
        },
      });
      if (wCreated) results.walletsEnsured++;
    }

    for (const doc of doctors.slice(0, 30)) {
      const [wallet, wCreated] = await db.Wallet.findOrCreate({
        where: { ownerId: doc.id, walletType: 'DOCTOR' },
        defaults: {
          ownerId: doc.id,
          walletType: 'DOCTOR',
          currency: 'VND',
          availableBalance: 8500000.00,
          reservedBalance: 0.00,
          status: 'ACTIVE',
        },
      });
      if (wCreated) results.walletsEnsured++;
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. ROLLING WINDOW SCHEDULES: -2 ngày đến +7 ngày tới
    // ═══════════════════════════════════════════════════════════════
    const rollingOffsets = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
    const targetDoctors = doctors.slice(0, 30); // Đảm bảo 30 bác sĩ đầu tiên có lịch đầy đủ

    for (const offset of rollingOffsets) {
      const dateStr = getUtcDayTimestampStr(offset);

      for (const doctor of targetDoctors) {
        // Chủ nhật (day 0) cho 50% bác sĩ nghỉ
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() + offset);
        if (dateObj.getDay() === 0 && doctor.id % 2 === 0) continue;

        // Chọn 4-6 slots mỗi ngày
        const numSlots = (doctor.id % 3) + 4; // 4, 5, hoặc 6 slots
        const selectedSlots = TIME_SLOTS.slice(0, numSlots);

        for (const slot of selectedSlots) {
          const [schedule, created] = await db.Schedule.findOrCreate({
            where: {
              doctorId: doctor.id,
              date: dateStr,
              timeType: slot,
            },
            defaults: {
              doctorId: doctor.id,
              date: dateStr,
              timeType: slot,
              maxNumber: 10,
              currentNumber: 0,
            },
          });

          if (created) results.schedulesCreated++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. LIVE BOOKINGS FOR TESTING (Hôm nay, Tương lai & Quá khứ)
    // ═══════════════════════════════════════════════════════════════
    if (patients.length > 0) {
      const todayStr = getUtcDayTimestampStr(0);
      const tomorrowStr = getUtcDayTimestampStr(1);
      const yesterdayStr = getUtcDayTimestampStr(-1);

      // Cấu hình các ca hẹn chuẩn mẫu để kiểm thử mọi module
      const liveBookingConfigs = [
        // ─── HÔM NAY (TODAY) ───
        // Ca 1: S2 (Đã xác nhận, đã thanh toán, sẵn sàng Gọi Video WebRTC & Bắt đầu khám)
        {
          dateStr: todayStr,
          doctorIdx: 0,
          patientIdx: 0,
          timeType: 'T2',
          statusId: 'S2',
          paymentStatus: 'paid',
          bookingPrice: 300000,
          reason: 'Tái khám định kỳ theo dõi sức khỏe tổng quát',
          needCallSession: true,
        },
        // Ca 2: S2 (Đã xác nhận, sẵn sàng khám cho bác sĩ thứ 2)
        {
          dateStr: todayStr,
          doctorIdx: 1,
          patientIdx: 1,
          timeType: 'T3',
          statusId: 'S2',
          paymentStatus: 'paid',
          bookingPrice: 200000,
          reason: 'Khám kiểm tra đau họng và sốt nhẹ kéo dài',
          needCallSession: true,
        },
        // Ca 3: S1 (Lịch hẹn mới chờ bác sĩ / admin xác nhận)
        {
          dateStr: todayStr,
          doctorIdx: 0,
          patientIdx: 2,
          timeType: 'T5',
          statusId: 'S1',
          paymentStatus: 'unpaid',
          bookingPrice: 300000,
          reason: 'Đau mỏi vai gáy khi ngồi làm việc văn phòng',
        },
        // Ca 4: S3 (Đã khám xong - đã có chẩn đoán, lời dặn & đơn thuốc)
        {
          dateStr: todayStr,
          doctorIdx: 0,
          patientIdx: 3,
          timeType: 'T1',
          statusId: 'S3',
          paymentStatus: 'paid',
          bookingPrice: 300000,
          diagnosisIdx: 0,
          reason: 'Khám buổi sáng đã hoàn tất',
        },

        // ─── NGÀY MAI (TOMORROW) ───
        // Ca 5: S2 (Lịch hẹn ngày mai đã xác nhận)
        {
          dateStr: tomorrowStr,
          doctorIdx: 0,
          patientIdx: 4,
          timeType: 'T2',
          statusId: 'S2',
          paymentStatus: 'paid',
          bookingPrice: 300000,
          reason: 'Khám tầm soát tim mạch và đo huyết áp',
        },
        // Ca 6: S1.5 (Chờ thanh toán VNPay)
        {
          dateStr: tomorrowStr,
          doctorIdx: 1,
          patientIdx: 5,
          timeType: 'T4',
          statusId: 'S1.5',
          paymentStatus: 'unpaid',
          bookingPrice: 500000,
          reason: 'Khám chuyên gia đầu ngành Thần kinh',
        },

        // ─── HÔM QUA (YESTERDAY) ───
        // Ca 7: S3 (Đã khám hôm qua)
        {
          dateStr: yesterdayStr,
          doctorIdx: 0,
          patientIdx: 6,
          timeType: 'T3',
          statusId: 'S3',
          paymentStatus: 'paid',
          bookingPrice: 300000,
          diagnosisIdx: 1,
          reason: 'Khám cảm cúm và viêm mũi họng',
        },
        // Ca 8: S4 (Đã hủy & hoàn tiền vào ví)
        {
          dateStr: yesterdayStr,
          doctorIdx: 1,
          patientIdx: 7,
          timeType: 'T6',
          statusId: 'S4',
          paymentStatus: 'refunded',
          refundRate: 100,
          refundAmount: 200000,
          refundStatus: 'done',
          cancelledAt: new Date(Date.now() - 86400000),
          reason: 'Bận công tác đột xuất xin hủy và hoàn phí',
        },
      ];

      for (const cfg of liveBookingConfigs) {
        const doctor = doctors[cfg.doctorIdx % doctors.length];
        const patient = patients[cfg.patientIdx % patients.length];
        const diag = cfg.diagnosisIdx !== undefined ? CLINICAL_DIAGNOSES[cfg.diagnosisIdx % CLINICAL_DIAGNOSES.length] : null;

        // Kiểm tra xem đã có booking trùng doctor, date, timeType, patient chưa
        const existingBooking = await db.Booking.findOne({
          where: {
            doctorId: doctor.id,
            patientId: patient.id,
            date: cfg.dateStr,
            timeType: cfg.timeType,
          },
        });

        if (!existingBooking) {
          const bookingToken = uuidv4();
          const newBooking = await db.Booking.create({
            statusId: cfg.statusId,
            doctorId: doctor.id,
            patientId: patient.id,
            date: cfg.dateStr,
            timeType: cfg.timeType,
            token: bookingToken,
            bookingPrice: cfg.bookingPrice,
            paymentStatus: cfg.paymentStatus,
            refundRate: cfg.refundRate || null,
            refundAmount: cfg.refundAmount || null,
            refundStatus: cfg.refundStatus || 'none',
            cancelledAt: cfg.cancelledAt || null,
            reason: cfg.reason,
            patientName: `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || 'Người bệnh Test',
            patientPhoneNumber: patient.phoneNumber || '0987654321',
            patientAddress: patient.address || 'Hà Nội',
            patientGender: patient.gender || 'G1',
            patientBirthday: '1995-05-15',
            symptoms: diag ? diag.symptoms : (cfg.statusId === 'S3' ? 'Đau đầu, căng thẳng' : null),
            clinicalNotes: diag ? diag.clinicalNotes : null,
            diagnosis: diag ? diag.diagnosis : null,
            careInstructions: diag ? diag.careInstructions : null,
          });

          results.bookingsCreated++;

          // Đồng bộ currentNumber trên Schedule
          if (['S2', 'S3'].includes(cfg.statusId)) {
            await db.Schedule.increment('currentNumber', {
              by: 1,
              where: {
                doctorId: doctor.id,
                date: cfg.dateStr,
                timeType: cfg.timeType,
              },
            });
          }

          // Tạo CallSession nếu cần test WebRTC 1-1
          if (cfg.needCallSession) {
            await db.CallSession.findOrCreate({
              where: { bookingId: newBooking.id },
              defaults: {
                callId: `CALL-LIVE-${newBooking.id}`,
                bookingId: newBooking.id,
                callerId: patient.id,
                receiverId: doctor.id,
                callType: 'VIDEO',
                status: 'RINGING',
                metadata: JSON.stringify({ source: 'dynamic-rolling-seed' }),
              },
            });
            results.callSessionsEnsured++;
          }
        }
      }
    }

    console.log(`[DYNAMIC SEED SUCCESS] Hoàn tất bù đắp dữ liệu trượt: +${results.schedulesCreated} slots, +${results.bookingsCreated} bookings, +${results.assignmentsEnsured} assignments, +${results.walletsEnsured} wallets.`);
  } catch (err) {
    console.error('[DYNAMIC SEED ERROR] Lỗi trong quá trình dynamic seed:', err);
    throw err;
  }

  return results;
}

module.exports = {
  ensureRollingSchedulesAndBookings,
  getUtcDayTimestampStr,
};
