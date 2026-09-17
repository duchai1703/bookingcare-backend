// src/services/patientService.js
const db = require('../models');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // [NEW LOGIC VNPAY-MAIL]: Lỗi 11 — paymentToken
const bcrypt = require('bcryptjs'); // FIX BE-03
const { Op } = require('sequelize'); // FIX BE-04
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');
const { validateBase64Image } = require('../utils/validateBase64Image');
const { stripBase64Prefix } = require('../utils/stripBase64Prefix');
const { sanitizeContent } = require('../utils/sanitizeHtml');

// ===== BOOK APPOINTMENT (SRS 3.9, REQ-PT-012 → 023) =====
// [Phase 9.3 FIX] Dual Mode: JWT (primary) + Guest Fallback (deprecated)
// [NEW LOGIC VNPAY-MAIL]: Lỗi 11 (paymentToken), Lỗi 14 (null Doctor_Info),
//   Lỗi 15 (bookingPrice=valueVi), Lỗi 26 (email NGOÀI transaction)
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

  // DS-05 FIX: transaction để đảm bảo atomicity
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

    // ═══════════════════════════════════════════════════════════
    // [NEW LOGIC VNPAY-MAIL]: Lỗi 14 — Null Pointer Exception nếu bác sĩ chưa cấu hình giá
    // Fetch Doctor_Info để lấy priceId → Allcode.valueVi (VND)
    // ═══════════════════════════════════════════════════════════
    const doctorInfor = await db.Doctor_Info.findOne({
      where: { doctorId: data.doctorId },
      include: [
        { model: db.Allcode, as: 'priceData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
      ],
      transaction: t,
    });
    if (!doctorInfor) {
      await t.rollback();
      return { errCode: 6, message: 'Bác sĩ chưa cấu hình thông tin khám! Vui lòng chọn bác sĩ khác.' };
    }

    // [NEW LOGIC VNPAY-MAIL]: Lỗi 15 — Forex Leak: BẮT BUỘC lưu valueVi (VND)
    // Parse chuỗi "500.000đ" → số 500000
    const priceStr = doctorInfor.priceData?.valueVi || '0';
    const bookingPrice = parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;

    // REQ-PT-015: Lưu booking (statusId = 'S1' theo State Machine)
    await db.Booking.create({
      statusId: 'S1',
      doctorId: data.doctorId,
      patientId: resolvedPatientId,
      date: data.date,
      timeType: data.timeType,
      token: token,
      // [NEW LOGIC VNPAY-MAIL]: Lỗi 11 — paymentToken cho VNPay (crypto.randomUUID)
      paymentToken: crypto.randomUUID(),
      // [NEW LOGIC VNPAY-MAIL]: Lỗi 15 — bookingPrice luôn bằng VND
      bookingPrice: bookingPrice,
      // [Phase B] QR Token cho Mobile Doctor check-in
      qrToken: `BKQ-${resolvedPatientId || 'GUEST'}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      reason: data.reason || '',
      patientName: data.fullName,
      patientPhoneNumber: data.phoneNumber,
      patientAddress: data.address || '',
      patientGender: data.gender || '',
      patientBirthday: data.birthday || '',
      bankAccountNumber: data.bankAccountNumber || '',
      bankAccountName: data.bankAccountName || '',
      bankName: data.bankName || '',
    }, { transaction: t }); // DS-05

    // FIX BE-06: KHÔNG tăng slot tại S1 — chỉ tăng sau khi verify email (S1→S1.5)

    // ═══════════════════════════════════════════════════════════
    // [NEW LOGIC EMAIL]: Tự động lấy Tên bác sĩ, Giờ và Ngày để gửi mail
    // ═══════════════════════════════════════════════════════════
    const doctorUser = await db.User.findByPk(data.doctorId, {
      attributes: ['firstName', 'lastName'],
      transaction: t,
    });
    const computedDoctorName = doctorUser ? `${doctorUser.lastName} ${doctorUser.firstName}` : 'Bác sĩ';

    const timeAllcode = await db.Allcode.findOne({
      where: { keyMap: data.timeType, type: 'TIME' },
      attributes: ['valueVi', 'valueEn'],
      transaction: t,
    });
    const computedTimeString = data.language === 'en' ? timeAllcode?.valueEn : timeAllcode?.valueVi;

    const parsedDate = new Date(parseInt(data.date, 10));
    const computedDateString = data.language === 'en'
      ? `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`
      : `${parsedDate.getDate()}/${parsedDate.getMonth() + 1}/${parsedDate.getFullYear()}`;

    // ═══════════════════════════════════════════════════════════
    // [NEW LOGIC VNPAY-MAIL]: Lỗi 26 — Gửi Email NGOÀI Transaction
    // COMMIT DB trước, sau đó mới gửi email. Nếu email lỗi, chỉ log warning
    // chứ TUYỆT ĐỐI không rollback DB (tránh sập hệ thống đặt khám vì SMTP)
    // ═══════════════════════════════════════════════════════════
    await t.commit(); // DS-05: commit DB trước

    // Gửi email NGOÀI transaction — lỗi email không ảnh hưởng DB
    const redirectLink = `${process.env.URL_REACT}/verify-booking?token=${token}&doctorId=${data.doctorId}`;
    try {
      await emailService.sendEmailBooking({
        email: data.email,
        patientName: data.fullName,
        doctorName: computedDoctorName,
        time: computedTimeString || '',
        date: computedDateString,
        redirectLink: redirectLink,
        language: data.language || 'vi',
      });
    } catch (emailErr) {
      // [NEW LOGIC VNPAY-MAIL]: Lỗi 26 — Log cảnh báo, KHÔNG rollback
      console.warn('>>> [EMAIL_WARNING] Không gửi được email xác thực:', emailErr.message);
    }

    const response = { errCode: 0, message: 'Đặt lịch thành công! Vui lòng kiểm tra email.' };
    // Trả kèm cảnh báo deprecation nếu dùng Guest Mode
    if (deprecationWarning) response.deprecationWarning = deprecationWarning;
    return response;
  } catch (err) {
    if (!t.finished) await t.rollback(); // DS-05
    console.error('>>> postBookAppointment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== ⭐ [CRITICAL FIX] VERIFY BOOKING — TRANSACTION + PESSIMISTIC LOCK =====
// (SRS 3.10, REQ-PT-019, 020)
// [NEW LOGIC VNPAY-MAIL]: S1 → S1.5 (giữ chỗ 20 phút, chờ thanh toán VNPay)
//   + DoS Guard: Nếu đã S1.5 → return ngay, KHÔNG gọi save() (chống gia hạn updatedAt)
//
// RACE CONDITION TRƯỚC ĐÂY:
//   Bệnh nhân click link xác nhận 2 lần liên tiếp (hoặc mở 2 tab)
//   → Request 1: findOne({statusId:'S1'}) → TÌM THẤY → S1→S1.5 → increment
//   → Request 2: findOne({statusId:'S1'}) → VẪN TÌM THẤY (chưa commit) → S1→S1.5 → increment
//   → currentNumber tăng 2 LẦN cho 1 booking → DATA SỆCH!
//
// FIX: Transaction + lock: t.LOCK.UPDATE
//   → Request 1 khóa dòng → update → commit → mở khóa
//   → Request 2 bị block → sau khi mở khóa → findOne trả NULL (statusId đã = S1.5, ≠ S1)
//   → Rơi vào nhánh DoS Guard → Trả errCode: 0 → Chỉ increment 1 LẦN DUY NHẤT
const postVerifyBookAppointment = async (data) => {
  // Validate trước khi mở transaction
  if (!data.token || !data.doctorId) {
    return { errCode: 1, message: 'Thiếu tham số!' };
  }

  const t = await db.sequelize.transaction();

  try {
    // ═══════════════════════════════════════════════════════════
    // [NEW LOGIC VNPAY-MAIL]: DoS Guard — Check nếu booking ĐÃ là S1.5
    // Nếu đã S1.5, TUYỆT ĐỐI KHÔNG gọi save() (chống gia hạn updatedAt 20 phút)
    // ═══════════════════════════════════════════════════════════
    const existingS15 = await db.Booking.findOne({
      where: {
        token: data.token,
        doctorId: data.doctorId,
        statusId: 'S1.5',
      },
      raw: true,
      transaction: t,
    });
    if (existingS15) {
      await t.rollback();
      // [NEW LOGIC VNPAY-MAIL]: Idempotent — trả thành công nhưng KHÔNG save/update gì cả
      return {
        errCode: 0,
        message: 'Lịch hẹn đã được xác nhận trước đó!',
        data: {
          bookingPrice: existingS15.bookingPrice,
          paymentToken: existingS15.paymentToken,
        },
      };
    }

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

    // ===== 2. UPDATE STATUS S1 → S1.5 (trong transaction) =====
    // [NEW LOGIC VNPAY-MAIL]: Chuyển sang S1.5 thay vì S2
    booking.statusId = 'S1.5';
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
      // Rollback status change (S1→S1.5) vì slot đã đầy
      await t.rollback();
      return { errCode: 5, message: 'Khung giờ đã đầy! Không thể xác nhận lịch hẹn.' };
    }

    await schedule.increment('currentNumber', { by: 1, transaction: t });

    // ===== 4. COMMIT — Cả 2 thao tác thành công =====
    await t.commit();

    // [NEW LOGIC VNPAY-MAIL]: Trả data cho Frontend hiển thị UI thanh toán
    return {
      errCode: 0,
      message: 'Xác nhận lịch hẹn thành công!',
      data: {
        bookingPrice: booking.bookingPrice,
        paymentToken: booking.paymentToken,
      },
    };
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
        { model: db.Allcode, as: 'genderData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        {
          model: db.PatientBankAccount,
          as: 'bankAccounts',
          attributes: ['id', 'bankName', 'accountNumber', 'accountHolderName', 'isPrimary', 'createdAt'],
        },
      ],
      order: [
        [{ model: db.PatientBankAccount, as: 'bankAccounts' }, 'isPrimary', 'DESC'],
        [{ model: db.PatientBankAccount, as: 'bankAccounts' }, 'createdAt', 'DESC'],
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
    if (data.fullName && !data.firstName) {
      const parts = data.fullName.trim().split(' ');
      if (parts.length > 1) {
        user.firstName = sanitizeContent(parts.slice(1).join(' '));
        user.lastName = sanitizeContent(parts[0]);
      } else {
        user.firstName = sanitizeContent(data.fullName.trim());
        user.lastName = '';
      }
    } else {
      if (data.firstName) user.firstName = sanitizeContent(data.firstName);
      if (data.lastName !== undefined) user.lastName = sanitizeContent(data.lastName);
    }

    if (data.birthday !== undefined) user.birthday = data.birthday;
    if (data.address !== undefined) user.address = sanitizeContent(data.address);
    if (data.phoneNumber !== undefined) user.phoneNumber = data.phoneNumber;
    if (data.gender !== undefined) user.gender = data.gender;

    // ═══════════════════════════════════════════════════════════
    // [SECURITY] Image Validation — Validate MIME + size trước khi lưu
    // ═══════════════════════════════════════════════════════════
    if (data.image) {
      const currentBlobBase64 = user.image ? convertBlobToBase64(user.image) : '';
      // Chỉ cập nhật nếu ảnh khác ảnh hiện tại
      if (data.image !== currentBlobBase64) {
        const imgResult = validateBase64Image(data.image);
        if (!imgResult.isValid) {
          return { errCode: 4, message: imgResult.error };
        }
        user.image = stripBase64Prefix(data.image);
      }
    }

    await user.save();

    // Trả về user đã cập nhật (bao gồm image đã convertBlobToBase64)
    // → Frontend dispatch update Redux để Header đồng bộ ngay
    const updatedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      birthday: user.birthday,
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
        // Thông tin bác sĩ (tên, ảnh, chức danh, chuyên khoa, cơ sở y tế)
        {
          model: db.User,
          as: 'doctorBookingData',
          attributes: ['id', 'firstName', 'lastName', 'image'],
          include: [
            { model: db.Allcode, as: 'positionData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['specialtyId', 'clinicId'],
              include: [
                { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name', 'image'] },
                { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address', 'image'] },
              ],
            },
          ],
        },
        // Allcode: trạng thái booking (Chờ xác nhận, Đã xác nhận, Đã khám, Đã hủy)
        { model: db.Allcode, as: 'statusData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        // Allcode: khung giờ (8:00-9:00, ...)
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        // Review: kiểm tra đã đánh giá chưa (chỉ cần id)
        { model: db.Review, as: 'reviewData', attributes: ['id'] },
        // [Phase D.4] Chi tiết đơn thuốc
        {
          model: db.BookingMedicine,
          as: 'bookingMedicines',
          include: [{ model: db.Medicine, as: 'medicineData', attributes: ['id', 'name', 'unit'] }],
        },
        // [Phase B] Danh sách tài liệu đính kèm y tế
        {
          model: db.BookingAttachment,
          as: 'attachments',
          attributes: ['id', 'fileName', 'fileType', 'fileSize', 'createdAt'],
        },
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
// 5. CANCEL BOOKING — Hủy lịch hẹn (S1/S1.5/S2 → S4)
// ─────────────────────────────────────────────────────
// [v2.0 SECURITY FIX #3] Race Condition Prevention + Idempotency
// BẮT BUỘC: Transaction + Pessimistic Row Lock (FOR UPDATE)
// [NEW LOGIC VNPAY-MAIL]: Logic trả slot mở rộng:
//   - S1 (chưa verify) → S4: KHÔNG trả slot (vì chưa tăng slot ở S1)
//   - S1.5 (đã verify, chờ thanh toán) → S4: Trả slot + paymentStatus='cancelled' (Ghost Booking fix)
//   - S2 (đã thanh toán) → S4: Trả slot + paymentStatus='refund_pending' (Lỗi 12)
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

      // [NEW LOGIC VNPAY-MAIL]: Mở rộng cho S1.5
      if (!['S1', 'S1.5', 'S2'].includes(booking.statusId)) {
        await t.rollback();
        return { errCode: 3, message: 'Không thể hủy lịch hẹn ở trạng thái này!' };
      }

      const oldStatus = booking.statusId;

      // Update status → S4 (Đã hủy)
      booking.statusId = 'S4';

      // ═══════════════════════════════════════════════════════════
      // [Chính sách Hoàn tiền dựa trên thời gian từ lúc đặt tới lúc hủy]
      // ═══════════════════════════════════════════════════════════
      const now = new Date();
      booking.cancelledAt = now;

      const createdAtTime = booking.createdAt ? new Date(booking.createdAt).getTime() : now.getTime();
      const hoursSinceCreation = Math.max(0, (now.getTime() - createdAtTime) / (1000 * 60 * 60));

      let calculatedRefundRate = 100;
      if (hoursSinceCreation <= 24) {
        calculatedRefundRate = 100;
      } else if (hoursSinceCreation <= 72) {
        calculatedRefundRate = 75;
      } else {
        calculatedRefundRate = 50;
      }

      booking.refundRate = calculatedRefundRate;
      const price = parseInt(booking.bookingPrice, 10) || 0;
      const calculatedRefundAmount = Math.round((price * calculatedRefundRate) / 100);
      booking.refundAmount = calculatedRefundAmount;

      // ═══════════════════════════════════════════════════════════
      // [Gán paymentStatus & refundStatus phù hợp]
      // ═══════════════════════════════════════════════════════════
      if (oldStatus === 'S1.5') {
        booking.paymentStatus = 'cancelled';
        booking.refundStatus = 'none';
      } else if (oldStatus === 'S2' || booking.paymentStatus === 'paid') {
        booking.paymentStatus = 'refund_pending';
        booking.refundStatus = calculatedRefundAmount > 0 ? 'pending' : 'none';
      } else {
        booking.refundStatus = 'none';
      }

      await booking.save({ transaction: t });

      // ═══════════════════════════════════════════════════════════
      // [NEW LOGIC VNPAY-MAIL]: Trả slot nếu S1.5 hoặc S2 (đã tăng slot)
      // S1 chưa verify → chưa tăng slot → KHÔNG trả
      // ═══════════════════════════════════════════════════════════
      if (oldStatus === 'S1.5' || oldStatus === 'S2') {
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
      return {
        errCode: 0,
        message: 'Hủy lịch hẹn thành công!',
        data: {
          bookingId: booking.id,
          cancelledAt: booking.cancelledAt,
          refundRate: booking.refundRate,
          refundAmount: booking.refundAmount,
          refundStatus: booking.refundStatus,
        },
      };
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('>>> cancelBooking error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 6. ATTACHMENT SERVICES — Quản lý tài liệu đính kèm y tế
// ─────────────────────────────────────────────────────
const getBookingAttachments = async (bookingId, userId, userRole) => {
  try {
    if (!bookingId) return { errCode: 1, message: 'Thiếu ID lịch hẹn!' };

    const booking = await db.Booking.findByPk(bookingId);
    if (!booking) return { errCode: 2, message: 'Không tìm thấy lịch hẹn!' };

    // Authorization: Bệnh nhân của lịch, Bác sĩ phụ trách, hoặc Admin
    const isPatient = booking.patientId === userId;
    const isDoctor = booking.doctorId === userId;
    const isAdmin = userRole === 'R1';
    if (!isPatient && !isDoctor && !isAdmin) {
      return { errCode: 403, message: 'Bạn không có quyền xem tài liệu của lịch hẹn này!' };
    }

    const attachments = await db.BookingAttachment.findAll({
      where: { bookingId },
      attributes: ['id', 'bookingId', 'patientId', 'fileName', 'fileType', 'fileSize', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    return { errCode: 0, message: 'OK', data: attachments };
  } catch (err) {
    console.error('>>> getBookingAttachments error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const uploadBookingAttachment = async (bookingId, userId, filePayload) => {
  try {
    if (!bookingId || !filePayload) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }

    const { fileName, fileType, fileSize, fileData } = filePayload;
    if (!fileName || !fileType || !fileData) {
      return { errCode: 1, message: 'Dữ liệu tệp không hợp lệ!' };
    }

    // Kiểm tra booking thuộc bệnh nhân
    const booking = await db.Booking.findOne({
      where: { id: bookingId, patientId: userId },
    });
    if (!booking) {
      return { errCode: 404, message: 'Không tìm thấy lịch hẹn của bạn!' };
    }

    // Khóa tệp: nếu lịch khám đã hoàn thành (S3) hoặc đã hủy (S4) -> không cho upload
    if (booking.statusId === 'S3') {
      return { errCode: 3, message: 'Lịch khám đã hoàn tất, hồ sơ bệnh án đã được đóng băng!' };
    }
    if (booking.statusId === 'S4') {
      return { errCode: 4, message: 'Lịch hẹn đã bị hủy, không thể bổ sung tệp đính kèm!' };
    }

    // Giới hạn dung lượng: tối đa 10 MB (10 * 1024 * 1024 bytes)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return { errCode: 5, message: 'Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10 MB)!' };
    }

    // Whitelist file type
    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(fileType.toLowerCase())) {
      return { errCode: 6, message: 'Định dạng tệp không được hỗ trợ! Chỉ chấp nhận PDF, JPG, PNG, WEBP.' };
    }

    // Giới hạn số lượng tệp: tối đa 5 tệp cho mỗi lịch hẹn
    const count = await db.BookingAttachment.count({ where: { bookingId } });
    if (count >= 5) {
      return { errCode: 7, message: 'Mỗi lịch khám chỉ được đính kèm tối đa 5 tệp!' };
    }

    // Tạo bản ghi tệp đính kèm
    const newAttachment = await db.BookingAttachment.create({
      bookingId,
      patientId: userId,
      fileName: fileName.substring(0, 255),
      fileType,
      fileSize: fileSize || 0,
      fileData,
    });

    return {
      errCode: 0,
      message: 'Tải lên tài liệu thành công!',
      data: {
        id: newAttachment.id,
        bookingId: newAttachment.bookingId,
        fileName: newAttachment.fileName,
        fileType: newAttachment.fileType,
        fileSize: newAttachment.fileSize,
        createdAt: newAttachment.createdAt,
      },
    };
  } catch (err) {
    console.error('>>> uploadBookingAttachment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const downloadBookingAttachment = async (bookingId, attachmentId, userId, userRole) => {
  try {
    if (!bookingId || !attachmentId) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }

    const booking = await db.Booking.findByPk(bookingId);
    if (!booking) return { errCode: 2, message: 'Không tìm thấy lịch hẹn!' };

    // Authorization
    const isPatient = booking.patientId === userId;
    const isDoctor = booking.doctorId === userId;
    const isAdmin = userRole === 'R1';
    if (!isPatient && !isDoctor && !isAdmin) {
      return { errCode: 403, message: 'Bạn không có quyền truy cập tệp này!' };
    }

    const attachment = await db.BookingAttachment.findOne({
      where: { id: attachmentId, bookingId },
    });
    if (!attachment) {
      return { errCode: 404, message: 'Không tìm thấy tệp đính kèm!' };
    }

    return { errCode: 0, message: 'OK', data: attachment };
  } catch (err) {
    console.error('>>> downloadBookingAttachment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const deleteBookingAttachment = async (bookingId, attachmentId, userId) => {
  try {
    if (!bookingId || !attachmentId) {
      return { errCode: 1, message: 'Thiếu tham số!' };
    }

    const booking = await db.Booking.findOne({
      where: { id: bookingId, patientId: userId },
    });
    if (!booking) {
      return { errCode: 404, message: 'Không tìm thấy lịch hẹn của bạn!' };
    }

    if (booking.statusId === 'S3') {
      return { errCode: 3, message: 'Lịch khám đã hoàn tất, không thể xóa tệp bệnh án!' };
    }

    const attachment = await db.BookingAttachment.findOne({
      where: { id: attachmentId, bookingId, patientId: userId },
    });
    if (!attachment) {
      return { errCode: 404, message: 'Không tìm thấy tệp đính kèm!' };
    }

    await attachment.destroy();
    return { errCode: 0, message: 'Xóa tệp đính kèm thành công!' };
  } catch (err) {
    console.error('>>> deleteBookingAttachment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 7. DOCTOR QR CHECK-IN SERVICE (Mobile Doctor App)
// ─────────────────────────────────────────────────────
const verifyDoctorCheckin = async (qrToken, doctorId) => {
  try {
    if (!qrToken) return { errCode: 1, message: 'Thiếu mã QR check-in!' };

    const booking = await db.Booking.findOne({
      where: { qrToken },
      include: [
        { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phonenumber', 'address', 'gender'] },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'statusData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        {
          model: db.BookingAttachment,
          as: 'attachments',
          attributes: ['id', 'fileName', 'fileType', 'fileSize', 'createdAt'],
        },
      ],
    });

    if (!booking) {
      return { errCode: 404, message: 'Mã QR không hợp lệ hoặc không tồn tại trên hệ thống!' };
    }

    // Kiểm tra đúng bác sĩ phụ trách
    if (booking.doctorId !== doctorId) {
      return {
        errCode: 2,
        message: 'Lịch khám này thuộc về bác sĩ khác!',
        data: {
          bookingId: booking.id,
          doctorId: booking.doctorId,
        },
      };
    }

    // Kiểm tra trạng thái
    if (booking.statusId === 'S4') {
      return {
        errCode: 3,
        message: 'Lịch hẹn này đã bị hủy, không thể tiếp nhận khám!',
        data: { bookingId: booking.id, statusId: booking.statusId },
      };
    }

    if (booking.statusId === 'S3') {
      return {
        errCode: 4,
        message: 'Lịch hẹn này đã hoàn tất khám trước đó!',
        data: { bookingId: booking.id, statusId: booking.statusId },
      };
    }

    return {
      errCode: 0,
      message: 'Xác thực mã QR thành công! Bác sĩ có thể tiếp nhận bệnh nhân.',
      data: booking,
    };
  } catch (err) {
    console.error('>>> verifyDoctorCheckin error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ─────────────────────────────────────────────────────
// 8. PATIENT BANK ACCOUNTS — Quản lý tài khoản hoàn tiền
// ─────────────────────────────────────────────────────
const getPatientBankAccounts = async (patientId) => {
  try {
    const accounts = await db.PatientBankAccount.findAll({
      where: { patientId },
      order: [['isPrimary', 'DESC'], ['createdAt', 'DESC']],
    });
    const formatted = accounts.map((a) => {
      const j = a.toJSON();
      j.accountHolder = j.accountHolderName || j.accountHolder;
      return j;
    });
    return { errCode: 0, message: 'OK', data: formatted };
  } catch (err) {
    console.error('>>> getPatientBankAccounts error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const addPatientBankAccount = async (patientId, data) => {
  try {
    const bankName = data.bankName;
    const accountNumber = data.accountNumber;
    const accountHolder = data.accountHolderName || data.accountHolder;
    const isPrimary = data.isPrimary;
    if (!bankName || !accountNumber || !accountHolder) {
      return { errCode: 1, message: 'Thiếu thông tin tài khoản ngân hàng!' };
    }

    const t = await db.sequelize.transaction();
    try {
      const existingCount = await db.PatientBankAccount.count({
        where: { patientId },
        transaction: t,
      });

      // Nếu là tài khoản đầu tiên, tự động cho là primary
      const shouldBePrimary = existingCount === 0 || !!isPrimary;

      if (shouldBePrimary) {
        // Hủy primary các tài khoản khác
        await db.PatientBankAccount.update(
          { isPrimary: false },
          { where: { patientId }, transaction: t }
        );
      }

      const newAccount = await db.PatientBankAccount.create({
        patientId,
        bankName: sanitizeContent(bankName),
        accountNumber: sanitizeContent(accountNumber.trim()),
        accountHolderName: sanitizeContent(accountHolder.toUpperCase().trim()),
        isPrimary: shouldBePrimary,
      }, { transaction: t });

      await t.commit();
      const resData = newAccount.toJSON();
      resData.accountHolder = resData.accountHolderName;
      return { errCode: 0, message: 'Thêm tài khoản thành công!', data: resData };
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('>>> addPatientBankAccount error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const setPrimaryBankAccount = async (patientId, accountId) => {
  try {
    if (!accountId) return { errCode: 1, message: 'Thiếu ID tài khoản!' };

    const t = await db.sequelize.transaction();
    try {
      const target = await db.PatientBankAccount.findOne({
        where: { id: accountId, patientId },
        transaction: t,
      });

      if (!target) {
        await t.rollback();
        return { errCode: 404, message: 'Không tìm thấy tài khoản ngân hàng!' };
      }

      // Đặt tất cả thành false
      await db.PatientBankAccount.update(
        { isPrimary: false },
        { where: { patientId }, transaction: t }
      );

      // Đặt target thành true
      target.isPrimary = true;
      await target.save({ transaction: t });

      await t.commit();
      return { errCode: 0, message: 'Đã đặt làm tài khoản nhận hoàn tiền chính!', data: target };
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('>>> setPrimaryBankAccount error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const deletePatientBankAccount = async (patientId, accountId) => {
  try {
    if (!accountId) return { errCode: 1, message: 'Thiếu ID tài khoản!' };

    const t = await db.sequelize.transaction();
    try {
      const target = await db.PatientBankAccount.findOne({
        where: { id: accountId, patientId },
        transaction: t,
      });

      if (!target) {
        await t.rollback();
        return { errCode: 404, message: 'Không tìm thấy tài khoản ngân hàng!' };
      }

      const wasPrimary = target.isPrimary;
      await target.destroy({ transaction: t });

      // Nếu vừa xóa tài khoản primary, tự động chọn tài khoản còn lại gần nhất làm primary
      if (wasPrimary) {
        const nextAccount = await db.PatientBankAccount.findOne({
          where: { patientId },
          order: [['createdAt', 'DESC']],
          transaction: t,
        });
        if (nextAccount) {
          nextAccount.isPrimary = true;
          await nextAccount.save({ transaction: t });
        }
      }

      await t.commit();
      return { errCode: 0, message: 'Xóa tài khoản thành công!' };
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('>>> deletePatientBankAccount error:', err);
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
  getBookingAttachments,
  uploadBookingAttachment,
  downloadBookingAttachment,
  deleteBookingAttachment,
  verifyDoctorCheckin,
  getPatientBankAccounts,
  addPatientBankAccount,
  setPrimaryBankAccount,
  deletePatientBankAccount,
};


