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

  await transporter.sendMail({
    from: '"BookingCare" <noreply@bookingcare.vn>',
    to: data.email,
    subject: data.language === 'vi' ? 'Xác nhận lịch hẹn khám bệnh' : 'Medical Appointment Confirmation',
    html: htmlContent,
  });
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

  await transporter.sendMail({
    from: '"BookingCare" <noreply@bookingcare.vn>',
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
};

module.exports = { sendEmailBooking, sendEmailRemedy };
