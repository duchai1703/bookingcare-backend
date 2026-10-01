// src/services/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_APP_USERNAME,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

const SENDER_EMAIL = process.env.EMAIL_APP_USERNAME || 'noreply@bookingcare.vn';
const SENDER_NAME = 'BookingCare';

// Gửi email xác thực lịch hẹn (SRS REQ-PT-016, 017, 018)
const sendEmailBooking = async (data) => {
  const htmlContent = data.language === 'vi'
    ? `<h3>Xin chào ${data.patientName},</h3>
       <p>Bạn đã đặt lịch khám bệnh trực tuyến thành công.</p>
       <p><b>Bác sĩ:</b> ${data.doctorName}</p>
       <p><b>Thời gian:</b> ${data.time}</p>
       <p><b>Ngày:</b> ${data.date}</p>
       <p>Nếu thông tin trên là chính xác, vui lòng click vào link bên dưới để xác nhận:</p>
       <div><a href="${data.redirectLink}" target="_blank">Xác nhận lịch hẹn</a></div>
       <p>Xin chân thành cảm ơn!</p>`
    : `<h3>Dear ${data.patientName},</h3>
       <p>You have successfully booked a medical appointment online.</p>
       <p><b>Doctor:</b> ${data.doctorName}</p>
       <p><b>Time:</b> ${data.time}</p>
       <p><b>Date:</b> ${data.date}</p>
       <p>Please click the link below to confirm your appointment:</p>
       <div><a href="${data.redirectLink}" target="_blank">Confirm appointment</a></div>
       <p>Thank you!</p>`;

  const info = await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: data.email,
    subject: data.language === 'vi' ? 'Xác nhận lịch hẹn khám bệnh' : 'Medical Appointment Confirmation',
    html: htmlContent,
  });
  console.log('>>> [EMAIL_SENT] Booking confirmation email sent to:', data.email, 'MessageId:', info.messageId);
  return info;
};

// Gửi kết quả khám kèm file đính kèm (SRS REQ-DR-008, 009, 010)
const sendEmailRemedy = async (data) => {
  const htmlContent = data.language === 'vi'
    ? `<h3>Xin chào,</h3>
       <p>Bạn nhận được kết quả khám bệnh từ bác sĩ <b>${data.doctorName}</b>.</p>
       <p>Thông tin kết quả khám được gửi trong file đính kèm.</p>
       <p>Xin chân thành cảm ơn!</p>`
    : `<h3>Dear Patient,</h3>
       <p>You have received medical results from Dr. <b>${data.doctorName}</b>.</p>
       <p>Please find the results in the attached file.</p>
       <p>Thank you!</p>`;
  // ✅ [FIX] Tách raw base64 data robustly từ full data URI
  const base64Raw = data.imageBase64.includes('base64,')
    ? data.imageBase64.split('base64,')[1]
    : data.imageBase64;
  // Detect MIME type cho đúng extension
  const mimeMatch = data.imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const ext = mimeMatch ? mimeMatch[1].split('/')[1].replace('jpeg', 'jpg') : 'png';

  const info = await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: data.email,
    subject: data.language === 'vi' ? 'Kết quả khám bệnh' : 'Medical Examination Results',
    html: htmlContent,
    attachments: [
      {
        filename: `ket-qua-kham-${Date.now()}.${ext}`,
        content: base64Raw,
        encoding: 'base64',
      },
    ],
  });
  console.log('>>> [EMAIL_SENT] Remedy email sent to:', data.email, 'MessageId:', info.messageId);
  return info;
};

// [Phase 9] Gửi email đặt lại mật khẩu (Password Recovery)
// Được gọi từ authService.forgotPassword
const sendEmailResetPassword = async (data) => {
  const htmlContent = data.language === 'vi'
    ? `<h3>Xin chào ${data.lastName} ${data.firstName},</h3>
       <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản BookingCare.</p>
       <p>Vui lòng click vào link bên dưới để đặt lại mật khẩu (link có hiệu lực trong 15 phút):</p>
       <div><a href="${data.resetLink}" target="_blank">Đặt lại mật khẩu</a></div>
       <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
       <p>Xin chân thành cảm ơn!</p>`
    : `<h3>Dear ${data.lastName} ${data.firstName},</h3>
       <p>You have requested to reset your BookingCare account password.</p>
       <p>Please click the link below to reset your password (valid for 15 minutes):</p>
       <div><a href="${data.resetLink}" target="_blank">Reset Password</a></div>
       <p>If you did not request a password reset, please ignore this email.</p>
       <p>Thank you!</p>`;

  const info = await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: data.email,
    subject: data.language === 'vi' ? 'Đặt lại mật khẩu BookingCare' : 'BookingCare Password Reset',
    html: htmlContent,
  });
  console.log('>>> [EMAIL_SENT] Reset password email sent to:', data.email, 'MessageId:', info.messageId);
  return info;
};

// [Phase 2] Gửi email xin lỗi khi Bác sĩ báo bận / Hủy lịch khám & Xác nhận hoàn tiền Ví 100%
const sendDoctorCancellationApologyEmail = async (data) => {
  if (!data || !data.email) return;
  const isVi = (data.language || 'vi') === 'vi';
  const refundFormatted = Number(data.refundAmount || 0).toLocaleString('vi-VN');
  const rescheduleUrl = data.rescheduleUrl || `${process.env.URL_REACT || 'http://localhost:3000'}/patient/appointments`;

  const htmlContent = isVi
    ? `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #087f8c; padding: 20px; text-align: center; color: #fff;">
          <h2 style="margin: 0; font-size: 20px;">BookingCare — Thông Báo Thay Đổi Lịch Khám</h2>
        </div>
        <div style="padding: 24px;">
          <p>Kính gửi quý bệnh nhân <b>${data.patientName || 'Quý khách'}</b>,</p>
          <p>Chúng tôi vô cùng lấy làm tiếc phải thông báo rằng lịch khám của Quý khách đã bị hủy do Bác sĩ có lịch bận hoặc sự cố y khoa đột xuất.</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0;">
            <p style="margin: 4px 0;"><b>Bác sĩ:</b> ${data.doctorName || 'Bác sĩ chuyên khoa'}</p>
            <p style="margin: 4px 0;"><b>Thời gian ban đầu:</b> ${data.appointmentTime || ''} - ${data.appointmentDate || ''}</p>
            <p style="margin: 4px 0;"><b>Lý do từ bác sĩ:</b> <i style="color: #b91c1c;">"${data.reason || 'Bận đột xuất'}"</i></p>
          </div>

          <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #047857;">
              ✔ Chính sách bảo đảm quyền lợi người bệnh
            </h4>
            <p style="margin: 4px 0; color: #065f46;">
              Hệ thống đã tự động <b>hoàn trả 100% tiền khám (${refundFormatted} ₫)</b> về <b>Ví BookingCare</b> của Quý khách ngay tức thì.
            </p>
            <p style="margin: 4px 0; font-size: 13px; color: #047857;">
              Quý khách có thể kiểm tra số dư ví và sử dụng số tiền này để đổi lịch khám mới với 1-Click mà không cần thanh toán thêm.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${rescheduleUrl}" target="_blank" style="background-color: #087f8c; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Đổi lịch khám thông minh ngay
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b;">
            Một lần nữa, BookingCare và Bác sĩ xin chân thành cáo lỗi vì sự bất tiện này.
          </p>
        </div>
        <div style="background-color: #f1f5f9; padding: 12px; text-align: center; font-size: 12px; color: #94a3b8;">
          © BookingCare — Nền tảng Y tế Chăm sóc Sức khỏe Toàn diện
        </div>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #087f8c; padding: 20px; text-align: center; color: #fff;">
          <h2 style="margin: 0; font-size: 20px;">BookingCare — Appointment Cancellation Notice</h2>
        </div>
        <div style="padding: 24px;">
          <p>Dear <b>${data.patientName || 'Valued Patient'}</b>,</p>
          <p>We deeply regret to inform you that your appointment has been cancelled due to an unforeseen schedule conflict with the doctor.</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0;">
            <p style="margin: 4px 0;"><b>Doctor:</b> ${data.doctorName || 'Specialist'}</p>
            <p style="margin: 4px 0;"><b>Scheduled Time:</b> ${data.appointmentTime || ''} - ${data.appointmentDate || ''}</p>
            <p style="margin: 4px 0;"><b>Doctor's Reason:</b> <i style="color: #b91c1c;">"${data.reason || 'Unforeseen conflict'}"</i></p>
          </div>

          <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #047857;">
              ✔ Patient Protection Policy
            </h4>
            <p style="margin: 4px 0; color: #065f46;">
              <b>100% of your examination fee (${refundFormatted} VND)</b> has been refunded to your <b>BookingCare Wallet</b> immediately.
            </p>
            <p style="margin: 4px 0; font-size: 13px; color: #047857;">
              You can use your wallet balance to easily reschedule your appointment at zero extra cost.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${rescheduleUrl}" target="_blank" style="background-color: #087f8c; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reschedule Your Appointment Now
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b;">
            We sincerely apologize for this inconvenience and appreciate your kind understanding.
          </p>
        </div>
        <div style="background-color: #f1f5f9; padding: 12px; text-align: center; font-size: 12px; color: #94a3b8;">
          © BookingCare Healthcare Platform
        </div>
      </div>
    `;

  try {
    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: data.email,
      subject: isVi ? 'Thông báo hủy lịch khám & Hoàn tiền vào Ví BookingCare' : 'Appointment Cancellation & Wallet Refund Notice',
      html: htmlContent,
    });
    console.log(`[EMAIL APOLOGY SENT] To: ${data.email} | Booking #${data.bookingId}`);
  } catch (err) {
    console.error(`[EMAIL APOLOGY FAILED] To: ${data.email} | Error:`, err.message);
  }
};

module.exports = {
  sendEmailBooking,
  sendEmailRemedy,
  sendEmailResetPassword,
  sendDoctorCancellationApologyEmail,
};
