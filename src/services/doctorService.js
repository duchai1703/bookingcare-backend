// src/services/doctorService.js
// ✅ [SECURITY-FIX] Sanitize HTML trước khi lưu DB (Defense-in-Depth Layer 1)
const db = require('../models');
const emailService = require('./emailService');
const { sanitizeContent } = require('../utils/sanitizeHtml');
const { validateBase64Image } = require('../utils/validateBase64Image');

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
      raw: true,
      nest: true,
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
      const imageBase64 = Buffer.from(doctor.image, 'base64').toString('binary');
      doctor.setDataValue('image', imageBase64);
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
const deleteSchedule = async (data) => {
  try {
    if (!data.doctorId || !data.date || !data.timeType) {
      return { errCode: 1, message: 'Thiếu tham số (doctorId, date, timeType)!' };
    }
    const schedule = await db.Schedule.findOne({
      where: { doctorId: data.doctorId, date: data.date, timeType: data.timeType },
    });
    if (!schedule) {
      return { errCode: 3, message: 'Không tìm thấy lịch khám!' };
    }
    // Kiểm tra nếu lịch đã có bệnh nhân đặt (currentNumber > 0) thì cảnh báo
    if (schedule.currentNumber > 0) {
      return { errCode: 2, message: `Lịch khám đã có ${schedule.currentNumber} bệnh nhân đặt, không thể xóa!` };
    }
    await db.Schedule.destroy({
      where: { doctorId: data.doctorId, date: data.date, timeType: data.timeType },
    });
    return { errCode: 0, message: 'Xóa lịch khám thành công!' };
  } catch (err) {
    console.error('>>> deleteSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== GET SCHEDULE BY DATE (SRS 3.8 REQ-PT-009) =====
const getScheduleByDate = async (doctorId, date) => {
  try {
    const schedules = await db.Schedule.findAll({
      where: { doctorId, date },
      include: [
        { model: db.Allcode, as: 'timeTypeData', attributes: ['valueVi', 'valueEn'] },
      ],
      raw: false,
      nest: true,
    });
    const available = schedules.filter(s => s.currentNumber < s.maxNumber);
    return { errCode: 0, data: available };
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

// ===== SEND REMEDY (SRS 3.13 REQ-DR-008, 009, 010) =====
const sendRemedy = async (data) => {
  try {
    if (!data.email || !data.doctorId || !data.patientId || !data.imageBase64) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }

    // ✅ [SECURITY-FIX Phase 6] Validate Base64 image trước khi xử lý
    const imageValidation = validateBase64Image(data.imageBase64);
    if (!imageValidation.isValid) {
      return { errCode: 4, message: imageValidation.error };
    }

    // ✅ [SECURITY-FIX Phase 4] IDOR/BOLA: Đảm bảo bác sĩ chỉ sửa booking của mình
    const booking = await db.Booking.findOne({
      where: {
        doctorId: data.doctorId,  // doctorId lấy từ JWT (controller đã gán)
        patientId: data.patientId,
        statusId: 'S2',
      },
      raw: false,
    });
    if (!booking) {
      return { errCode: 3, message: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền thao tác!' };
    }
    booking.statusId = 'S3'; // State Machine: S2 → S3
    await booking.save();

    await emailService.sendEmailRemedy({
      email: data.email,
      imageBase64: data.imageBase64,
      doctorName: data.doctorName || 'Bác sĩ',
      language: data.language || 'vi',
    });
    return { errCode: 0, message: 'Gửi kết quả khám thành công!' };
  } catch (err) {
    console.error('>>> sendRemedy error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== MỚI: CANCEL BOOKING (SRS REQ-DR-004) – S2 → S4 =====
const cancelBooking = async (data) => {
  try {
    if (!data.bookingId || !data.doctorId) {
      return { errCode: 1, message: 'Thiếu tham số bookingId hoặc doctorId!' };
    }
    // ✅ [SECURITY-FIX Phase 4] IDOR/BOLA: Đảm bảo bác sĩ chỉ hủy booking của mình
    const booking = await db.Booking.findOne({
      where: { id: data.bookingId, doctorId: data.doctorId, statusId: 'S2' },
      raw: false,
    });
    if (!booking) {
      return { errCode: 3, message: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền hủy!' };
    }
    // State Machine: S2 → S4 (Đã hủy)
    booking.statusId = 'S4';
    await booking.save();

    // Giảm currentNumber của Schedule tương ứng
    await db.Schedule.decrement('currentNumber', {
      by: 1,
      where: { doctorId: booking.doctorId, date: booking.date, timeType: booking.timeType },
    });

    return { errCode: 0, message: 'Hủy lịch hẹn thành công!' };
  } catch (err) {
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
