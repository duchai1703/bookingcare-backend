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
        { model: db.Allcode, as: 'positionData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'genderData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        // ✅ [v4.0] Include Doctor_Info + specialtyData + clinicData
        // Để frontend hiển thị tên chuyên khoa và phòng khám dưới tên bác sĩ
        {
          model: db.Doctor_Info, as: 'doctorInfoData',
          attributes: ['specialtyId', 'clinicId', 'provinceId', 'priceId', 'description'],
          include: [
            { model: db.Specialty, as: 'specialtyData', attributes: ['name'] },
            { model: db.Clinic, as: 'clinicData', attributes: ['name'] },
            { model: db.Allcode, as: 'priceData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
        },
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
        { model: db.Allcode, as: 'positionData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        {
          model: db.Doctor_Info, as: 'doctorInfoData',
          include: [
            { model: db.Allcode, as: 'priceData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'paymentData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'provinceData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
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
    // ✅ [FIX] Ép kiểu date → String để tránh lỗi PostgreSQL "character varying = bigint"
    const schedules = data.arrSchedule.map(item => ({
      ...item,
      date: String(item.date),
      maxNumber: item.maxNumber || 10,
      currentNumber: 0,
    }));
    const existing = await db.Schedule.findAll({
      where: { doctorId: schedules[0].doctorId, date: String(schedules[0].date) },
      attributes: ['timeType', 'doctorId', 'date'],
      raw: true,
    });
    const toCreate = schedules.filter(s => !existing.find(e => e.timeType === s.timeType && String(e.date) === String(s.date)));
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
    // ✅ [FIX] Ép kiểu date → String để tránh lỗi PostgreSQL "character varying = bigint"
    const schedules = await db.Schedule.findAll({
      where: { doctorId, date: String(date) },
      include: [
        { model: db.Allcode, as: 'timeTypeData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
      ],
      order: [
        ['timeType', 'ASC'],
        ['id', 'ASC'],
      ],
      raw: false,
      nest: true,
    });

    // Nếu includeAll === true (Admin hoặc Doctor), truy vấn thêm danh sách booking thực tế của từng slot
    if (includeAll) {
      const bookings = await db.Booking.findAll({
        where: {
          doctorId,
          date: String(date),
          statusId: { [db.Sequelize.Op.ne]: 'S4' },
        },
        include: [
          {
            model: db.User,
            as: 'patientData',
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'address', 'gender'],
            include: [
              { model: db.Allcode, as: 'genderData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            ],
          },
          { model: db.Allcode, as: 'statusData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        ],
        raw: false,
        nest: true,
      });

      const enriched = schedules.map((s) => {
        const plain = s.toJSON ? s.toJSON() : s;
        plain.slotBookings = bookings
          .filter((b) => b.timeType === s.timeType)
          .map((b) => (b.toJSON ? b.toJSON() : b));
        return plain;
      });

      return { errCode: 0, data: enriched };
    }

    // Patient sees only available
    const result = schedules.filter((s) => s.currentNumber < s.maxNumber);
    return { errCode: 0, data: result };
  } catch (err) {
    console.error('>>> getScheduleByDate error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== [Doctor Capacity Engine] SAO CHÉP LỊCH KHÁM SANG NHIỀU NGÀY =====
const copyDoctorSchedule = async (doctorId, sourceDate, targetDates) => {
  try {
    if (!doctorId || !sourceDate || !Array.isArray(targetDates) || targetDates.length === 0) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }

    const sourceSchedules = await db.Schedule.findAll({
      where: { doctorId, date: String(sourceDate) },
      raw: true,
    });

    if (sourceSchedules.length === 0) {
      return { errCode: 2, message: 'Ngày nguồn chưa có khung giờ khám nào để sao chép!' };
    }

    let createdCount = 0;
    for (const targetDate of targetDates) {
      const targetDateStr = String(targetDate);
      for (const s of sourceSchedules) {
        const existing = await db.Schedule.findOne({
          where: { doctorId, date: targetDateStr, timeType: s.timeType },
        });
        if (!existing) {
          await db.Schedule.create({
            doctorId,
            date: targetDateStr,
            timeType: s.timeType,
            maxNumber: s.maxNumber || 10,
            currentNumber: 0,
          });
          createdCount++;
        }
      }
    }

    return {
      errCode: 0,
      message: `Sao chép thành công! Đã tạo ${createdCount} khung giờ khám mới.`,
      data: { createdCount },
    };
  } catch (err) {
    console.error('>>> copyDoctorSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== [Doctor Capacity Engine] THIẾT LẬP LỊCH LẶP ĐỊNH KỲ THEO TUẦN =====
const createRecurringSchedule = async (doctorId, config) => {
  try {
    const { daysOfWeek, startDate, endDate, timeTypes, maxNumber = 10 } = config;
    if (
      !doctorId ||
      !Array.isArray(daysOfWeek) ||
      daysOfWeek.length === 0 ||
      !startDate ||
      !endDate ||
      !Array.isArray(timeTypes) ||
      timeTypes.length === 0
    ) {
      return { errCode: 1, message: 'Thiếu thông tin thiết lập lịch định kỳ!' };
    }

    const moment = require('moment');
    const startM = moment.utc(startDate);
    const endM = moment.utc(endDate);

    if (endM.isBefore(startM)) {
      return { errCode: 2, message: 'Ngày kết thúc phải sau ngày bắt đầu!' };
    }

    let createdCount = 0;
    const curr = startM.clone();

    while (curr.isSameOrBefore(endM)) {
      const dayOfWeek = curr.isoWeekday(); // 1 (Thứ 2) -> 7 (Chủ nhật)
      if (daysOfWeek.includes(dayOfWeek)) {
        const dateTimestamp = curr.valueOf();
        const dateStr = String(dateTimestamp);

        for (const timeType of timeTypes) {
          const existing = await db.Schedule.findOne({
            where: { doctorId, date: dateStr, timeType },
          });
          if (!existing) {
            await db.Schedule.create({
              doctorId,
              date: dateStr,
              timeType,
              maxNumber: parseInt(maxNumber, 10) || 10,
              currentNumber: 0,
            });
            createdCount++;
          }
        }
      }
      curr.add(1, 'days');
    }

    return {
      errCode: 0,
      message: `Thiết lập lịch định kỳ thành công! Đã sinh ra ${createdCount} khung giờ khám.`,
      data: { createdCount },
    };
  } catch (err) {
    console.error('>>> createRecurringSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== [Doctor Capacity Engine] ĐÓNG / MỞ NHẬN LỊCH CỦA 1 SLOT =====
const toggleCloseScheduleSlot = async (scheduleId, doctorId, isClose = true) => {
  try {
    const schedule = await db.Schedule.findOne({
      where: { id: scheduleId, doctorId },
    });
    if (!schedule) return { errCode: 1, message: 'Không tìm thấy lịch khám!' };

    if (isClose) {
      // Đóng slot: maxNumber = currentNumber
      schedule.maxNumber = schedule.currentNumber;
    } else {
      // Mở lại slot: mặc định cho phép thêm ít nhất 5 chỗ
      schedule.maxNumber = Math.max(schedule.currentNumber + 5, 10);
    }
    await schedule.save();

    return {
      errCode: 0,
      message: isClose ? 'Đã đóng nhận lịch cho khung giờ này!' : 'Đã mở lại nhận lịch!',
      data: schedule,
    };
  } catch (err) {
    console.error('>>> toggleCloseScheduleSlot error:', err);
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
            { model: db.Allcode, as: 'genderData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
        },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'genderBookingData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'statusData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
      ],
      order: [
        ['timeType', 'ASC'],
        ['id', 'ASC'],
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
          required: true,
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
    try {
      await emailService.sendEmailRemedy({
        email: patientEmail,           // ✅ Email từ DB, KHÔNG từ client
        imageBase64: data.imageBase64,
        doctorName: data.doctorName || 'Bác sĩ',
        language: data.language || 'vi',
      });
    } catch (emailErr) {
      console.warn('>>> [EMAIL_WARNING] Không gửi được email remedy:', emailErr.message);
    }

    return { errCode: 0, message: 'Gửi kết quả khám thành công!' };
  } catch (err) {
    if (!t.finished) await t.rollback();
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
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['keyMap', 'valueVi', 'valueEn'] },
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


// ═══════════════════════════════════════════════════════════════════════
// [Phase B] getAllDoctors — Bộ lọc bác sĩ theo clinicId / specialtyId
// GET /api/v1/doctors?clinicId=&specialtyId=&page=&limit=
// ═══════════════════════════════════════════════════════════════════════
const getAllDoctors = async ({ clinicId, specialtyId, page = 1, limit = 12 } = {}) => {
  try {
    const doctorInfoWhere = {};
    if (clinicId) doctorInfoWhere.clinicId = parseInt(clinicId);
    if (specialtyId) doctorInfoWhere.specialtyId = parseInt(specialtyId);

    const result = await db.User.findAndCountAll({
      where: { roleId: 'R2' },
      attributes: { exclude: ['password', 'tokenVersion'] },
      include: [{
        model: db.Doctor_Info,
        as: 'doctorInfoData',
        where: Object.keys(doctorInfoWhere).length ? doctorInfoWhere : undefined,
        required: Object.keys(doctorInfoWhere).length > 0,
        include: [
          { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
          { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
          { model: db.Allcode, as: 'priceData', attributes: ['valueVi', 'valueEn'] },
          { model: db.Allcode, as: 'provinceData', attributes: ['valueVi', 'valueEn'] },
        ],
      }],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['id', 'DESC']],
      distinct: true,
    });

    // Convert BLOB image → base64
    const rows = result.rows.map(u => {
      const plain = u.toJSON ? u.toJSON() : u;
      if (plain.image) plain.image = convertBlobToBase64(plain.image);
      return plain;
    });

    return { errCode: 0, data: rows, total: result.count };
  } catch (err) {
    console.error('>>> getAllDoctors error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase B] updateMedicalInfo — Bác sĩ ghi nhận thông tin khám
// PUT /api/v1/bookings/:bookingId/medical-info
// ═══════════════════════════════════════════════════════════════════════
const updateMedicalInfo = async (bookingId, doctorId, data) => {
  try {
    const booking = await db.Booking.findOne({ where: { id: bookingId, doctorId } });
    if (!booking) return { errCode: 1, message: 'Booking not found or unauthorized' };

    await booking.update({
      symptoms: data.symptoms ?? booking.symptoms,
      clinicalNotes: data.clinicalNotes ?? booking.clinicalNotes,
      diagnosis: data.diagnosis ?? booking.diagnosis,
      followUpDate: data.followUpDate ?? booking.followUpDate,
      careInstructions: data.careInstructions ?? booking.careInstructions,
    });

    // Cập nhật đơn thuốc nếu có
    if (Array.isArray(data.medicines)) {
      await db.BookingMedicine.destroy({ where: { bookingId } });
      if (data.medicines.length > 0) {
        await db.BookingMedicine.bulkCreate(
          data.medicines.map(m => ({
            bookingId,
            medicineId: m.medicineId,
            quantity: m.quantity,
            dosage: m.dosage,
            usageInstructions: m.usageInstructions,
          }))
        );
      }
    }

    // Cập nhật chỉ định y khoa nếu có
    if (Array.isArray(data.catalogIds)) {
      await booking.setPrescribedCatalogs(data.catalogIds);
    }

    return { errCode: 0, message: 'Medical info updated successfully' };
  } catch (err) {
    console.error('>>> updateMedicalInfo error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase B] getDoctorOwnProfile — Bác sĩ xem hồ sơ cá nhân
// GET /api/v1/doctor/profile
// ═══════════════════════════════════════════════════════════════════════
const getDoctorOwnProfile = async (doctorId) => {
  try {
    const user = await db.User.findByPk(doctorId, {
      attributes: { exclude: ['password', 'tokenVersion'] },
      include: [{
        model: db.Doctor_Info,
        as: 'doctorInfoData',
        include: [
          { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
          { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
          { model: db.Allcode, as: 'priceData', attributes: ['valueVi', 'valueEn'] },
          { model: db.Allcode, as: 'provinceData', attributes: ['valueVi', 'valueEn'] },
        ],
      }],
    });
    if (!user) return { errCode: 1, message: 'Doctor not found' };

    const plain = user.toJSON ? user.toJSON() : user;
    if (plain.image) plain.image = convertBlobToBase64(plain.image);
    return { errCode: 0, data: plain };
  } catch (err) {
    console.error('>>> getDoctorOwnProfile error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase B extended] updateDoctorOwnProfile — Bác sĩ tự cập nhật hồ sơ
// PUT /api/v1/doctor/profile
// Được phép sửa: firstName, lastName, address, phoneNumber, image,
//   contentHTML, contentMarkdown, description,
//   specialtyId, clinicId, priceId, provinceId, paymentId, note
// KHÔNG cho sửa: email, roleId, positionId (Admin quản lý)
// SECURITY: doctorId luôn lấy từ JWT (req.user.id) — IDOR safe
// ═══════════════════════════════════════════════════════════════════════
const updateDoctorOwnProfile = async (doctorId, data) => {
  try {
    // [SECURITY] doctorId always from JWT (req.user.id) — IDOR safe
    // Update basic user info fields
    const userFields = {};
    if (data.firstName !== undefined) userFields.firstName = data.firstName;
    if (data.lastName !== undefined) userFields.lastName = data.lastName;
    if (data.address !== undefined) userFields.address = data.address;
    if (data.phoneNumber !== undefined) userFields.phoneNumber = data.phoneNumber;
    if (data.image) {
      // ✅ [FIX-IMAGE] Lưu pure base64 TEXT string (không phải binary buffer)
      // Convention: BLOB chứa UTF-8 bytes của base64 text → đọc bằng toString('utf8')
      // Buffer.from(str, 'base64') tạo binary → toString('utf8') cho ra garbage!
      userFields.image = stripBase64Prefix(data.image);
    }
    if (Object.keys(userFields).length > 0) {
      await db.User.update(userFields, { where: { id: doctorId } });
    }

    // Update professional doctor info fields (upsert pattern)
    const infoFields = {};
    if (data.contentHTML !== undefined) infoFields.contentHTML = sanitizeContent(data.contentHTML);
    if (data.contentMarkdown !== undefined) infoFields.contentMarkdown = data.contentMarkdown;
    if (data.description !== undefined) infoFields.description = data.description;
    // [NEW] Professional fields — doctor can now manage these themselves
    if (data.specialtyId !== undefined) infoFields.specialtyId = data.specialtyId || null;
    if (data.clinicId !== undefined) infoFields.clinicId = data.clinicId || null;
    if (data.priceId !== undefined) infoFields.priceId = data.priceId || null;
    if (data.provinceId !== undefined) infoFields.provinceId = data.provinceId || null;
    if (data.paymentId !== undefined) infoFields.paymentId = data.paymentId || null;
    if (data.note !== undefined) infoFields.note = data.note || '';

    if (Object.keys(infoFields).length > 0) {
      // Upsert: create Doctor_Info row if not exists yet
      const existing = await db.Doctor_Info.findOne({ where: { doctorId } });
      if (existing) {
        await db.Doctor_Info.update(infoFields, { where: { doctorId } });
      } else {
        await db.Doctor_Info.create({ doctorId, ...infoFields });
      }
    }

    return { errCode: 0, message: 'Cap nhat ho so thanh cong!' };
  } catch (err) {
    console.error('>>> updateDoctorOwnProfile error:', err);
    return { errCode: -1, message: 'Loi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase B] getDoctorRevenue — Doanh thu cá nhân theo năm
// GET /api/v1/doctor/revenue?year=2025
// ═══════════════════════════════════════════════════════════════════════
const getDoctorRevenue = async (doctorId, year) => {
  try {
    const targetYear = year || new Date().getFullYear();
    const bookings = await db.Booking.findAll({
      where: {
        doctorId,
        statusId: 'S3',
        paymentStatus: 'paid',
        date: { [db.Sequelize.Op.like]: `${targetYear}-%` },
      },
      attributes: ['date', 'bookingPrice'],
    });

    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, count: 0 }));
    bookings.forEach(b => {
      const monthIdx = parseInt((b.date || '').split('-')[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        monthly[monthIdx].revenue += b.bookingPrice || 0;
        monthly[monthIdx].count += 1;
      }
    });
    const total = monthly.reduce((s, m) => s + m.revenue, 0);
    return { errCode: 0, data: { monthly, total, year: targetYear } };
  } catch (err) {
    console.error('>>> getDoctorRevenue error:', err);
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
  // [Phase B] New exports
  getAllDoctors,
  updateMedicalInfo,
  getDoctorOwnProfile,
  updateDoctorOwnProfile,
  getDoctorRevenue,
  // [Doctor Capacity Engine]
  copyDoctorSchedule,
  createRecurringSchedule,
  toggleCloseScheduleSlot,
};

