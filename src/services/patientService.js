// src/services/patientService.js
const db = require('../models');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs'); // FIX BE-03
const { Op } = require('sequelize'); // FIX BE-04
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');
const { validateBase64Image } = require('../utils/validateBase64Image');
const { stripBase64Prefix } = require('../utils/stripBase64Prefix');
const { sanitizeContent } = require('../utils/sanitizeHtml');

// ===== BOOK APPOINTMENT (SRS 3.9, REQ-PT-012 → 023) =====
// [Phase 9.3 FIX] Dual Mode: JWT (primary) + Guest Fallback (deprecated)
const postBookAppointment = async (data, patientId) => {
  // DS-05 FIX: Validate trước transaction để tránh mở transaction khi input sai
  // REQ-PT-014: Validate dữ liệu đầu vào
  if (!data.email || !data.fullName || !data.doctorId || !data.date ||
      !data.timeType || !data.phoneNumber) {
    return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { errCode: 1, message: 'Email không đúng định dạng!' };
  }

  // Validate SĐT (10-11 số)
  const phoneRegex = /^[0-9]{10,11}$/;
  if (!phoneRegex.test(data.phoneNumber)) {
    return { errCode: 1, message: 'Số điện thoại không hợp lệ!' };
  }

  // ═══════════════════════════════════════════════════════════
  // [Phase 9.3] Dual Mode — Xác định patientId
  // Ưu tiên 1: patientId từ JWT (user đã đăng nhập)
  // Fallback:  Guest Mode (deprecated) — chỉ khi BOOKING_GUEST_MODE=true
  // ═══════════════════════════════════════════════════════════
  let resolvedPatientId = patientId; // Từ JWT
  let deprecationWarning = null;

  // DS-05 FIX: transaction để đảm bảo atomicity (Booking + Email phải thành công cùng nhau)
  const t = await db.sequelize.transaction();
  try {
    // REQ-AM-023: Kiểm tra lịch khám còn chỗ trống không
    const schedule = await db.Schedule.findOne({
      where: { doctorId: data.doctorId, date: data.date, timeType: data.timeType },
      transaction: t, // DS-05
    });
    if (!schedule) {
      await t.rollback();
      return { errCode: 3, message: 'Khung giờ khám không tồn tại!' };
    }
    if (schedule.currentNumber >= schedule.maxNumber) {
      await t.rollback();
      return { errCode: 4, message: 'Khung giờ này đã hết chỗ!' };
    }

    // ═══════════════════════════════════════════════════════════
    // [Dual Mode] Nếu KHÔNG có JWT patientId → thử Guest Mode
    // ═══════════════════════════════════════════════════════════
    if (!resolvedPatientId) {
      // [GUARD] Guest Mode chỉ bật khi .env BOOKING_GUEST_MODE=true
      if (process.env.BOOKING_GUEST_MODE !== 'true') {
        await t.rollback();
        return { errCode: 5, message: 'Vui lòng đăng nhập để đặt lịch khám!' };
      }

      // ⚠️ [DEPRECATED] Guest Checkout — sẽ bị loại bỏ sau 7 ngày
      deprecationWarning = 'Guest checkout sẽ ngừng hỗ trợ. Vui lòng đăng ký tài khoản.';
      console.warn('>>> [DEPRECATED] Guest booking mode used for:', data.email);

      // FIX BE-03: hash password trước khi lưu (REQ-AU-002)
      const hashedDefault = await bcrypt.hash('patient_default', 10);
      const [patient] = await db.User.findOrCreate({
        where: { email: data.email },
        defaults: {
          email: data.email,
          password: hashedDefault,
          firstName: data.fullName,
          lastName: '',
          roleId: 'R3',
          gender: data.gender || '',
          address: data.address || '',
          phoneNumber: data.phoneNumber || '',
        },
        transaction: t,
      });
      resolvedPatientId = patient.id;
    }

    // Tạo token duy nhất cho email xác thực (SRS REQ-PT-019)
    const token = uuidv4();

    // REQ-PT-022: Kiểm tra đặt lịch trùng (cùng bác sĩ, cùng ngày, cùng giờ)
    const existBooking = await db.Booking.findOne({
      where: {
        doctorId: data.doctorId,
        patientId: resolvedPatientId,
        date: data.date,
        timeType: data.timeType,
        statusId: { [Op.ne]: 'S4' }, // FIX BE-04: loại trừ booking đã hủy
      },
      transaction: t, // DS-05
    });
    if (existBooking) {
      await t.rollback();
      return { errCode: 2, message: 'Bạn đã đặt lịch này rồi!' };
    }

    // REQ-PT-015: Lưu booking (statusId = 'S1' theo State Machine)
    await db.Booking.create({
      statusId: 'S1',
      doctorId: data.doctorId,
      patientId: resolvedPatientId,
      date: data.date,
      timeType: data.timeType,
      token: token,
      reason: data.reason || '',
      patientName: data.fullName,
      patientPhoneNumber: data.phoneNumber,
      patientAddress: data.address || '',
      patientGender: data.gender || '',
      patientBirthday: data.birthday || '',
    }, { transaction: t }); // DS-05

    // FIX BE-06: KHÔNG tăng slot tại S1 — chỉ tăng sau khi verify email (S1→S2)

    // REQ-PT-016, 017: Gửi email xác thực
    const redirectLink = `${process.env.URL_REACT}/verify-booking?token=${token}&doctorId=${data.doctorId}`;
    await emailService.sendEmailBooking({
      email: data.email,
      patientName: data.fullName,
      doctorName: data.doctorName || 'Bác sĩ',
      time: data.timeString || '',
      date: data.dateString || '',
      redirectLink: redirectLink,
      language: data.language || 'vi',
    });

    await t.commit(); // DS-05: email OK → commit tất cả DB changes

    const response = { errCode: 0, message: 'Đặt lịch thành công! Vui lòng kiểm tra email.' };
    // Trả kèm cảnh báo deprecation nếu dùng Guest Mode
    if (deprecationWarning) response.deprecationWarning = deprecationWarning;
    return response;
  } catch (err) {
    await t.rollback(); // DS-05: bất kỳ lỗi nào (kể cả SMTP) → rollback DB
    console.error('>>> postBookAppointment error:', err);
    if (err.message?.includes('email') || err.code === 'ECONNREFUSED') {
      return { errCode: -1, message: 'Không thể gửi email xác thực. Vui lòng thử lại!' };
    }
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== ⭐ [CRITICAL FIX] VERIFY BOOKING — TRANSACTION + PESSIMISTIC LOCK =====
// (SRS 3.10, REQ-PT-019, 020)
//
// RACE CONDITION TRƯỚC ĐÂY:
//   Bệnh nhân click link xác nhận 2 lần liên tiếp (hoặc mở 2 tab)
//   → Request 1: findOne({statusId:'S1'}) → TÌM THẤY → S1→S2 → increment
//   → Request 2: findOne({statusId:'S1'}) → VẪN TÌM THẤY (chưa commit) → S1→S2 → increment
//   → currentNumber tăng 2 LẦN cho 1 booking → DATA SỆCH!
//
// FIX: Transaction + lock: t.LOCK.UPDATE
//   → Request 1 khóa dòng → update → commit → mở khóa
//   → Request 2 bị block → sau khi mở khóa → findOne trả NULL (statusId đã = S2, ≠ S1)
//   → Trả errCode: 3 → Chỉ increment 1 LẦN DUY NHẤT
const postVerifyBookAppointment = async (data) => {
  // Validate trước khi mở transaction
  if (!data.token || !data.doctorId) {
    return { errCode: 1, message: 'Thiếu tham số!' };
  }

  const t = await db.sequelize.transaction();

  try {
    // ===== 1. FIND BOOKING VỚI PESSIMISTIC LOCK =====
    const booking = await db.Booking.findOne({
      where: {
        token: data.token,
        doctorId: data.doctorId,
        statusId: 'S1',             // State Machine gate — chỉ S1 mới được verify
      },
      raw: false,
      transaction: t,
      lock: t.LOCK.UPDATE,           // ✅ PESSIMISTIC LOCK — khóa dòng
    });

    if (!booking) {
      await t.rollback();
      return { errCode: 3, message: 'Lịch hẹn không tồn tại hoặc đã được xác nhận!' };
    }

    // ===== 2. UPDATE STATUS S1 → S2 (trong transaction) =====
    booking.statusId = 'S2';
    await booking.save({ transaction: t });

    // ===== 3. TĂNG SLOT SAU KHI XÁC NHẬN (trong transaction) =====
    // FIX BE-06: Chỉ tăng slot SAU KHI bệnh nhân xác nhận email (REQ-AM-023)
    // [Phase 9.3 FIX] Guard Overflow + Pessimistic Lock trên Schedule
    const schedule = await db.Schedule.findOne({
      where: {
        doctorId: booking.doctorId,
        date: booking.date,
        timeType: booking.timeType,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,  // ✅ PESSIMISTIC LOCK trên Schedule — chặn concurrent increment
    });

    // Guard Overflow: Chỉ increment NẾU còn slot trống
    if (!schedule || schedule.currentNumber >= schedule.maxNumber) {
      // Rollback status change (S1→S2) vì slot đã đầy
      await t.rollback();
      return { errCode: 5, message: 'Khung giờ đã đầy! Không thể xác nhận lịch hẹn.' };
    }

    await schedule.increment('currentNumber', { by: 1, transaction: t });

    // ===== 4. COMMIT — Cả 2 thao tác thành công =====
    await t.commit();

    return { errCode: 0, message: 'Xác nhận lịch hẹn thành công!' };
  } catch (err) {
    await t.rollback();
    console.error('>>> postVerifyBookAppointment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase 9.2] PATIENT PORTAL APIs — Protected (verifyToken + checkPatientRole)
// ═══════════════════════════════════════════════════════════════════════
// IDOR Prevention: TẤT CẢ hàm dưới đây nhận patientId từ req.user.id (JWT)
// TUYỆT ĐỐI KHÔNG lấy patientId từ query/body
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────
// 1. GET PATIENT PROFILE — Lấy thông tin cá nhân bệnh nhân
// ─────────────────────────────────────────────────────
const getPatientProfile = async (patientId) => {
  try {
    const user = await db.User.findByPk(patientId, {
      attributes: { exclude: ['password', 'tokenVersion'] },  // Không trả password/tokenVersion
      raw: false,
      include: [
        // Include Allcode để lấy tên giới tính (Giới tính: Nam/Nữ)
        { model: db.Allcode, as: 'genderData', attributes: ['valueVi', 'valueEn'] },
      ],
    });

    if (!user) {
      return { errCode: 1, message: 'Không tìm thấy người dùng!' };
    }

    // ✅ [BẮT BUỘC] Dùng convertBlobToBase64 để giải mã ảnh trước khi trả về
    // ⛔ CẤM dùng Buffer.from(blob).toString('base64') — gây Double-Encoding
    if (user.image) {
      user.setDataValue('image', convertBlobToBase64(user.image));
    }

    return { errCode: 0, message: 'OK', data: user };
  } catch (err) {
    console.error('>>> getPatientProfile error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 2. EDIT PATIENT PROFILE — Cập nhật thông tin cá nhân
// ─────────────────────────────────────────────────────
// Security: XSS Sanitize + Image Validate + IDOR từ JWT
// ─────────────────────────────────────────────────────
const editPatientProfile = async (data, patientId) => {
  try {
    // [IDOR Prevention] patientId LẤY TỪ JWT, không từ body
    const user = await db.User.findByPk(patientId, { raw: false });
    if (!user) {
      return { errCode: 1, message: 'Không tìm thấy người dùng!' };
    }

    // ═══════════════════════════════════════════════════════════
    // [SECURITY] XSS Sanitize — Làm sạch TẤT CẢ input text trước khi lưu DB
    // Chặn Stored XSS tại Backend (Defense-in-Depth Layer 1)
    // ═══════════════════════════════════════════════════════════
    if (data.firstName) user.firstName = sanitizeContent(data.firstName);
    if (data.lastName) user.lastName = sanitizeContent(data.lastName);
    if (data.address) user.address = sanitizeContent(data.address);
    if (data.phoneNumber) user.phoneNumber = data.phoneNumber;
    if (data.gender) user.gender = data.gender;

    // ═══════════════════════════════════════════════════════════
    // [SECURITY] Image Validation — Validate MIME + size trước khi lưu
    // ═══════════════════════════════════════════════════════════
    if (data.image) {
      const imgResult = validateBase64Image(data.image);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
      // ✅ Strip prefix trước khi lưu vào BLOB (tránh Double-Encoding)
      user.image = stripBase64Prefix(data.image);
    }

    await user.save();

    // Trả về user đã cập nhật (bao gồm image đã convertBlobToBase64)
    // → Frontend dispatch update Redux để Header đồng bộ ngay
    const updatedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      address: user.address,
      gender: user.gender,
      image: convertBlobToBase64(user.image),  // ✅ BẮT BUỘC convertBlobToBase64
    };

    return { errCode: 0, message: 'Cập nhật thành công!', data: updatedUser };
  } catch (err) {
    console.error('>>> editPatientProfile error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 3. CHANGE PASSWORD — Đổi mật khẩu bệnh nhân
// ─────────────────────────────────────────────────────
// Security: bcrypt verify old → hash new → tokenVersion++ → revoke ALL old sessions
// ─────────────────────────────────────────────────────
const changePassword = async (data, patientId) => {
  try {
    if (!data.oldPassword || !data.newPassword) {
      return { errCode: 1, message: 'Thiếu mật khẩu cũ hoặc mật khẩu mới!' };
    }

    if (data.newPassword.length < 6) {
      return { errCode: 1, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' };
    }

    // [IDOR Prevention] patientId LẤY TỪ JWT
    const user = await db.User.findByPk(patientId, { raw: false });
    if (!user) {
      return { errCode: 1, message: 'Không tìm thấy người dùng!' };
    }

    // Verify mật khẩu cũ bằng bcrypt
    const isMatch = await bcrypt.compare(data.oldPassword, user.password);
    if (!isMatch) {
      return { errCode: 2, message: 'Mật khẩu cũ không đúng!' };
    }

    // Hash mật khẩu mới
    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);
    user.password = hashedNewPassword;

    // ═══════════════════════════════════════════════════════════
    // [v3.0 STRICT] Token Revocation — Tăng tokenVersion để thu hồi MỌI session cũ
    // Sau khi đổi MK, tất cả JWT đăng nhập cũ (chứa tokenVersion cũ) sẽ bị
    // reject bởi verifyToken middleware → buộc đăng nhập lại
    // ═══════════════════════════════════════════════════════════
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    return { errCode: 0, message: 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.' };
  } catch (err) {
    console.error('>>> changePassword error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 4. GET PATIENT BOOKINGS — Lấy lịch sử khám (3 tabs)
// ─────────────────────────────────────────────────────
// BẮT BUỘC: Phân trang (limit, offset) + Include Review (isReviewed flag)
// Design Doc v3.0, Mục 4.1.2
// ─────────────────────────────────────────────────────
const getPatientBookings = async (patientId, query) => {
  try {
    const { page = 1, limit = 10, status } = query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 10, 50); // Cap tối đa 50

    // ═══════════════════════════════════════════════════════════
    // [IDOR Prevention] WHERE patientId = req.user.id (từ JWT)
    // TUYỆT ĐỐI KHÔNG lấy patientId từ query/body
    // ═══════════════════════════════════════════════════════════
    const whereClause = { patientId };

    // Filter theo tab: status=S1,S2 (sắp tới) | S3 (đã khám) | S4 (đã hủy)
    if (status) {
      whereClause.statusId = { [Op.in]: status.split(',') };
    }

    const { count, rows } = await db.Booking.findAndCountAll({
      where: whereClause,
      limit: safeLimit,
      offset,
      order: [['createdAt', 'DESC']],
      raw: false,
      nest: true,
      include: [
        // Thông tin bác sĩ (tên, ảnh, chức danh)
        {
          model: db.User,
          as: 'doctorBookingData',
          attributes: ['id', 'firstName', 'lastName', 'image'],
          include: [
            { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
          ],
        },
        // Allcode: trạng thái booking (Chờ xác nhận, Đã xác nhận, Đã khám, Đã hủy)
        { model: db.Allcode, as: 'statusData', attributes: ['valueVi', 'valueEn'] },
        // Allcode: khung giờ (8:00-9:00, ...)
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['valueVi', 'valueEn'] },
        // Review: kiểm tra đã đánh giá chưa (chỉ cần id)
        { model: db.Review, as: 'reviewData', attributes: ['id'] },
      ],
    });

    // ✅ Convert ảnh bác sĩ và thêm cờ isReviewed
    const bookings = rows.map((booking) => {
      const bookingJson = booking.toJSON();

      // Convert ảnh bác sĩ từ BLOB → base64
      if (bookingJson.doctorBookingData && bookingJson.doctorBookingData.image) {
        bookingJson.doctorBookingData.image = convertBlobToBase64(bookingJson.doctorBookingData.image);
      }

      // Thêm cờ boolean isReviewed → Frontend ẩn/hiện nút [Đánh giá]
      bookingJson.isReviewed = !!bookingJson.reviewData;

      return bookingJson;
    });

    return {
      errCode: 0,
      message: 'OK',
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        totalItems: count,
        totalPages: Math.ceil(count / safeLimit),
      },
    };
  } catch (err) {
    console.error('>>> getPatientBookings error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 5. CANCEL BOOKING — Hủy lịch hẹn (S1/S2 → S4)
// ─────────────────────────────────────────────────────
// [v2.0 SECURITY FIX #3] Race Condition Prevention + Idempotency
// BẮT BUỘC: Transaction + Pessimistic Row Lock (FOR UPDATE)
// Logic trả slot:
//   - S1 (chưa verify) → S4: KHÔNG trả slot (vì chưa tăng slot ở S1)
//   - S2 (đã verify) → S4: Trả slot (decrement) CHỈ KHI currentNumber > 0
// ─────────────────────────────────────────────────────
const cancelBooking = async (data, patientId) => {
  try {
    const bookingId = data.bookingId;
    if (!bookingId) {
      return { errCode: 1, message: 'Thiếu ID lịch hẹn!' };
    }

    const t = await db.sequelize.transaction();
    try {
      // ═══════════════════════════════════════════════════════════
      // [IDOR Prevention + Pessimistic Lock] Tìm Booking với ROW LOCK
      // WHERE { id: bookingId, patientId: req.user.id } → chặn cancel booking người khác
      // lock: t.LOCK.UPDATE → FOR UPDATE → chặn concurrent cancel
      // ═══════════════════════════════════════════════════════════
      const booking = await db.Booking.findOne({
        where: { id: bookingId, patientId },
        transaction: t,
        lock: t.LOCK.UPDATE,  // ✅ PESSIMISTIC LOCK — chặn race condition
        raw: false,
      });

      if (!booking) {
        await t.rollback();
        return { errCode: 2, message: 'Không tìm thấy lịch hẹn!' };
      }

      // ═══════════════════════════════════════════════════════════
      // [Idempotency Check] Đã hủy rồi → no-op, trả luôn
      // Tránh decrement slot thêm lần nữa nếu request trùng
      // ═══════════════════════════════════════════════════════════
      if (booking.statusId === 'S4') {
        await t.rollback();
        return { errCode: 0, message: 'Lịch hẹn đã được hủy trước đó.' };
      }

      // [Guard] Chỉ cho hủy khi status là S1 hoặc S2
      if (!['S1', 'S2'].includes(booking.statusId)) {
        await t.rollback();
        return { errCode: 3, message: 'Không thể hủy lịch hẹn ở trạng thái này!' };
      }

      const oldStatus = booking.statusId;

      // Update status → S4 (Đã hủy)
      booking.statusId = 'S4';
      await booking.save({ transaction: t });

      // ═══════════════════════════════════════════════════════════
      // [Slot Management] Trả slot CHỈ KHI status cũ là S2 (đã xác nhận = đã tăng slot)
      // S1 chưa verify → chưa tăng slot → KHÔNG trả
      // ═══════════════════════════════════════════════════════════
      if (oldStatus === 'S2') {
        // Lock Schedule row để tránh race condition trên currentNumber
        const schedule = await db.Schedule.findOne({
          where: {
            doctorId: booking.doctorId,
            date: booking.date,
            timeType: booking.timeType,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,  // ✅ Row Lock cho Schedule
        });

        // Guard clause: Chỉ trừ nếu currentNumber > 0 (tránh số âm)
        if (schedule && schedule.currentNumber > 0) {
          await schedule.decrement('currentNumber', { by: 1, transaction: t });
        }
      }
      // (Không trừ slot nếu oldStatus = 'S1' vì S1 chưa tăng slot)

      await t.commit();
      return { errCode: 0, message: 'Hủy lịch hẹn thành công!' };
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('>>> cancelBooking error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = {
  postBookAppointment,
  postVerifyBookAppointment,
  getPatientProfile,
  editPatientProfile,
  changePassword,
  getPatientBookings,
  cancelBooking,
};

