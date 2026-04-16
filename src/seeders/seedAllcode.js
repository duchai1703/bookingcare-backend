// src/seeders/seedAllcode.js
// Chạy: npm run seed (hoặc: node src/seeders/seedAllcode.js)

require('dotenv').config();
const db = require('../models');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ===================== ALLCODE DATA =====================
const allcodeData = [
  // ROLE
  { type: 'ROLE', keyMap: 'R1', valueVi: 'Quản trị viên', valueEn: 'Admin' },
  { type: 'ROLE', keyMap: 'R2', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
  { type: 'ROLE', keyMap: 'R3', valueVi: 'Bệnh nhân', valueEn: 'Patient' },
  // GENDER
  { type: 'GENDER', keyMap: 'G1', valueVi: 'Nam', valueEn: 'Male' },
  { type: 'GENDER', keyMap: 'G2', valueVi: 'Nữ', valueEn: 'Female' },
  { type: 'GENDER', keyMap: 'G3', valueVi: 'Khác', valueEn: 'Other' },
  // TIME
  { type: 'TIME', keyMap: 'T1', valueVi: '8:00 - 9:00', valueEn: '8:00 AM - 9:00 AM' },
  { type: 'TIME', keyMap: 'T2', valueVi: '9:00 - 10:00', valueEn: '9:00 AM - 10:00 AM' },
  { type: 'TIME', keyMap: 'T3', valueVi: '10:00 - 11:00', valueEn: '10:00 AM - 11:00 AM' },
  { type: 'TIME', keyMap: 'T4', valueVi: '11:00 - 12:00', valueEn: '11:00 AM - 12:00 PM' },
  { type: 'TIME', keyMap: 'T5', valueVi: '13:00 - 14:00', valueEn: '1:00 PM - 2:00 PM' },
  { type: 'TIME', keyMap: 'T6', valueVi: '14:00 - 15:00', valueEn: '2:00 PM - 3:00 PM' },
  { type: 'TIME', keyMap: 'T7', valueVi: '15:00 - 16:00', valueEn: '3:00 PM - 4:00 PM' },
  { type: 'TIME', keyMap: 'T8', valueVi: '16:00 - 17:00', valueEn: '4:00 PM - 5:00 PM' },
  // STATUS
  { type: 'STATUS', keyMap: 'S1', valueVi: 'Lịch hẹn mới', valueEn: 'New appointment' },
  { type: 'STATUS', keyMap: 'S2', valueVi: 'Đã xác nhận', valueEn: 'Confirmed' },
  { type: 'STATUS', keyMap: 'S3', valueVi: 'Đã khám xong', valueEn: 'Done' },
  { type: 'STATUS', keyMap: 'S4', valueVi: 'Đã hủy', valueEn: 'Cancelled' },
  // POSITION
  { type: 'POSITION', keyMap: 'P0', valueVi: 'Không chọn', valueEn: 'None' },
  { type: 'POSITION', keyMap: 'P1', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
  { type: 'POSITION', keyMap: 'P2', valueVi: 'Thạc sĩ', valueEn: 'Master' },
  { type: 'POSITION', keyMap: 'P3', valueVi: 'Tiến sĩ', valueEn: 'PhD' },
  { type: 'POSITION', keyMap: 'P4', valueVi: 'Phó giáo sư', valueEn: 'Associate Professor' },
  { type: 'POSITION', keyMap: 'P5', valueVi: 'Giáo sư', valueEn: 'Professor' },
  // PRICE
  { type: 'PRICE', keyMap: 'PRI1', valueVi: '100.000đ', valueEn: '100,000 VND' },
  { type: 'PRICE', keyMap: 'PRI2', valueVi: '200.000đ', valueEn: '200,000 VND' },
  { type: 'PRICE', keyMap: 'PRI3', valueVi: '300.000đ', valueEn: '300,000 VND' },
  { type: 'PRICE', keyMap: 'PRI4', valueVi: '500.000đ', valueEn: '500,000 VND' },
  { type: 'PRICE', keyMap: 'PRI5', valueVi: '1.000.000đ', valueEn: '1,000,000 VND' },
  { type: 'PRICE', keyMap: 'PRI6', valueVi: '2.000.000đ', valueEn: '2,000,000 VND' },
  // PAYMENT
  { type: 'PAYMENT', keyMap: 'PAY1', valueVi: 'Tiền mặt', valueEn: 'Cash' },
  { type: 'PAYMENT', keyMap: 'PAY2', valueVi: 'Chuyển khoản', valueEn: 'Bank transfer' },
  { type: 'PAYMENT', keyMap: 'PAY3', valueVi: 'Thẻ tín dụng', valueEn: 'Credit card' },
  // PROVINCE
  { type: 'PROVINCE', keyMap: 'PRO1', valueVi: 'Hà Nội', valueEn: 'Hanoi' },
  { type: 'PROVINCE', keyMap: 'PRO2', valueVi: 'TP. Hồ Chí Minh', valueEn: 'Ho Chi Minh City' },
  { type: 'PROVINCE', keyMap: 'PRO3', valueVi: 'Đà Nẵng', valueEn: 'Da Nang' },
  { type: 'PROVINCE', keyMap: 'PRO4', valueVi: 'Cần Thơ', valueEn: 'Can Tho' },
  { type: 'PROVINCE', keyMap: 'PRO5', valueVi: 'Hải Phòng', valueEn: 'Hai Phong' },
  { type: 'PROVINCE', keyMap: 'PRO6', valueVi: 'Huế', valueEn: 'Hue' },
];

// ===================== SPECIALTY DATA =====================
const specialtyData = [
  {
    name: 'Cơ xương khớp',
    descriptionMarkdown: `## Chuyên khoa Cơ xương khớp\n\nChuyên khoa Cơ xương khớp chẩn đoán và điều trị các bệnh lý liên quan đến hệ thống cơ, xương, khớp và mô liên kết.\n\n### Các bệnh thường gặp\n- Viêm khớp dạng thấp\n- Thoái hóa khớp\n- Loãng xương\n- Gout (Gút)\n- Đau lưng, đau cổ vai gáy\n- Thoát vị đĩa đệm\n\n### Khi nào cần đến khám?\n- Đau nhức xương khớp kéo dài\n- Sưng, nóng, đỏ tại các khớp\n- Hạn chế vận động khớp\n- Tê bì chân tay`,
    descriptionHTML: `<h2>Chuyên khoa Cơ xương khớp</h2><p>Chuyên khoa Cơ xương khớp chẩn đoán và điều trị các bệnh lý liên quan đến hệ thống cơ, xương, khớp và mô liên kết.</p><h3>Các bệnh thường gặp</h3><ul><li>Viêm khớp dạng thấp</li><li>Thoái hóa khớp</li><li>Loãng xương</li><li>Gout (Gút)</li><li>Đau lưng, đau cổ vai gáy</li><li>Thoát vị đĩa đệm</li></ul><h3>Khi nào cần đến khám?</h3><ul><li>Đau nhức xương khớp kéo dài</li><li>Sưng, nóng, đỏ tại các khớp</li><li>Hạn chế vận động khớp</li><li>Tê bì chân tay</li></ul>`,
  },
  {
    name: 'Thần kinh',
    descriptionMarkdown: `## Chuyên khoa Thần kinh\n\nChuyên khoa Thần kinh chẩn đoán và điều trị các bệnh lý về não, tủy sống và hệ thần kinh ngoại biên.\n\n### Các bệnh thường gặp\n- Đau đầu, đau nửa đầu (Migraine)\n- Động kinh\n- Tai biến mạch máu não (Đột quỵ)\n- Bệnh Parkinson\n- Bệnh Alzheimer\n- Rối loạn giấc ngủ`,
    descriptionHTML: `<h2>Chuyên khoa Thần kinh</h2><p>Chuyên khoa Thần kinh chẩn đoán và điều trị các bệnh lý về não, tủy sống và hệ thần kinh ngoại biên.</p><h3>Các bệnh thường gặp</h3><ul><li>Đau đầu, đau nửa đầu (Migraine)</li><li>Động kinh</li><li>Tai biến mạch máu não (Đột quỵ)</li><li>Bệnh Parkinson</li><li>Bệnh Alzheimer</li><li>Rối loạn giấc ngủ</li></ul>`,
  },
  {
    name: 'Tim mạch',
    descriptionMarkdown: `## Chuyên khoa Tim mạch\n\nChuyên khoa Tim mạch chẩn đoán và điều trị các bệnh lý về tim và mạch máu.\n\n### Các bệnh thường gặp\n- Tăng huyết áp\n- Bệnh mạch vành\n- Suy tim\n- Rối loạn nhịp tim\n- Bệnh van tim`,
    descriptionHTML: `<h2>Chuyên khoa Tim mạch</h2><p>Chuyên khoa Tim mạch chẩn đoán và điều trị các bệnh lý về tim và mạch máu.</p><h3>Các bệnh thường gặp</h3><ul><li>Tăng huyết áp</li><li>Bệnh mạch vành</li><li>Suy tim</li><li>Rối loạn nhịp tim</li><li>Bệnh van tim</li></ul>`,
  },
  {
    name: 'Tai Mũi Họng',
    descriptionMarkdown: `## Chuyên khoa Tai Mũi Họng\n\nChuyên khoa Tai Mũi Họng khám và điều trị các bệnh lý vùng tai, mũi, họng và các cấu trúc liên quan.\n\n### Các bệnh thường gặp\n- Viêm amidan\n- Viêm xoang\n- Viêm tai giữa\n- Polyp mũi\n- Ù tai, giảm thính lực`,
    descriptionHTML: `<h2>Chuyên khoa Tai Mũi Họng</h2><p>Chuyên khoa Tai Mũi Họng khám và điều trị các bệnh lý vùng tai, mũi, họng và các cấu trúc liên quan.</p><h3>Các bệnh thường gặp</h3><ul><li>Viêm amidan</li><li>Viêm xoang</li><li>Viêm tai giữa</li><li>Polyp mũi</li><li>Ù tai, giảm thính lực</li></ul>`,
  },
  {
    name: 'Da liễu',
    descriptionMarkdown: `## Chuyên khoa Da liễu\n\nChuyên khoa Da liễu chẩn đoán và điều trị các bệnh lý về da, tóc, móng.\n\n### Các bệnh thường gặp\n- Mụn trứng cá\n- Viêm da cơ địa\n- Nấm da\n- Bệnh vẩy nến\n- Zona thần kinh`,
    descriptionHTML: `<h2>Chuyên khoa Da liễu</h2><p>Chuyên khoa Da liễu chẩn đoán và điều trị các bệnh lý về da, tóc, móng.</p><h3>Các bệnh thường gặp</h3><ul><li>Mụn trứng cá</li><li>Viêm da cơ địa</li><li>Nấm da</li><li>Bệnh vẩy nến</li><li>Zona thần kinh</li></ul>`,
  },
  {
    name: 'Tiêu hóa',
    descriptionMarkdown: `## Chuyên khoa Tiêu hóa\n\nChuyên khoa Tiêu hóa chẩn đoán và điều trị các bệnh lý đường tiêu hóa.\n\n### Các bệnh thường gặp\n- Viêm loét dạ dày\n- Trào ngược dạ dày thực quản\n- Viêm đại tràng\n- Sỏi mật\n- Viêm gan`,
    descriptionHTML: `<h2>Chuyên khoa Tiêu hóa</h2><p>Chuyên khoa Tiêu hóa chẩn đoán và điều trị các bệnh lý đường tiêu hóa.</p><h3>Các bệnh thường gặp</h3><ul><li>Viêm loét dạ dày</li><li>Trào ngược dạ dày thực quản</li><li>Viêm đại tràng</li><li>Sỏi mật</li><li>Viêm gan</li></ul>`,
  },
  {
    name: 'Nhi khoa',
    descriptionMarkdown: `## Chuyên khoa Nhi khoa\n\nChuyên khoa Nhi chăm sóc sức khỏe trẻ em từ sơ sinh đến 16 tuổi.\n\n### Các bệnh thường gặp\n- Viêm phổi trẻ em\n- Tiêu chảy cấp\n- Sốt xuất huyết\n- Hen phế quản trẻ em\n- Suy dinh dưỡng`,
    descriptionHTML: `<h2>Chuyên khoa Nhi khoa</h2><p>Chuyên khoa Nhi chăm sóc sức khỏe trẻ em từ sơ sinh đến 16 tuổi.</p><h3>Các bệnh thường gặp</h3><ul><li>Viêm phổi trẻ em</li><li>Tiêu chảy cấp</li><li>Sốt xuất huyết</li><li>Hen phế quản trẻ em</li><li>Suy dinh dưỡng</li></ul>`,
  },
  {
    name: 'Mắt',
    descriptionMarkdown: `## Chuyên khoa Mắt\n\nChuyên khoa Mắt chẩn đoán và điều trị các bệnh lý về mắt và thị giác.\n\n### Các bệnh thường gặp\n- Cận thị, viễn thị, loạn thị\n- Đục thủy tinh thể\n- Glaucoma (tăng nhãn áp)\n- Viêm kết mạc\n- Bệnh võng mạc`,
    descriptionHTML: `<h2>Chuyên khoa Mắt</h2><p>Chuyên khoa Mắt chẩn đoán và điều trị các bệnh lý về mắt và thị giác.</p><h3>Các bệnh thường gặp</h3><ul><li>Cận thị, viễn thị, loạn thị</li><li>Đục thủy tinh thể</li><li>Glaucoma (tăng nhãn áp)</li><li>Viêm kết mạc</li><li>Bệnh võng mạc</li></ul>`,
  },
];

// ===================== CLINIC DATA =====================
const clinicData = [
  {
    name: 'Bệnh viện Chợ Rẫy',
    address: '201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP.HCM',
    descriptionMarkdown: `## Bệnh viện Chợ Rẫy\n\nBệnh viện Chợ Rẫy là bệnh viện đa khoa hạng đặc biệt tuyến Trung ương, trực thuộc Bộ Y tế. Đây là bệnh viện lớn nhất khu vực phía Nam với hơn 1,800 giường bệnh.\n\n### Chuyên môn nổi bật\n- Phẫu thuật tim mạch\n- Ghép tạng\n- Cấp cứu - Hồi sức tích cực\n- Ung bướu`,
    descriptionHTML: `<h2>Bệnh viện Chợ Rẫy</h2><p>Bệnh viện Chợ Rẫy là bệnh viện đa khoa hạng đặc biệt tuyến Trung ương, trực thuộc Bộ Y tế.</p>`,
  },
  {
    name: 'Bệnh viện Bạch Mai',
    address: '78 Giải Phóng, Phương Mai, Đống Đa, Hà Nội',
    descriptionMarkdown: `## Bệnh viện Bạch Mai\n\nBệnh viện Bạch Mai là bệnh viện đa khoa hạng đặc biệt tuyến cuối của cả nước, trực thuộc Bộ Y tế.\n\n### Chuyên môn nổi bật\n- Nội khoa tổng hợp\n- Tim mạch can thiệp\n- Thần kinh\n- Huyết học truyền máu`,
    descriptionHTML: `<h2>Bệnh viện Bạch Mai</h2><p>Bệnh viện Bạch Mai là bệnh viện đa khoa hạng đặc biệt tuyến cuối của cả nước.</p>`,
  },
  {
    name: 'Bệnh viện Đại học Y Dược TP.HCM',
    address: '215 Hồng Bàng, Phường 11, Quận 5, TP.HCM',
    descriptionMarkdown: `## Bệnh viện Đại học Y Dược TP.HCM\n\nBệnh viện Đại học Y Dược TP.HCM là bệnh viện thực hành của Đại học Y Dược TP.HCM, nổi tiếng với chất lượng khám chữa bệnh cao.\n\n### Chuyên môn nổi bật\n- Da liễu\n- Mắt\n- Tai Mũi Họng\n- Nội tiết`,
    descriptionHTML: `<h2>Bệnh viện Đại học Y Dược TP.HCM</h2><p>Bệnh viện thực hành của Đại học Y Dược TP.HCM.</p>`,
  },
  {
    name: 'Bệnh viện Việt Đức',
    address: '40 Tràng Thi, Hàng Bông, Hoàn Kiếm, Hà Nội',
    descriptionMarkdown: `## Bệnh viện Việt Đức\n\nBệnh viện Hữu nghị Việt Đức là bệnh viện ngoại khoa hạng đặc biệt, trung tâm phẫu thuật lớn nhất Việt Nam.\n\n### Chuyên môn nổi bật\n- Phẫu thuật chấn thương chỉnh hình\n- Phẫu thuật tiêu hóa\n- Ghép tạng\n- Phẫu thuật thần kinh`,
    descriptionHTML: `<h2>Bệnh viện Việt Đức</h2><p>Bệnh viện Hữu nghị Việt Đức là bệnh viện ngoại khoa hạng đặc biệt.</p>`,
  },
  {
    name: 'Phòng khám Đa khoa Quốc tế Vinmec',
    address: '458 Minh Khai, Vĩnh Tuy, Hai Bà Trưng, Hà Nội',
    descriptionMarkdown: `## Phòng khám Đa khoa Quốc tế Vinmec\n\nVinmec là hệ thống y tế đẳng cấp quốc tế với trang thiết bị hiện đại, đội ngũ bác sĩ giỏi.\n\n### Chuyên môn nổi bật\n- Sản phụ khoa\n- Nhi khoa\n- Ung bướu\n- Tim mạch`,
    descriptionHTML: `<h2>Phòng khám Đa khoa Quốc tế Vinmec</h2><p>Vinmec là hệ thống y tế đẳng cấp quốc tế.</p>`,
  },
  {
    name: 'Bệnh viện FV',
    address: '6 Nguyễn Lương Bằng, Phú Mỹ Hưng, Quận 7, TP.HCM',
    descriptionMarkdown: `## Bệnh viện FV\n\nBệnh viện FV (FranceVietnam) là bệnh viện quốc tế đạt tiêu chuẩn JCI, cung cấp dịch vụ y tế chất lượng cao.\n\n### Chuyên môn nổi bật\n- Chấn thương chỉnh hình\n- Nội soi tiêu hóa\n- Sản phụ khoa\n- Da liễu thẩm mỹ`,
    descriptionHTML: `<h2>Bệnh viện FV</h2><p>Bệnh viện FV là bệnh viện quốc tế đạt tiêu chuẩn JCI.</p>`,
  },
];

// ===================== DOCTOR USER DATA =====================
const doctorUsersData = [
  { email: 'bs.nguyenvana@bookingcare.vn', firstName: 'Nguyễn Văn', lastName: 'An', gender: 'G1', address: '123 Lê Lợi, Quận 1, TP.HCM', phoneNumber: '0901234001', positionId: 'P5', image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' },
  { email: 'bs.tranvanbinh@bookingcare.vn', firstName: 'Trần Văn', lastName: 'Bình', gender: 'G1', address: '45 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', phoneNumber: '0901234002', positionId: 'P4', image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' },
  { email: 'bs.lethicuong@bookingcare.vn', firstName: 'Lê Thị', lastName: 'Cường', gender: 'G2', address: '78 Hai Bà Trưng, Quận 3, TP.HCM', phoneNumber: '0901234003', positionId: 'P3' },
  { email: 'bs.phamvandung@bookingcare.vn', firstName: 'Phạm Văn', lastName: 'Dũng', gender: 'G1', address: '90 Điện Biên Phủ, Ba Đình, Hà Nội', phoneNumber: '0901234004', positionId: 'P5' },
  { email: 'bs.hoangthiem@bookingcare.vn', firstName: 'Hoàng Thị', lastName: 'Em', gender: 'G2', address: '12 Nguyễn Huệ, Quận 1, TP.HCM', phoneNumber: '0901234005', positionId: 'P3' },
  { email: 'bs.vovanphuoc@bookingcare.vn', firstName: 'Võ Văn', lastName: 'Phước', gender: 'G1', address: '56 Bạch Đằng, Hải Châu, Đà Nẵng', phoneNumber: '0901234006', positionId: 'P4' },
  { email: 'bs.dangthigiang@bookingcare.vn', firstName: 'Đặng Thị', lastName: 'Giang', gender: 'G2', address: '34 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội', phoneNumber: '0901234007', positionId: 'P3' },
  { email: 'bs.buivanhung@bookingcare.vn', firstName: 'Bùi Văn', lastName: 'Hùng', gender: 'G1', address: '67 Pasteur, Quận 3, TP.HCM', phoneNumber: '0901234008', positionId: 'P5' },
  { email: 'bs.ngothiinh@bookingcare.vn', firstName: 'Ngô Thị', lastName: 'Inh', gender: 'G2', address: '89 Cách Mạng Tháng 8, Quận 10, TP.HCM', phoneNumber: '0901234009', positionId: 'P2' },
  { email: 'bs.dovankhoa@bookingcare.vn', firstName: 'Đỗ Văn', lastName: 'Khoa', gender: 'G1', address: '21 Nguyễn Trãi, Thanh Xuân, Hà Nội', phoneNumber: '0901234010', positionId: 'P4' },
];

// ===================== PATIENT USER DATA =====================
const patientUsersData = [
  { email: 'benhnhan1@gmail.com', firstName: 'Nguyễn Thị', lastName: 'Lan', gender: 'G2', address: '100 Lê Văn Sỹ, Quận 3, TP.HCM', phoneNumber: '0912345001' },
  { email: 'benhnhan2@gmail.com', firstName: 'Trần Văn', lastName: 'Minh', gender: 'G1', address: '200 Cầu Giấy, Hà Nội', phoneNumber: '0912345002' },
  { email: 'benhnhan3@gmail.com', firstName: 'Lê Hoàng', lastName: 'Nam', gender: 'G1', address: '55 Nguyễn Văn Linh, Đà Nẵng', phoneNumber: '0912345003' },
  { email: 'benhnhan4@gmail.com', firstName: 'Phạm Thị', lastName: 'Oanh', gender: 'G2', address: '32 Võ Văn Tần, Quận 3, TP.HCM', phoneNumber: '0912345004' },
  { email: 'benhnhan5@gmail.com', firstName: 'Hoàng Văn', lastName: 'Phú', gender: 'G1', address: '15 Lý Tự Trọng, Quận 1, TP.HCM', phoneNumber: '0912345005' },
];

// ===================== DOCTOR_INFO DATA =====================
// doctorId sẽ được gán sau khi tạo user (bắt đầu từ id=2 vì id=1 là admin)
const doctorInfoData = [
  { specialtyIdx: 0, clinicIdx: 0, priceId: 'PRI4', provinceId: 'PRO2', paymentId: 'PAY1', description: 'Giáo sư, Bác sĩ Nguyễn Văn An - Hơn 30 năm kinh nghiệm trong lĩnh vực Cơ xương khớp. Nguyên Trưởng khoa Cơ xương khớp, Bệnh viện Chợ Rẫy.', contentMarkdown: '## Giáo sư, Bác sĩ Nguyễn Văn An\n\n- Hơn 30 năm kinh nghiệm lĩnh vực Cơ xương khớp\n- Nguyên Trưởng khoa Cơ xương khớp, BV Chợ Rẫy\n- Thành viên Hội Thấp khớp học Việt Nam\n- Tốt nghiệp Đại học Y Dược TP.HCM', contentHTML: '<h2>Giáo sư, Bác sĩ Nguyễn Văn An</h2><ul><li>Hơn 30 năm kinh nghiệm</li><li>Nguyên Trưởng khoa Cơ xương khớp, BV Chợ Rẫy</li></ul>', note: 'Khám từ thứ 2 đến thứ 6' },
  { specialtyIdx: 1, clinicIdx: 1, priceId: 'PRI5', provinceId: 'PRO1', paymentId: 'PAY2', description: 'Phó giáo sư Trần Văn Bình - Chuyên gia đầu ngành Thần kinh, hơn 25 năm kinh nghiệm. Phó Trưởng khoa Thần kinh, Bệnh viện Bạch Mai.', contentMarkdown: '## PGS. Trần Văn Bình\n\n- 25 năm kinh nghiệm chuyên khoa Thần kinh\n- Phó Trưởng khoa Thần kinh, BV Bạch Mai\n- Thành viên Hội Thần kinh học Việt Nam', contentHTML: '<h2>PGS. Trần Văn Bình</h2><ul><li>25 năm kinh nghiệm</li></ul>', note: 'Khám sáng thứ 2, 4, 6' },
  { specialtyIdx: 2, clinicIdx: 2, priceId: 'PRI4', provinceId: 'PRO2', paymentId: 'PAY3', description: 'Tiến sĩ Lê Thị Cường - Chuyên gia Tim mạch, tốt nghiệp Đại học Y Dược TP.HCM, tu nghiệp tại Pháp.', contentMarkdown: '## TS. Lê Thị Cường\n\n- Chuyên gia Tim mạch can thiệp\n- Tu nghiệp tại Bệnh viện Georges Pompidou, Paris\n- Giảng viên ĐH Y Dược TP.HCM', contentHTML: '<h2>TS. Lê Thị Cường</h2><ul><li>Chuyên gia Tim mạch can thiệp</li></ul>', note: 'Nhận khám bảo hiểm' },
  { specialtyIdx: 3, clinicIdx: 3, priceId: 'PRI3', provinceId: 'PRO1', paymentId: 'PAY1', description: 'Giáo sư Phạm Văn Dũng - Chuyên gia Tai Mũi Họng hàng đầu, Nguyên Giám đốc BV Tai Mũi Họng Trung ương.', contentMarkdown: '## GS. Phạm Văn Dũng\n\n- Nguyên Giám đốc BV Tai Mũi Họng TW\n- Hơn 35 năm kinh nghiệm\n- Chuyên gia phẫu thuật nội soi TMH', contentHTML: '<h2>GS. Phạm Văn Dũng</h2><ul><li>Nguyên Giám đốc BV TMH TW</li></ul>', note: 'Khám từ thứ 2 đến thứ 7' },
  { specialtyIdx: 4, clinicIdx: 2, priceId: 'PRI3', provinceId: 'PRO2', paymentId: 'PAY1', description: 'Tiến sĩ Hoàng Thị Em - Chuyên gia Da liễu, BV Đại học Y Dược TP.HCM.', contentMarkdown: '## TS. Hoàng Thị Em\n\n- Chuyên gia Da liễu thẩm mỹ\n- Giảng viên ĐH Y Dược TP.HCM\n- Tu nghiệp tại Hàn Quốc', contentHTML: '<h2>TS. Hoàng Thị Em</h2><ul><li>Chuyên gia Da liễu thẩm mỹ</li></ul>', note: '' },
  { specialtyIdx: 5, clinicIdx: 5, priceId: 'PRI4', provinceId: 'PRO3', paymentId: 'PAY2', description: 'PGS. Võ Văn Phước - Chuyên gia Tiêu hóa, Nội soi can thiệp.', contentMarkdown: '## PGS. Võ Văn Phước\n\n- Chuyên gia Tiêu hóa - Gan mật\n- Phó khoa Nội soi, BV FV\n- Tu nghiệp tại Nhật Bản', contentHTML: '<h2>PGS. Võ Văn Phước</h2><ul><li>Chuyên gia Tiêu hóa</li></ul>', note: 'Khám chiều thứ 3, 5' },
  { specialtyIdx: 6, clinicIdx: 4, priceId: 'PRI3', provinceId: 'PRO1', paymentId: 'PAY1', description: 'TS. Đặng Thị Giang - Chuyên gia Nhi khoa, hơn 15 năm kinh nghiệm.', contentMarkdown: '## TS. Đặng Thị Giang\n\n- Chuyên gia Nhi khoa\n- Bác sĩ tại Vinmec\n- Tu nghiệp tại Úc', contentHTML: '<h2>TS. Đặng Thị Giang</h2><ul><li>Chuyên gia Nhi khoa</li></ul>', note: 'Khám trẻ em từ 0-16 tuổi' },
  { specialtyIdx: 7, clinicIdx: 0, priceId: 'PRI5', provinceId: 'PRO2', paymentId: 'PAY3', description: 'GS. Bùi Văn Hùng - Chuyên gia Mắt, phẫu thuật Laser, đục thủy tinh thể.', contentMarkdown: '## GS. Bùi Văn Hùng\n\n- Chuyên gia phẫu thuật Mắt\n- Hơn 20,000 ca phẫu thuật thành công\n- Nguyên Trưởng khoa Mắt, BV Chợ Rẫy', contentHTML: '<h2>GS. Bùi Văn Hùng</h2><ul><li>Hơn 20,000 ca mổ thành công</li></ul>', note: '' },
  { specialtyIdx: 0, clinicIdx: 4, priceId: 'PRI2', provinceId: 'PRO1', paymentId: 'PAY1', description: 'ThS. Ngô Thị Inh - Bác sĩ Cơ xương khớp, Vinmec Hà Nội.', contentMarkdown: '## ThS. Ngô Thị Inh\n\n- Bác sĩ Cơ xương khớp\n- Tốt nghiệp ĐH Y Hà Nội\n- 10 năm kinh nghiệm', contentHTML: '<h2>ThS. Ngô Thị Inh</h2><ul><li>Bác sĩ CXK, Vinmec</li></ul>', note: '' },
  { specialtyIdx: 1, clinicIdx: 3, priceId: 'PRI4', provinceId: 'PRO1', paymentId: 'PAY2', description: 'PGS. Đỗ Văn Khoa - Chuyên gia Thần kinh, BV Việt Đức.', contentMarkdown: '## PGS. Đỗ Văn Khoa\n\n- Chuyên gia Thần kinh - Phẫu thuật thần kinh\n- Phó khoa Thần kinh, BV Việt Đức\n- Tu nghiệp tại Đức', contentHTML: '<h2>PGS. Đỗ Văn Khoa</h2><ul><li>Phó khoa TK, BV Việt Đức</li></ul>', note: 'Khám sáng thứ 3, 5, 7' },
];

// ===================== SEED FUNCTION =====================
const seed = async () => {
  try {
    await db.sequelize.authenticate();
    console.log('>>> Database connected');

    // Drop & recreate all tables
    await db.sequelize.sync({ force: true });
    console.log('>>> All tables created');

    // 1. Seed Allcode
    await db.Allcode.bulkCreate(allcodeData);
    console.log(`>>> Seeded ${allcodeData.length} allcode records`);

    // 2. Seed Admin
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('123456', salt);
    const admin = await db.User.create({
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

    // 3. Seed Doctor users
    const doctorUsers = [];
    for (const d of doctorUsersData) {
      const user = await db.User.create({
        email: d.email,
        password: hashedPassword,
        firstName: d.firstName,
        lastName: d.lastName,
        roleId: 'R2',
        gender: d.gender,
        address: d.address,
        phoneNumber: d.phoneNumber,
        positionId: d.positionId,
      });
      doctorUsers.push(user);
    }
    console.log(`>>> Seeded ${doctorUsers.length} doctor accounts`);

    // 4. Seed Patient users
    const patientUsers = [];
    for (const p of patientUsersData) {
      const user = await db.User.create({
        email: p.email,
        password: hashedPassword,
        firstName: p.firstName,
        lastName: p.lastName,
        roleId: 'R3',
        gender: p.gender,
        address: p.address,
        phoneNumber: p.phoneNumber,
        positionId: null,
      });
      patientUsers.push(user);
    }
    console.log(`>>> Seeded ${patientUsers.length} patient accounts`);

    // 5. Seed Specialties
    const commonImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const specialties = [];
    for (const s of specialtyData) {
      const spec = await db.Specialty.create({
        name: s.name,
        descriptionMarkdown: s.descriptionMarkdown,
        descriptionHTML: s.descriptionHTML,
        image: commonImageBase64,
      });
      specialties.push(spec);
    }
    console.log(`>>> Seeded ${specialties.length} specialties`);

    // 6. Seed Clinics
    const clinics = [];
    for (const c of clinicData) {
      const clinic = await db.Clinic.create({
        name: c.name,
        address: c.address,
        descriptionMarkdown: c.descriptionMarkdown,
        descriptionHTML: c.descriptionHTML,
        image: commonImageBase64,
      });
      clinics.push(clinic);
    }
    console.log(`>>> Seeded ${clinics.length} clinics`);

    // 7. Seed Doctor_Info
    for (let i = 0; i < doctorInfoData.length; i++) {
      const info = doctorInfoData[i];
      await db.Doctor_Info.create({
        doctorId: doctorUsers[i].id,
        specialtyId: specialties[info.specialtyIdx].id,
        clinicId: clinics[info.clinicIdx].id,
        priceId: info.priceId,
        provinceId: info.provinceId,
        paymentId: info.paymentId,
        contentHTML: info.contentHTML,
        contentMarkdown: info.contentMarkdown,
        description: info.description,
        note: info.note,
        count: 0,
      });
    }
    console.log(`>>> Seeded ${doctorInfoData.length} doctor_info records`);

    // 8. Seed Schedules (next 7 days for each doctor, multiple time slots)
    const today = new Date();
    let scheduleCount = 0;
    const timeSlots = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

    for (const doctor of doctorUsers) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);
        // FIX BUG: Start-of-day MUST be UTC (midnight UTC) to match frontend moment.utc().startOf('day')
        const utcStartOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        const dateStr = utcStartOfDay.toString();

        // Each doctor has 4-6 random time slots per day
        const numSlots = 4 + Math.floor(Math.random() * 3);
        const shuffled = [...timeSlots].sort(() => 0.5 - Math.random());
        const selectedSlots = shuffled.slice(0, numSlots);

        for (const slot of selectedSlots) {
          await db.Schedule.create({
            doctorId: doctor.id,
            date: dateStr,
            timeType: slot,
            maxNumber: 10,
            currentNumber: 0,
          });
          scheduleCount++;
        }
      }
    }
    console.log(`>>> Seeded ${scheduleCount} schedule records (7 days x ${doctorUsers.length} doctors)`);

    // 9. Seed some Bookings (sample appointments) including past bookings for Reviews
    const bookingData = [
      // Future bookings
      { doctorIdx: 0, patientIdx: 0, dayOffset: 0, timeType: 'T1', status: 'S2', reason: 'Đau khớp gối kéo dài 2 tuần', patientName: 'Nguyễn Thị Lan', patientPhone: '0912345001' },
      { doctorIdx: 0, patientIdx: 1, dayOffset: 0, timeType: 'T2', status: 'S2', reason: 'Thoái hóa cột sống cổ', patientName: 'Trần Văn Minh', patientPhone: '0912345002' },
      { doctorIdx: 1, patientIdx: 2, dayOffset: 1, timeType: 'T3', status: 'S1', reason: 'Đau đầu thường xuyên, chóng mặt', patientName: 'Lê Hoàng Nam', patientPhone: '0912345003' },
      
      // Past bookings for reviews (Done status S3)
      { doctorIdx: 0, patientIdx: 2, dayOffset: -5, timeType: 'T1', status: 'S3', reason: 'Tái khám khớp gối', patientName: 'Lê Hoàng Nam', patientPhone: '0912345003', hasReview: true, rating: 5, comment: 'Bác sĩ An rất tận tâm, giải thích cặn kẽ bệnh tình.' },
      { doctorIdx: 0, patientIdx: 3, dayOffset: -10, timeType: 'T4', status: 'S3', reason: 'Đau mỏi vai gáy', patientName: 'Phạm Thị Oanh', patientPhone: '0912345004', hasReview: true, rating: 4, comment: 'Phòng khám sạch sẽ, bác sĩ khám kỹ nhưng hẹn lịch hơi đông.' },
      { doctorIdx: 1, patientIdx: 4, dayOffset: -3, timeType: 'T2', status: 'S3', reason: 'Mất ngủ kéo dài', patientName: 'Hoàng Văn Phú', patientPhone: '0912345005', hasReview: true, rating: 5, comment: 'Đã hết đau nửa đầu sau liệu trình của bác sĩ Bình.' }
    ];

    let bookingCount = 0;
    let reviewCount = 0;
    for (const b of bookingData) {
      const date = new Date(today);
      date.setDate(date.getDate() + b.dayOffset);
      const utcStartOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      const dateStr = utcStartOfDay.toString();

      const newBooking = await db.Booking.create({
        statusId: b.status,
        doctorId: doctorUsers[b.doctorIdx].id,
        patientId: patientUsers[b.patientIdx].id,
        date: dateStr,
        timeType: b.timeType,
        token: uuidv4(),
        reason: b.reason,
        patientName: b.patientName || 'Test Patient',
        patientPhoneNumber: b.patientPhone || '090',
        patientAddress: 'Address',
        patientGender: 'G1',
        patientBirthday: '1990-01-01',
      });
      bookingCount++;

      // Seed explicit Reviews for 'Done' bookings
      if (b.hasReview) {
        await db.Review.create({
          doctorId: doctorUsers[b.doctorIdx].id,
          patientId: patientUsers[b.patientIdx].id,
          bookingId: newBooking.id,
          rating: b.rating,
          comment: b.comment,
        });
        reviewCount++;
      }
    }
    console.log(`>>> Seeded ${bookingCount} bookings & ${reviewCount} reviews`);

    // ========== SUMMARY ==========
    console.log('');
    console.log('========================================');
    console.log('  SEED COMPLETE! Tổng kết:');
    console.log(`  - Allcode: ${allcodeData.length} records`);
    console.log('  - Admin: admin@bookingcare.vn / 123456');
    console.log(`  - Doctors: ${doctorUsers.length} accounts (password: 123456)`);
    console.log(`  - Patients: ${patientUsers.length} accounts (password: 123456)`);
    console.log(`  - Specialties: ${specialties.length} records`);
    console.log(`  - Clinics: ${clinics.length} records`);
    console.log(`  - Doctor_Info: ${doctorInfoData.length} records`);
    console.log(`  - Schedules: ${scheduleCount} records`);
    console.log(`  - Bookings/Reviews: ${bookingCount}/${reviewCount}`);
    console.log('  - All passwords: 123456');
    console.log('========================================');

    process.exit(0);
  } catch (err) {
    console.error('>>> Seed error:', err);
    process.exit(1);
  }
};

seed();
