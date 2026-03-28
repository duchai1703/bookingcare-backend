// src/services/patientService.js
const db = require('../models');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs'); // FIX BE-03
const { Op } = require('sequelize'); // FIX BE-04

// ===== BOOK APPOINTMENT (SRS 3.9, REQ-PT-012 → 023) =====
const postBookAppointment = async (data) => {
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

    // Tạo token duy nhất cho email xác thực (SRS REQ-PT-019)
    const token = uuidv4();

    // Tìm hoặc tạo user bệnh nhân (role R3)
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
      transaction: t, // DS-05
    });

    // REQ-PT-022: Kiểm tra đặt lịch trùng (cùng bác sĩ, cùng ngày, cùng giờ)
    const existBooking = await db.Booking.findOne({
      where: {
        doctorId: data.doctorId,
        patientId: patient.id,
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
      patientId: patient.id,
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
    // (increment được chuyển sang postVerifyBookAppointment)

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
    return { errCode: 0, message: 'Đặt lịch thành công! Vui lòng kiểm tra email.' };
  } catch (err) {
    await t.rollback(); // DS-05: bất kỳ lỗi nào (kể cả SMTP) → rollback DB
    console.error('>>> postBookAppointment error:', err);
    if (err.message?.includes('email') || err.code === 'ECONNREFUSED') {
      return { errCode: -1, message: 'Không thể gửi email xác thực. Vui lòng thử lại!' };
    }
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== VERIFY BOOKING (SRS 3.10, REQ-PT-019, 020) =====
const postVerifyBookAppointment = async (data) => {
  try {
    if (!data.token || !data.doctorId) {
      return { errCode: 1, message: 'Thiếu tham số!' };
    }
    const booking = await db.Booking.findOne({
      where: { token: data.token, doctorId: data.doctorId, statusId: 'S1' },
      raw: false,
    });
    if (!booking) {
      return { errCode: 3, message: 'Lịch hẹn không tồn tại hoặc đã được xác nhận!' };
    }
    // State Machine: S1 → S2 (xác nhận bằng email)
    booking.statusId = 'S2';
    await booking.save();

    // FIX BE-06: Chỉ tăng slot SAU KHI bệnh nhân xác nhận email (REQ-AM-023)
    await db.Schedule.increment('currentNumber', {
      by: 1,
      where: { doctorId: booking.doctorId, date: booking.date, timeType: booking.timeType },
    });

    return { errCode: 0, message: 'Xác nhận lịch hẹn thành công!' };
  } catch (err) {
    console.error('>>> postVerifyBookAppointment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = {
  postBookAppointment,
  postVerifyBookAppointment,
};
