// src/seeders/seedAllcode.js
// Chạy: npm run seed (hoặc: node src/seeders/seedAllcode.js)

require('dotenv').config();
const db = require('../models');  
const bcrypt = require('bcryptjs');

const allcodeData = [
  // ROLE (SRS: R1, R2, R3)
  { type: 'ROLE', keyMap: 'R1', valueVi: 'Quản trị viên', valueEn: 'Admin' },
  { type: 'ROLE', keyMap: 'R2', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
  { type: 'ROLE', keyMap: 'R3', valueVi: 'Bệnh nhân', valueEn: 'Patient' },

  // GENDER (SRS: G1, G2, G3)
  { type: 'GENDER', keyMap: 'G1', valueVi: 'Nam', valueEn: 'Male' },
  { type: 'GENDER', keyMap: 'G2', valueVi: 'Nữ', valueEn: 'Female' },
  { type: 'GENDER', keyMap: 'G3', valueVi: 'Khác', valueEn: 'Other' },

  // TIME (SRS: T1-T8, REQ-AM-019)
  { type: 'TIME', keyMap: 'T1', valueVi: '8:00 - 9:00', valueEn: '8:00 AM - 9:00 AM' },
  { type: 'TIME', keyMap: 'T2', valueVi: '9:00 - 10:00', valueEn: '9:00 AM - 10:00 AM' },
  { type: 'TIME', keyMap: 'T3', valueVi: '10:00 - 11:00', valueEn: '10:00 AM - 11:00 AM' },
  { type: 'TIME', keyMap: 'T4', valueVi: '11:00 - 12:00', valueEn: '11:00 AM - 12:00 PM' },
  { type: 'TIME', keyMap: 'T5', valueVi: '13:00 - 14:00', valueEn: '1:00 PM - 2:00 PM' },
  { type: 'TIME', keyMap: 'T6', valueVi: '14:00 - 15:00', valueEn: '2:00 PM - 3:00 PM' },
  { type: 'TIME', keyMap: 'T7', valueVi: '15:00 - 16:00', valueEn: '3:00 PM - 4:00 PM' },
  { type: 'TIME', keyMap: 'T8', valueVi: '16:00 - 17:00', valueEn: '4:00 PM - 5:00 PM' },

  // STATUS (SRS: S1-S4, State Machine)
  { type: 'STATUS', keyMap: 'S1', valueVi: 'Lịch hẹn mới', valueEn: 'New appointment' },
  { type: 'STATUS', keyMap: 'S2', valueVi: 'Đã xác nhận', valueEn: 'Confirmed' },
  { type: 'STATUS', keyMap: 'S3', valueVi: 'Đã khám xong', valueEn: 'Done' },
  { type: 'STATUS', keyMap: 'S4', valueVi: 'Đã hủy', valueEn: 'Cancelled' },

  // POSITION (SRS: P0-P5)
  { type: 'POSITION', keyMap: 'P0', valueVi: 'Không chọn', valueEn: 'None' },
  { type: 'POSITION', keyMap: 'P1', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
  { type: 'POSITION', keyMap: 'P2', valueVi: 'Thạc sĩ', valueEn: 'Master' },
  { type: 'POSITION', keyMap: 'P3', valueVi: 'Tiến sĩ', valueEn: 'PhD' },
  { type: 'POSITION', keyMap: 'P4', valueVi: 'Phó giáo sư', valueEn: 'Associate Professor' },
  { type: 'POSITION', keyMap: 'P5', valueVi: 'Giáo sư', valueEn: 'Professor' },

  // PRICE (SRS: PRI1-PRI6)
  { type: 'PRICE', keyMap: 'PRI1', valueVi: '100.000đ', valueEn: '100,000 VND' },
  { type: 'PRICE', keyMap: 'PRI2', valueVi: '200.000đ', valueEn: '200,000 VND' },
  { type: 'PRICE', keyMap: 'PRI3', valueVi: '300.000đ', valueEn: '300,000 VND' },
  { type: 'PRICE', keyMap: 'PRI4', valueVi: '500.000đ', valueEn: '500,000 VND' },
  { type: 'PRICE', keyMap: 'PRI5', valueVi: '1.000.000đ', valueEn: '1,000,000 VND' },
  { type: 'PRICE', keyMap: 'PRI6', valueVi: '2.000.000đ', valueEn: '2,000,000 VND' },

  // PAYMENT (SRS: PAY1-PAY3)
  { type: 'PAYMENT', keyMap: 'PAY1', valueVi: 'Tiền mặt', valueEn: 'Cash' },
  { type: 'PAYMENT', keyMap: 'PAY2', valueVi: 'Chuyển khoản', valueEn: 'Bank transfer' },
  { type: 'PAYMENT', keyMap: 'PAY3', valueVi: 'Thẻ tín dụng', valueEn: 'Credit card' },

  // PROVINCE (SRS: PRO1-PRO6)
  { type: 'PROVINCE', keyMap: 'PRO1', valueVi: 'Hà Nội', valueEn: 'Hanoi' },
  { type: 'PROVINCE', keyMap: 'PRO2', valueVi: 'TP. Hồ Chí Minh', valueEn: 'Ho Chi Minh City' },
  { type: 'PROVINCE', keyMap: 'PRO3', valueVi: 'Đà Nẵng', valueEn: 'Da Nang' },
  { type: 'PROVINCE', keyMap: 'PRO4', valueVi: 'Cần Thơ', valueEn: 'Can Tho' },
  { type: 'PROVINCE', keyMap: 'PRO5', valueVi: 'Hải Phòng', valueEn: 'Hai Phong' },
  { type: 'PROVINCE', keyMap: 'PRO6', valueVi: 'Huế', valueEn: 'Hue' },
];

const seed = async () => {
  try {
    await db.sequelize.authenticate();
    console.log('>>> Database connected');

    // Xóa và tạo lại tất cả bảng
    await db.sequelize.sync({ force: true });
    console.log('>>> All tables created');

    // Seed Allcode (31 records)
    await db.Allcode.bulkCreate(allcodeData);
    console.log(`>>> Seeded ${allcodeData.length} allcode records`);

    // Seed Admin account mặc định (admin@bookingcare.vn / 123456)
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('123456', salt);
    await db.User.create({
      email: 'admin@bookingcare.vn',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'BookingCare',
      roleId: 'R1',
      gender: 'G1',
      address: 'TP. Hồ Chí Minh',
      phoneNumber: '0123456789',
      positionId: null,
    });
    console.log('>>> Seeded admin account (admin@bookingcare.vn / 123456)');

    console.log('');
    console.log('========================================');
    console.log('  SEED COMPLETE! Tổng kết:');
    console.log(`  - Allcode: ${allcodeData.length} records`);
    console.log('  - Admin: admin@bookingcare.vn / 123456');
    console.log('  - 7 tables created');
    console.log('========================================');

    process.exit(0);
  } catch (err) {
    console.error('>>> Seed error:', err);
    process.exit(1);
  }
};

seed();
