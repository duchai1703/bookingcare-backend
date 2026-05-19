// src/seeders/seedHelpers.js — Helper functions & data pools for Super Seeder
const { v4: uuidv4 } = require('uuid');

// ══════════════ RANDOM UTILITIES ══════════════
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (arr) => [...arr].sort(() => 0.5 - Math.random());
const removeDiacritics = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// ══════════════ NAME POOLS (Vietnamese) ══════════════
const lastNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const maleMiddleNames = ['Văn', 'Đức', 'Minh', 'Quốc', 'Thành', 'Hữu', 'Công', 'Thanh', 'Hoàng'];
const femaleMiddleNames = ['Thị', 'Ngọc', 'Thanh', 'Phương', 'Thuỳ', 'Bích', 'Hồng'];
const firstNamesMale = ['An', 'Bình', 'Cường', 'Dũng', 'Đạt', 'Hải', 'Hùng', 'Khoa', 'Long', 'Minh', 'Nam', 'Phong', 'Quân', 'Sơn', 'Tùng', 'Tuấn', 'Việt', 'Vương', 'Trí', 'Nghĩa', 'Kiên', 'Thắng', 'Hưng', 'Tâm', 'Đông'];
const firstNamesFemale = ['Anh', 'Chi', 'Dung', 'Giang', 'Hà', 'Hạnh', 'Hương', 'Lan', 'Linh', 'Mai', 'Ngân', 'Nhung', 'Oanh', 'Phượng', 'Quỳnh', 'Thảo', 'Thu', 'Trang', 'Trinh', 'Vy', 'Yến', 'Xuân', 'Hiền', 'Diệu', 'Hằng'];
const addresses = [
  '123 Lê Lợi, Quận 1, TP.HCM', '45 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '78 Hai Bà Trưng, Quận 3, TP.HCM',
  '90 Điện Biên Phủ, Ba Đình, Hà Nội', '12 Nguyễn Huệ, Quận 1, TP.HCM', '56 Bạch Đằng, Hải Châu, Đà Nẵng',
  '34 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội', '67 Pasteur, Quận 3, TP.HCM', '21 Nguyễn Trãi, Thanh Xuân, Hà Nội',
  '100 Lê Văn Sỹ, Quận 3, TP.HCM', '200 Cầu Giấy, Hà Nội', '55 Nguyễn Văn Linh, Đà Nẵng',
  '15 Lý Tự Trọng, Quận 1, TP.HCM', '88 Võ Thị Sáu, Quận 3, TP.HCM', '42 Phan Đình Phùng, Ba Đình, Hà Nội',
  '77 Nguyễn Du, Quận 1, TP.HCM', '33 Hoàng Hoa Thám, Tây Hồ, Hà Nội', '99 Trường Chinh, Thanh Xuân, Hà Nội',
  '60 Đinh Tiên Hoàng, Quận Bình Thạnh, TP.HCM', '150 Hùng Vương, Ninh Kiều, Cần Thơ',
];

// ══════════════ SPECIALTY DATA ══════════════
const specialtyNames = [
  'Cơ xương khớp', 'Thần kinh', 'Tim mạch', 'Tai Mũi Họng', 'Da liễu',
  'Tiêu hóa', 'Nhi khoa', 'Mắt', 'Răng Hàm Mặt', 'Sản phụ khoa',
  'Hô hấp', 'Nội tiết', 'Thận - Tiết niệu', 'Ung bướu', 'Tâm thần',
];
const specialtyDiseases = {
  'Cơ xương khớp': ['Viêm khớp dạng thấp', 'Thoái hóa khớp', 'Loãng xương', 'Gout', 'Thoát vị đĩa đệm', 'Đau cổ vai gáy'],
  'Thần kinh': ['Đau đầu Migraine', 'Động kinh', 'Đột quỵ', 'Parkinson', 'Alzheimer', 'Rối loạn giấc ngủ'],
  'Tim mạch': ['Tăng huyết áp', 'Bệnh mạch vành', 'Suy tim', 'Rối loạn nhịp tim', 'Bệnh van tim'],
  'Tai Mũi Họng': ['Viêm amidan', 'Viêm xoang', 'Viêm tai giữa', 'Polyp mũi', 'Ù tai'],
  'Da liễu': ['Mụn trứng cá', 'Viêm da cơ địa', 'Nấm da', 'Vẩy nến', 'Zona thần kinh'],
  'Tiêu hóa': ['Viêm loét dạ dày', 'Trào ngược dạ dày', 'Viêm đại tràng', 'Sỏi mật', 'Viêm gan'],
  'Nhi khoa': ['Viêm phổi trẻ em', 'Tiêu chảy cấp', 'Sốt xuất huyết', 'Hen phế quản', 'Suy dinh dưỡng'],
  'Mắt': ['Cận thị', 'Đục thủy tinh thể', 'Glaucoma', 'Viêm kết mạc', 'Bệnh võng mạc'],
  'Răng Hàm Mặt': ['Sâu răng', 'Viêm nướu', 'Viêm tủy răng', 'Răng khôn mọc lệch', 'Niềng răng chỉnh nha'],
  'Sản phụ khoa': ['Thai kỳ nguy cơ cao', 'U xơ tử cung', 'Viêm nhiễm phụ khoa', 'Rối loạn kinh nguyệt', 'Vô sinh'],
  'Hô hấp': ['Hen suyễn', 'Viêm phổi', 'COPD', 'Lao phổi', 'Viêm phế quản'],
  'Nội tiết': ['Đái tháo đường', 'Bệnh tuyến giáp', 'Rối loạn lipid máu', 'Suy thượng thận', 'Béo phì'],
  'Thận - Tiết niệu': ['Sỏi thận', 'Viêm bàng quang', 'Suy thận mãn', 'Nhiễm trùng tiết niệu', 'U tiền liệt tuyến'],
  'Ung bướu': ['Ung thư phổi', 'Ung thư vú', 'Ung thư đại tràng', 'Ung thư gan', 'Ung thư dạ dày'],
  'Tâm thần': ['Trầm cảm', 'Rối loạn lo âu', 'Tâm thần phân liệt', 'Rối loạn lưỡng cực', 'PTSD'],
};

// ══════════════ CLINIC DATA ══════════════
const clinicPool = [
  { name: 'Bệnh viện Chợ Rẫy', address: '201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP.HCM' },
  { name: 'Bệnh viện Bạch Mai', address: '78 Giải Phóng, Phương Mai, Đống Đa, Hà Nội' },
  { name: 'Bệnh viện Đại học Y Dược TP.HCM', address: '215 Hồng Bàng, Phường 11, Quận 5, TP.HCM' },
  { name: 'Bệnh viện Việt Đức', address: '40 Tràng Thi, Hàng Bông, Hoàn Kiếm, Hà Nội' },
  { name: 'Phòng khám Đa khoa Quốc tế Vinmec', address: '458 Minh Khai, Hai Bà Trưng, Hà Nội' },
  { name: 'Bệnh viện FV', address: '6 Nguyễn Lương Bằng, Phú Mỹ Hưng, Quận 7, TP.HCM' },
  { name: 'Nha khoa Paris', address: '12 Thái Hà, Đống Đa, Hà Nội' },
  { name: 'Bệnh viện Từ Dũ', address: '284 Cống Quỳnh, Phạm Ngũ Lão, Quận 1, TP.HCM' },
  { name: 'Bệnh viện Trung ương Huế', address: '16 Lê Lợi, Vĩnh Ninh, TP Huế' },
  { name: 'Bệnh viện Đà Nẵng', address: '124 Hải Phòng, Thạch Thang, Hải Châu, Đà Nẵng' },
];

// ══════════════ REVIEW COMMENTS ══════════════
const reviewComments = [
  'Bác sĩ rất tận tâm, giải thích cặn kẽ bệnh tình. Tôi rất hài lòng!',
  'Phòng khám sạch sẽ, hiện đại. Bác sĩ khám kỹ lưỡng.',
  'Đã hết triệu chứng sau liệu trình điều trị. Cảm ơn bác sĩ!',
  'Bác sĩ rất thân thiện, nhẹ nhàng. Sẽ quay lại tái khám.',
  'Chất lượng khám tốt, tuy nhiên thời gian chờ hơi lâu.',
  'Bác sĩ giỏi, có kinh nghiệm. Giải thích dễ hiểu cho bệnh nhân.',
  'Rất hài lòng với dịch vụ. Nhân viên lễ tân thân thiện.',
  'Bác sĩ chẩn đoán chính xác, kê đơn thuốc hiệu quả.',
  'Trang thiết bị hiện đại, quy trình khám nhanh gọn.',
  'Cảm ơn bác sĩ đã tư vấn nhiệt tình. Bệnh đã thuyên giảm rõ rệt.',
  'Bác sĩ rất chuyên nghiệp, lắng nghe bệnh nhân chu đáo.',
  'Phòng khám tiện nghi, sạch sẽ. Giá cả hợp lý.',
  'Đội ngũ y tá hỗ trợ tốt. Bác sĩ khám rất tỉ mỉ.',
  'Kết quả điều trị tốt hơn mong đợi. Rất biết ơn bác sĩ.',
  'Bác sĩ có chuyên môn cao, tay nghề giỏi. Rất đáng tin cậy.',
];

const bookingReasons = [
  'Đau đầu kéo dài 1 tuần', 'Đau khớp gối khi lên cầu thang', 'Ho khan kéo dài 2 tuần',
  'Mất ngủ, khó ngủ về đêm', 'Đau bụng vùng thượng vị', 'Đau lưng dưới kéo dài',
  'Chóng mặt, hoa mắt khi đứng dậy', 'Phát ban da, ngứa', 'Đau họng, sốt nhẹ',
  'Kiểm tra sức khỏe định kỳ', 'Tái khám theo lịch hẹn', 'Đau răng kéo dài',
  'Mỏi mắt, giảm thị lực', 'Khó thở khi vận động', 'Sốt cao liên tục 3 ngày',
  'Đau tai, ù tai', 'Tức ngực, khó chịu', 'Tiêu chảy kéo dài',
  'Trẻ biếng ăn, chậm tăng cân', 'Rối loạn kinh nguyệt',
];

// ══════════════ GENERATOR FUNCTIONS ══════════════
const commonImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function generateSpecialtyMarkdown(name) {
  const diseases = specialtyDiseases[name] || ['Bệnh lý chuyên khoa'];
  const diseaseMd = diseases.map(d => `- ${d}`).join('\\n');
  const diseaseHtml = diseases.map(d => `<li>${d}</li>`).join('');
  const md = `## Chuyên khoa ${name}\\n\\nChuyên khoa ${name} chẩn đoán và điều trị các bệnh lý liên quan.\\n\\n### Các bệnh thường gặp\\n${diseaseMd}\\n\\n### Khi nào cần đến khám?\\n- Có triệu chứng kéo dài trên 1 tuần\\n- Tái phát nhiều lần\\n- Ảnh hưởng đến sinh hoạt hàng ngày`;
  const html = `<h2>Chuyên khoa ${name}</h2><p>Chuyên khoa ${name} chẩn đoán và điều trị các bệnh lý liên quan.</p><h3>Các bệnh thường gặp</h3><ul>${diseaseHtml}</ul>`;
  return { md, html };
}

function generateClinicMarkdown(c) {
  const md = `## ${c.name}\\n\\n${c.name} là cơ sở y tế uy tín, chất lượng cao với đội ngũ bác sĩ giàu kinh nghiệm và trang thiết bị hiện đại.\\n\\n### Dịch vụ nổi bật\\n- Khám chuyên khoa\\n- Xét nghiệm tổng quát\\n- Chẩn đoán hình ảnh\\n- Điều trị nội - ngoại trú`;
  const html = `<h2>${c.name}</h2><p>${c.name} là cơ sở y tế uy tín, chất lượng cao.</p>`;
  return { md, html };
}

function generateRandomUser(index, roleId, usedEmails) {
  const isMale = Math.random() > 0.45;
  const gender = isMale ? 'G1' : 'G2';
  const lastName = pick(lastNames);
  const middleName = pick(isMale ? maleMiddleNames : femaleMiddleNames);
  const firstName = pick(isMale ? firstNamesMale : firstNamesFemale);
  const fullFirst = `${lastName} ${middleName}`;

  const prefix = roleId === 'R2' ? 'bs' : 'bn';
  const domain = roleId === 'R2' ? 'bookingcare.vn' : 'gmail.com';
  const cleanName = removeDiacritics(`${firstName}${index}`).toLowerCase().replace(/\s/g, '');
  let email = `${prefix}.${cleanName}@${domain}`;
  let attempt = 0;
  while (usedEmails.has(email)) {
    attempt++;
    email = `${prefix}.${cleanName}${attempt}@${domain}`;
  }
  usedEmails.add(email);

  const positionId = roleId === 'R2' ? pick(['P1', 'P2', 'P3', 'P4', 'P5']) : null;
  const phone = roleId === 'R2'
    ? `090${String(1000 + index).padStart(7, '0')}`
    : `091${String(2000 + index).padStart(7, '0')}`

  return {
    email, password: null, // will be set later
    firstName: fullFirst, lastName: firstName,
    roleId, gender, address: pick(addresses),
    phoneNumber: phone, positionId, image: null,
  };
}

function generateDoctorInfo(doctorId, idx, totalSpecialties, totalClinics) {
  const specialtyId = (idx % totalSpecialties) + 1;
  const clinicId = (idx % totalClinics) + 1;
  const priceId = pick(['PRI1', 'PRI2', 'PRI3', 'PRI4', 'PRI5', 'PRI6']);
  const provinceId = pick(['PRO1', 'PRO2', 'PRO3', 'PRO4', 'PRO5', 'PRO6']);
  const paymentId = pick(['PAY1', 'PAY2', 'PAY3']);
  const posMap = { P1: 'Bác sĩ', P2: 'Thạc sĩ', P3: 'Tiến sĩ', P4: 'Phó giáo sư', P5: 'Giáo sư' };
  const years = randInt(5, 35);
  const specName = specialtyNames[(specialtyId - 1) % specialtyNames.length];

  const description = `Bác sĩ có ${years} năm kinh nghiệm trong lĩnh vực ${specName}. Tận tâm, nhiệt tình với bệnh nhân.`;
  const contentMarkdown = `## Bác sĩ chuyên khoa ${specName}\\n\\n- ${years} năm kinh nghiệm\\n- Chuyên gia ${specName}\\n- Tốt nghiệp Đại học Y khoa`;
  const contentHTML = `<h2>Bác sĩ chuyên khoa ${specName}</h2><ul><li>${years} năm kinh nghiệm</li><li>Chuyên gia ${specName}</li></ul>`;
  const notes = ['Khám từ thứ 2 đến thứ 6', 'Khám sáng thứ 2, 4, 6', 'Nhận khám bảo hiểm', 'Khám chiều thứ 3, 5', '', 'Khám từ thứ 2 đến thứ 7'];

  return {
    doctorId, specialtyId, clinicId, priceId, provinceId, paymentId,
    contentHTML, contentMarkdown, description, note: pick(notes), count: randInt(0, 50),
  };
}

module.exports = {
  pick, randInt, shuffle, removeDiacritics, uuidv4,
  specialtyNames, clinicPool, reviewComments, bookingReasons,
  commonImageBase64,
  generateSpecialtyMarkdown, generateClinicMarkdown,
  generateRandomUser, generateDoctorInfo,
};
