// src/services/doctorService.js
// ✅ [SECURITY-FIX] Sanitize HTML trước khi lưu DB (Defense-in-Depth Layer 1)
// ✅ [FIX-IMAGE] Strip prefix trước khi lưu, convert BLOB khi đọc
const db = require('../models');
const emailService = require('./emailService');
const { sanitizeContent } = require('../utils/sanitizeHtml');
const { validateBase64Image } = require('../utils/validateBase64Image');
const { stripBase64Prefix } = require('../utils/stripBase64Prefix');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');

// ===== GET TOP DOCTOR (SRS REQ-PT-003) =====
const getTopDoctorHome = async (limit) => {
  try {
    const doctors = await db.User.findAll({
      limit: limit,
      where: { roleId: 'R2' },
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password'] },
      include: [
        { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'genderData', attributes: ['valueVi', 'valueEn'] },
      ],
      raw: false,
      nest: true,
    });
    // ✅ [FIX-IMAGE] Convert BLOB → pure base64 cho tất cả doctors
    doctors.forEach((doc) => {
      if (doc.image) {
        doc.setDataValue('image', convertBlobToBase64(doc.image));
      }
    });
    return { errCode: 0, data: doctors };
  } catch (err) {
    console.error('>>> getTopDoctorHome error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== GET DETAIL DOCTOR (SRS 3.8, REQ-PT-007 → 011) =====
const getDetailDoctorById = async (id) => {
  try {
    const doctor = await db.User.findOne({
      where: { id },
      attributes: { exclude: ['password'] },
      include: [
        { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
        {
          model: db.Doctor_Info, as: 'doctorInfoData',
          include: [
            { model: db.Allcode, as: 'priceData', attributes: ['valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'paymentData', attributes: ['valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'provinceData', attributes: ['valueVi', 'valueEn'] },
            { model: db.Specialty, as: 'specialtyData', attributes: ['name'] },
            { model: db.Clinic, as: 'clinicData', attributes: ['name', 'address'] },
          ],
        },
      ],
      raw: false,
      nest: true,
    });
    if (!doctor) {
      return { errCode: 3, message: 'Không tìm thấy bác sĩ!' };
    }
    if (doctor.image) {
      // ✅ [FIX-IMAGE] Convert BLOB → pure base64 (tương thích data cũ & mới)
      doctor.setDataValue('image', convertBlobToBase64(doctor.image));
    }
    return { errCode: 0, data: doctor };
  } catch (err) {
    console.error('>>> getDetailDoctorById error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== SAVE DOCTOR INFO (SRS REQ-AM-006, 007, 022) =====
const saveInfoDoctor = async (data) => {
  try {
    if (!data.doctorId || !data.contentHTML || !data.contentMarkdown) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }
    const user = await db.User.findOne({ where: { id: data.doctorId } });
    if (!user || user.roleId !== 'R2') {
      return { errCode: 3, message: 'User không phải bác sĩ!' };
    }
    const doctorInfo = await db.Doctor_Info.findOne({
      where: { doctorId: data.doctorId },
      raw: false,
    });
    if (doctorInfo) {
      // ✅ [SECURITY-FIX] Sanitize contentHTML trước khi lưu (chặn Stored XSS)
      doctorInfo.contentHTML = sanitizeContent(data.contentHTML);
      doctorInfo.contentMarkdown = data.contentMarkdown;
      doctorInfo.description = data.description || '';
      doctorInfo.specialtyId = data.specialtyId;
      doctorInfo.clinicId = data.clinicId;
      doctorInfo.priceId = data.priceId;
      doctorInfo.provinceId = data.provinceId;
      doctorInfo.paymentId = data.paymentId;
      doctorInfo.note = data.note || '';
      await doctorInfo.save();
    } else {
      await db.Doctor_Info.create({
        doctorId: data.doctorId,
        // ✅ [SECURITY-FIX] Sanitize contentHTML trước khi lưu (chặn Stored XSS)
        contentHTML: sanitizeContent(data.contentHTML),
        contentMarkdown: data.contentMarkdown,
        description: data.description || '',
        specialtyId: data.specialtyId,
        clinicId: data.clinicId,
        priceId: data.priceId,
        provinceId: data.provinceId,
        paymentId: data.paymentId,
        note: data.note || '',
      });
    }
    // FIX BUG-05: Update User avatar if image provided
    if (data.image) {
      const imgResult = validateBase64Image(data.image);
      if (imgResult.isValid) {
        await db.User.update(
          { image: stripBase64Prefix(data.image) },
          { where: { id: data.doctorId } }
        );
      }
    }
    return { errCode: 0, message: 'Lưu thông tin bác sĩ thành công!' };
  } catch (err) {
    console.error('>>> saveInfoDoctor error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== MỚI: DELETE DOCTOR INFO (SRS REQ-AM-010) =====
const deleteDoctorInfo = async (doctorId) => {
  try {
    if (!doctorId) {
      return { errCode: 1, message: 'Thiếu tham số doctorId!' };
    }
    const doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId } });
    if (!doctorInfo) {
      return { errCode: 3, message: 'Không tìm thấy hồ sơ bác sĩ!' };
    }
    await db.Doctor_Info.destroy({ where: { doctorId } });
    return { errCode: 0, message: 'Xóa hồ sơ bác sĩ thành công!' };
  } catch (err) {
    console.error('>>> deleteDoctorInfo error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== BULK CREATE SCHEDULE (SRS REQ-AM-018, 019) =====
const bulkCreateSchedule = async (data) => {
  try {
    if (!data.arrSchedule || !Array.isArray(data.arrSchedule) || data.arrSchedule.length === 0) {
      return { errCode: 1, message: 'Thiếu dữ liệu lịch khám!' };
    }
    const schedules = data.arrSchedule.map(item => ({
      ...item,
      maxNumber: item.maxNumber || 10,
      currentNumber: 0,
    }));
    const existing = await db.Schedule.findAll({
      where: { doctorId: schedules[0].doctorId, date: schedules[0].date },
      attributes: ['timeType', 'doctorId', 'date'],
      raw: true,
    });
    const toCreate = schedules.filter(s => !existing.find(e => e.timeType === s.timeType && +e.date === +s.date));
    if (toCreate.length > 0) {
      await db.Schedule.bulkCreate(toCreate);
    }
    return { errCode: 0, message: `Tạo ${toCreate.length} lịch khám thành công!` };
  } catch (err) {
    console.error('>>> bulkCreateSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== MỚI: DELETE SCHEDULE (SRS REQ-AM-021) =====
// ✅ [FIX] Hỗ trợ xóa bằng ID (primary key) hoặc bộ 3 {doctorId, date, timeType}
const deleteSchedule = async (data) => {
  try {
    let schedule;

    // Ưu tiên 1: Xóa bằng ID (primary key) — Frontend gửi schedule.id
    if (data.id) {
      schedule = await db.Schedule.findByPk(data.id);
    }
    // Ưu tiên 2: Xóa bằng bộ 3 tham số {doctorId, date, timeType} — UTC timestamp
    else if (data.doctorId && data.date && data.timeType) {
      schedule = await db.Schedule.findOne({
        where: { doctorId: data.doctorId, date: String(data.date), timeType: data.timeType },
      });
    } else {
      return { errCode: 1, message: 'Thiếu tham số (id hoặc doctorId + date + timeType)!' };
    }

    if (!schedule) {
      return { errCode: 3, message: 'Không tìm thấy lịch khám!' };
    }
    // Kiểm tra nếu lịch đã có bệnh nhân đặt (currentNumber > 0) thì cảnh báo
    if (schedule.currentNumber > 0) {
      return { errCode: 2, message: `Lịch khám đã có ${schedule.currentNumber} bệnh nhân đặt, không thể xóa!` };
    }
    await schedule.destroy();
    return { errCode: 0, message: 'Xóa lịch khám thành công!' };
  } catch (err) {
    console.error('>>> deleteSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== GET SCHEDULE BY DATE (SRS 3.8 REQ-PT-009) =====
const getScheduleByDate = async (doctorId, date, includeAll = false) => {
  try {
    const schedules = await db.Schedule.findAll({
      where: { doctorId, date },
      include: [
        { model: db.Allcode, as: 'timeTypeData', attributes: ['valueVi', 'valueEn'] },
      ],
      raw: false,
      nest: true,
    });
    // FIX BUG-06: Admin sees ALL schedules; Patient sees only available
    const result = includeAll ? schedules : schedules.filter(s => s.currentNumber < s.maxNumber);
    return { errCode: 0, data: result };
  } catch (err) {
    console.error('>>> getScheduleByDate error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== SỬA: GET LIST PATIENT FOR DOCTOR (SRS 3.11 REQ-DR-001, 002, 003) =====
// Thêm param statusId để lọc theo trạng thái (REQ-DR-003)
const getListPatientForDoctor = async (doctorId, date, statusId) => {
  try {
    // Xây dựng where clause động
    const whereClause = { doctorId, date };
    if (statusId && statusId !== 'ALL') {
      whereClause.statusId = statusId;
    } else if (!statusId) {
      whereClause.statusId = 'S2'; // Mặc định lọc S2 (đã xác nhận)
    }
    // Nếu statusId === 'ALL' thì không filter theo statusId

    const patients = await db.Booking.findAll({
      where: whereClause,
      include: [
        {
          model: db.User, as: 'patientData',
          attributes: ['email', 'firstName', 'lastName', 'address', 'gender', 'phoneNumber'],
          include: [
            { model: db.Allcode, as: 'genderData', attributes: ['valueVi', 'valueEn'] },
          ],
        },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['valueVi', 'valueEn'] },
      ],
      raw: false,
      nest: true,
    });
    return { errCode: 0, data: patients };
  } catch (err) {
    console.error('>>> getListPatientForDoctor error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== ⭐ [v3.0] SEND REMEDY — TRANSACTION + PESSIMISTIC LOCK (SRS 3.13 REQ-DR-008, 009, 010) =====
//
// v2.0 → v3.0 THAY ĐỔI:
//   1. Thêm `lock: t.LOCK.UPDATE` vào findOne → ngăn chặn double-remedy
//   2. WHERE dùng `id: data.bookingId` thay vì `patientId` → exact match
//   3. Email lấy từ DB (booking.patientData.email) → KHÔNG tin client
//   4. `delete data.email` ở controller → defense-in-depth
const sendRemedy = async (data) => {
  const t = await db.sequelize.transaction();

  try {
    // ===== 1. VALIDATE INPUT =====
    if (!data.bookingId || !data.doctorId || !data.imageBase64) {
      await t.rollback();
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }

    // ===== 2. VALIDATE BASE64 IMAGE =====
    // ✅ [SECURITY-FIX Phase 6] Validate Base64 image trước khi xử lý
    const imageValidation = validateBase64Image(data.imageBase64);
    if (!imageValidation.isValid) {
      await t.rollback();
      return { errCode: 4, message: imageValidation.error };
    }

    // ===== 3. ⭐ [v3.0] FIND BOOKING VỚI PESSIMISTIC LOCK =====
    //
    // lock: t.LOCK.UPDATE
    //   → Sequelize sinh ra: SELECT ... FROM Bookings WHERE ... FOR UPDATE
    //   → Database KHÓA dòng này cho transaction hiện tại
    //   → Các transaction khác phải ĐỢI cho đến khi t.commit() hoặc t.rollback()
    //   → NGĂN CHẶN double-read → double-update (double-remedy)
    const booking = await db.Booking.findOne({
      where: {
        id: data.bookingId,          // ✅ Exact match bằng bookingId
        doctorId: data.doctorId,     // ✅ IDOR prevention — doctorId từ JWT
        statusId: 'S2',             // ✅ State Machine gate — chỉ S2 mới được chuyển
      },
      include: [
        {
          model: db.User,
          as: 'patientData',
          attributes: ['email', 'firstName', 'lastName'],
        },
      ],
      raw: false,
      nest: true,
      transaction: t,
      lock: t.LOCK.UPDATE,           // ✅ [v3.0] PESSIMISTIC LOCK
    });

    if (!booking) {
      await t.rollback();
      return { errCode: 3, message: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền thao tác!' };
    }

    // ===== 4. ✅ [v3.0] LẤY EMAIL TỪ DATABASE — KHÔNG TIN CLIENT =====
    const patientEmail = booking.patientData?.email;
    if (!patientEmail) {
      await t.rollback();
      return { errCode: 5, message: 'Không tìm thấy email bệnh nhân trong hệ thống!' };
    }

    // ===== 5. UPDATE STATUS S2 → S3 =====
    booking.statusId = 'S3'; // State Machine: S2 → S3 (Đã khám xong)
    await booking.save({ transaction: t });

    // ===== 6. COMMIT — Mở khóa dòng booking =====
    await t.commit();
    // → 🔓 Dòng booking được MỞ KHÓA tại đây
    // → Transaction khác (nếu đang chờ) sẽ tiếp tục
    // → Nhưng findOne sẽ trả NULL vì statusId đã = S3, không match S2

    // ===== 7. GỬI EMAIL SAU COMMIT — dùng email từ DB =====
    await emailService.sendEmailRemedy({
      email: patientEmail,           // ✅ Email từ DB, KHÔNG từ client
      imageBase64: data.imageBase64,
      doctorName: data.doctorName || 'Bác sĩ',
      language: data.language || 'vi',
    });

    return { errCode: 0, message: 'Gửi kết quả khám thành công!' };
  } catch (err) {
    await t.rollback();
    console.error('>>> sendRemedy error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== ⭐ [v3.0] CANCEL BOOKING — TRANSACTION + PESSIMISTIC LOCK (SRS REQ-DR-004) =====
//
// KỊCH BẢN NGĂN CHẶN (Double-Cancel):
//   Request 1: cancelBooking(id=42) → khóa dòng → S2→S4 → decrement → commit
//   Request 2: cancelBooking(id=42) → findOne bị block → sau commit → NULL (S4≠S2)
//   → Schedule.currentNumber chỉ giảm 1 LẦN → DATA INTEGRITY ĐẢM BẢO
const cancelBooking = async (data) => {
  const t = await db.sequelize.transaction();

  try {
    if (!data.bookingId || !data.doctorId) {
      await t.rollback();
      return { errCode: 1, message: 'Thiếu tham số bookingId hoặc doctorId!' };
    }

    // ===== ⭐ [v3.0] FIND + LOCK DÒNG =====
    const booking = await db.Booking.findOne({
      where: {
        id: data.bookingId,          // ✅ Exact match
        doctorId: data.doctorId,     // ✅ IDOR prevention — doctorId từ JWT
        statusId: 'S2',             // ✅ State Machine gate
      },
      raw: false,
      transaction: t,
      lock: t.LOCK.UPDATE,           // ✅ [v3.0] PESSIMISTIC LOCK
    });

    if (!booking) {
      await t.rollback();
      return { errCode: 3, message: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền hủy!' };
    }

    // ===== THAO TÁC 1: S2 → S4 (trong transaction t) =====
    booking.statusId = 'S4';
    await booking.save({ transaction: t });

    // ===== THAO TÁC 2: GIẢM currentNumber (trong transaction t) =====
    await db.Schedule.decrement('currentNumber', {
      by: 1,
      where: {
        doctorId: booking.doctorId,
        date: booking.date,
        timeType: booking.timeType,
      },
      transaction: t,
    });

    // ===== COMMIT — Cả 2 thành công → mở khóa =====
    await t.commit();

    return { errCode: 0, message: 'Hủy lịch hẹn thành công!' };
  } catch (err) {
    await t.rollback();
    console.error('>>> cancelBooking error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== MỚI: PATIENT BOOKING HISTORY (SRS REQ-DR-007) =====
// ✅ [SECURITY-FIX Phase 4] IDOR/BOLA: Thêm doctorId để scope query
const getPatientBookingHistory = async (patientId, doctorId) => {
  try {
    // Chỉ trả về lịch sử booking của bệnh nhân VỚI bác sĩ đang đăng nhập
    const whereClause = { patientId };
    if (doctorId) {
      whereClause.doctorId = doctorId;
    }
    const bookings = await db.Booking.findAll({
      where: whereClause,
      include: [
        {
          model: db.User, as: 'doctorBookingData',
          attributes: ['firstName', 'lastName', 'email'],
        },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['valueVi', 'valueEn'] },
      ],
      order: [['createdAt', 'DESC']],
      raw: false,
      nest: true,
    });
    return { errCode: 0, data: bookings };
  } catch (err) {
    console.error('>>> getPatientBookingHistory error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = {
  getTopDoctorHome,
  getDetailDoctorById,
  saveInfoDoctor,
  deleteDoctorInfo,
  bulkCreateSchedule,
  deleteSchedule,
  getScheduleByDate,
  getListPatientForDoctor,
  sendRemedy,
  cancelBooking,
  getPatientBookingHistory,
};
