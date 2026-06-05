// src/seeders/seedHelpers.js — Helper functions & data pools cho Super Seeder v4.0
// Phiên bản nâng cấp: Ảnh thực tế từ file (assets/), nội dung Markdown/HTML chuyên nghiệp
// Tương thích hoàn toàn với pipeline BLOB image (xem BLOB_Image_Fix_Report.md)

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════
// IMAGE FILE READER — Đọc ảnh từ thư mục assets/ và trả về base64
// ══════════════════════════════════════════════════════════════
const ASSETS_DIR = path.join(__dirname, 'assets');

/**
 * Đọc file ảnh từ thư mục assets/ và trả về chuỗi pure base64.
 * Tương thích với pipeline BLOB image (lưu pure base64, không có prefix).
 * @param {string} relativePath - Đường dẫn tương đối từ thư mục assets/
 * @returns {string} Pure base64 string
 */
function getImageBase64(relativePath) {
  const absolutePath = path.join(ASSETS_DIR, relativePath);
  if (fs.existsSync(absolutePath)) {
    return fs.readFileSync(absolutePath).toString('base64');
  }
  console.warn(`⚠️ Image not found: ${absolutePath}`);
  return '';
}

// ══════════════════════════════════════════════════════════════
// RANDOM UTILITIES
// ══════════════════════════════════════════════════════════════
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (arr) => [...arr].sort(() => 0.5 - Math.random());
const removeDiacritics = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// ══════════════════════════════════════════════════════════════
// NAME POOLS (Vietnamese) — Giữ nguyên từ bản gốc
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// SPECIALTY DATA — 15 chuyên khoa với mô tả chi tiết
// ══════════════════════════════════════════════════════════════
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

// Mô tả tổng quan cho từng chuyên khoa (dùng trong Markdown mở rộng)
const specialtyOverviews = {
  'Cơ xương khớp': 'Chuyên khoa Cơ xương khớp chẩn đoán và điều trị các bệnh lý về xương, khớp, cơ, dây chằng và mô mềm xung quanh. Đây là một trong những chuyên khoa quan trọng nhất, đặc biệt với người cao tuổi và người lao động nặng.',
  'Thần kinh': 'Chuyên khoa Thần kinh chuyên chẩn đoán và điều trị các rối loạn của hệ thần kinh trung ương và ngoại biên, bao gồm não, tủy sống, dây thần kinh và cơ. Bác sĩ thần kinh được đào tạo chuyên sâu để xử lý các bệnh lý phức tạp.',
  'Tim mạch': 'Chuyên khoa Tim mạch chuyên chẩn đoán, điều trị và phòng ngừa các bệnh lý liên quan đến tim và hệ mạch máu. Đây là chuyên khoa then chốt trong việc bảo vệ sức khỏe, do bệnh tim mạch là nguyên nhân tử vong hàng đầu thế giới.',
  'Tai Mũi Họng': 'Chuyên khoa Tai Mũi Họng (TMH) chuyên khám và điều trị các bệnh lý vùng tai, mũi, xoang, họng, thanh quản và các cấu trúc liên quan vùng đầu cổ. Bác sĩ TMH có thể thực hiện cả điều trị nội khoa lẫn phẫu thuật.',
  'Da liễu': 'Chuyên khoa Da liễu chuyên chẩn đoán và điều trị các bệnh lý về da, tóc, móng và niêm mạc. Từ các vấn đề thường gặp như mụn trứng cá đến các bệnh lý phức tạp như vẩy nến, lupus ban đỏ, bác sĩ da liễu sẽ giúp bạn tìm giải pháp.',
  'Tiêu hóa': 'Chuyên khoa Tiêu hóa chẩn đoán và điều trị các bệnh lý của hệ tiêu hóa, bao gồm thực quản, dạ dày, ruột non, đại tràng, gan, mật và tụy. Nội soi tiêu hóa là phương pháp chẩn đoán hiện đại được sử dụng rộng rãi.',
  'Nhi khoa': 'Chuyên khoa Nhi chuyên chăm sóc sức khỏe cho trẻ em từ sơ sinh đến 16 tuổi. Bác sĩ Nhi khoa được đào tạo đặc biệt để hiểu đặc thù sinh lý trẻ em, giúp chẩn đoán chính xác và điều trị an toàn cho các bé.',
  'Mắt': 'Chuyên khoa Mắt (Nhãn khoa) chuyên chẩn đoán và điều trị các bệnh lý về mắt và thị giác. Với sự phát triển của công nghệ, nhiều phương pháp phẫu thuật hiện đại như LASIK, phaco đã mang lại ánh sáng cho hàng triệu bệnh nhân.',
  'Răng Hàm Mặt': 'Chuyên khoa Răng Hàm Mặt chuyên chẩn đoán, điều trị các bệnh lý về răng, nướu, xương hàm và các cấu trúc vùng mặt. Từ nha khoa tổng quát đến chỉnh nha, implant, bác sĩ RHM giúp bạn có nụ cười tự tin.',
  'Sản phụ khoa': 'Chuyên khoa Sản phụ khoa chuyên chăm sóc sức khỏe sinh sản cho phụ nữ, bao gồm theo dõi thai kỳ, sinh nở, và điều trị các bệnh lý phụ khoa. Bác sĩ sản phụ khoa đồng hành cùng phụ nữ trong mọi giai đoạn cuộc đời.',
  'Hô hấp': 'Chuyên khoa Hô hấp chuyên chẩn đoán và điều trị các bệnh lý đường hô hấp, từ nhiễm trùng thông thường đến các bệnh mãn tính như hen suyễn, COPD, và ung thư phổi. Đo chức năng hô hấp là phương tiện chẩn đoán không thể thiếu.',
  'Nội tiết': 'Chuyên khoa Nội tiết chuyên chẩn đoán và điều trị các rối loạn về hormone và các tuyến nội tiết, bao gồm đái tháo đường, bệnh tuyến giáp, rối loạn chuyển hóa. Đây là chuyên khoa ngày càng quan trọng trong xã hội hiện đại.',
  'Thận - Tiết niệu': 'Chuyên khoa Thận - Tiết niệu chuyên chẩn đoán và điều trị các bệnh lý về thận, bàng quang, niệu quản, niệu đạo và tuyến tiền liệt. Bác sĩ chuyên khoa có thể thực hiện cả điều trị nội khoa lẫn phẫu thuật nội soi.',
  'Ung bướu': 'Chuyên khoa Ung bướu chuyên chẩn đoán, điều trị và theo dõi các loại ung thư. Với sự tiến bộ của y học hiện đại, nhiều loại ung thư có thể chữa khỏi nếu được phát hiện sớm và điều trị đúng phác đồ.',
  'Tâm thần': 'Chuyên khoa Tâm thần chuyên chẩn đoán và điều trị các rối loạn tâm thần và sức khỏe tâm lý, bao gồm trầm cảm, lo âu, rối loạn giấc ngủ. Bác sĩ tâm thần kết hợp thuốc và liệu pháp tâm lý để giúp bệnh nhân hồi phục.',
};

const specialtyEquipment = {
  'Cơ xương khớp': ['Máy chụp X-quang kỹ thuật số', 'Máy MRI 1.5 Tesla', 'Máy đo mật độ xương DEXA', 'Máy siêu âm khớp'],
  'Thần kinh': ['Máy điện não đồ (EEG)', 'Máy CT Scanner 128 lát cắt', 'Máy MRI 3.0 Tesla', 'Máy đo dẫn truyền thần kinh'],
  'Tim mạch': ['Máy siêu âm tim Doppler', 'Máy Holter ECG 24h', 'Hệ thống chụp mạch vành DSA', 'Máy đo huyết áp liên tục ABPM'],
  'Tai Mũi Họng': ['Máy nội soi TMH Karl Storz', 'Máy đo thính lực', 'Máy đo nhĩ lượng', 'Kính hiển vi phẫu thuật'],
  'Da liễu': ['Đèn Wood chẩn đoán', 'Máy laser CO2 Fractional', 'Máy Dermoscopy kỹ thuật số', 'Máy sinh thiết da'],
  'Tiêu hóa': ['Máy nội soi tiêu hóa Olympus', 'Máy siêu âm bụng', 'Máy CT ổ bụng', 'Máy đo pH thực quản 24h'],
  'Nhi khoa': ['Lồng ấp sơ sinh', 'Máy theo dõi monitor', 'Máy thở nhi khoa', 'Hệ thống hút đờm vô trùng'],
  'Mắt': ['Máy đo khúc xạ tự động', 'Kính hiển vi đèn khe', 'Máy đo nhãn áp', 'Máy OCT võng mạc'],
  'Răng Hàm Mặt': ['Máy chụp X-quang panorama', 'Máy CBCT 3D', 'Ghế nha khoa Sirona', 'Máy cạo vôi siêu âm Piezo'],
  'Sản phụ khoa': ['Máy siêu âm 4D', 'Máy theo dõi tim thai (CTG)', 'Hệ thống nội soi phụ khoa', 'Máy soi cổ tử cung'],
  'Hô hấp': ['Máy đo chức năng hô hấp', 'Máy nội soi phế quản', 'Hệ thống CPAP/BiPAP', 'Máy CT lồng ngực'],
  'Nội tiết': ['Máy xét nghiệm hormone tự động', 'Máy siêu âm tuyến giáp', 'Máy đo đường huyết liên tục (CGM)', 'Máy DEXA đo thành phần cơ thể'],
  'Thận - Tiết niệu': ['Máy lọc máu nhân tạo', 'Máy tán sỏi ngoài cơ thể (ESWL)', 'Hệ thống nội soi tiết niệu', 'Máy siêu âm thận'],
  'Ung bướu': ['Máy xạ trị LINAC', 'Máy PET/CT', 'Hệ thống hóa trị tự động', 'Máy sinh thiết kim nhỏ dưới siêu âm'],
  'Tâm thần': ['Phòng tư vấn tâm lý cách âm', 'Bộ trắc nghiệm tâm lý chuẩn hóa', 'Máy kích thích từ xuyên sọ (TMS)', 'Hệ thống theo dõi giấc ngủ'],
};

// ══════════════════════════════════════════════════════════════
// CLINIC DATA — 10 cơ sở y tế với mô tả chi tiết
// ══════════════════════════════════════════════════════════════
const clinicPool = [
  { name: 'Bệnh viện Chợ Rẫy', address: '201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP.HCM', year: 1900, beds: 1800, desc: 'Bệnh viện Chợ Rẫy là bệnh viện đa khoa hạng đặc biệt, lớn nhất khu vực phía Nam Việt Nam. Với lịch sử hơn 120 năm hình thành và phát triển, bệnh viện là địa chỉ tin cậy hàng đầu trong khám chữa bệnh, đào tạo và nghiên cứu khoa học y khoa.' },
  { name: 'Bệnh viện Bạch Mai', address: '78 Giải Phóng, Phương Mai, Đống Đa, Hà Nội', year: 1911, beds: 2500, desc: 'Bệnh viện Bạch Mai là bệnh viện đa khoa trung ương hạng đặc biệt, tuyến cuối về chuyên môn kỹ thuật của cả nước. Bệnh viện nổi tiếng với đội ngũ giáo sư, tiến sĩ hàng đầu và các trung tâm chuyên sâu về tim mạch, ung bướu, thần kinh.' },
  { name: 'Bệnh viện Đại học Y Dược TP.HCM', address: '215 Hồng Bàng, Phường 11, Quận 5, TP.HCM', year: 1956, beds: 1200, desc: 'Bệnh viện Đại học Y Dược TP.HCM là bệnh viện thực hành của trường Đại học Y Dược TP.HCM — trường đào tạo y khoa hàng đầu phía Nam. Bệnh viện kết hợp chặt chẽ giữa điều trị, đào tạo và nghiên cứu khoa học.' },
  { name: 'Bệnh viện Việt Đức', address: '40 Tràng Thi, Hàng Bông, Hoàn Kiếm, Hà Nội', year: 1902, beds: 1600, desc: 'Bệnh viện Hữu nghị Việt Đức là trung tâm ngoại khoa lớn nhất Việt Nam, chuyên tiếp nhận và xử lý các ca phẫu thuật phức tạp nhất. Bệnh viện tiên phong trong ghép tạng, phẫu thuật tim hở và phẫu thuật nội soi.' },
  { name: 'Phòng khám Đa khoa Quốc tế Vinmec', address: '458 Minh Khai, Hai Bà Trưng, Hà Nội', year: 2012, beds: 600, desc: 'Vinmec là hệ thống y tế quốc tế thuộc Tập đoàn Vingroup, với tiêu chuẩn JCI quốc tế. Vinmec sở hữu trang thiết bị y tế hiện đại bậc nhất Đông Nam Á và đội ngũ bác sĩ trong nước, quốc tế giàu kinh nghiệm.' },
  { name: 'Bệnh viện FV', address: '6 Nguyễn Lương Bằng, Phú Mỹ Hưng, Quận 7, TP.HCM', year: 2003, beds: 220, desc: 'Bệnh viện Pháp Việt (FV Hospital) là bệnh viện quốc tế đạt chứng nhận JCI, được xây dựng và quản lý theo tiêu chuẩn Pháp. Bệnh viện nổi tiếng với chất lượng dịch vụ 5 sao và đội ngũ bác sĩ đa quốc gia.' },
  { name: 'Nha khoa Paris', address: '12 Thái Hà, Đống Đa, Hà Nội', year: 2010, beds: 0, desc: 'Nha khoa Paris là chuỗi phòng khám nha khoa hàng đầu Việt Nam, ứng dụng công nghệ nha khoa tiên tiến từ Pháp. Chuyên về chỉnh nha, implant, bọc răng sứ thẩm mỹ với cam kết bảo hành dài hạn.' },
  { name: 'Bệnh viện Từ Dũ', address: '284 Cống Quỳnh, Phạm Ngũ Lão, Quận 1, TP.HCM', year: 1923, beds: 1500, desc: 'Bệnh viện Từ Dũ là bệnh viện chuyên khoa Sản phụ khoa lớn nhất cả nước, hàng năm đón hơn 60.000 ca sinh. Bệnh viện là tuyến cuối về sản phụ khoa khu vực phía Nam, tiên phong trong thụ tinh ống nghiệm (IVF).' },
  { name: 'Bệnh viện Trung ương Huế', address: '16 Lê Lợi, Vĩnh Ninh, TP Huế', year: 1894, beds: 2200, desc: 'Bệnh viện Trung ương Huế là bệnh viện đa khoa hạng đặc biệt, tuyến cuối khu vực miền Trung - Tây Nguyên. Bệnh viện có truyền thống lâu đời, gắn liền với lịch sử y khoa Việt Nam hơn 130 năm.' },
  { name: 'Bệnh viện Đà Nẵng', address: '124 Hải Phòng, Thạch Thang, Hải Châu, Đà Nẵng', year: 1976, beds: 1700, desc: 'Bệnh viện Đà Nẵng là bệnh viện đa khoa hạng I, trung tâm y tế lớn nhất thành phố Đà Nẵng. Bệnh viện được đầu tư mạnh về hạ tầng và nhân lực, là điểm tựa tin cậy cho người dân miền Trung.' },
];

// ══════════════════════════════════════════════════════════════
// REVIEW & BOOKING DATA — Giữ nguyên từ bản gốc
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// DOCTOR DATA POOLS — Trường ĐH, chứng chỉ, thành tích
// ══════════════════════════════════════════════════════════════
const universities = [
  'Đại học Y Hà Nội', 'Đại học Y Dược TP.HCM', 'Đại học Y Dược Huế',
  'Đại học Y khoa Phạm Ngọc Thạch', 'Đại học Y Dược Cần Thơ', 'Học viện Quân Y',
  'Đại học Y Hải Phòng', 'Đại học Y Dược Thái Bình',
];

const certifications = [
  'Chứng chỉ hành nghề khám chữa bệnh do Bộ Y tế cấp',
  'Chứng nhận đào tạo liên tục (CME) cập nhật hàng năm',
  'Chứng chỉ phẫu thuật nội soi nâng cao',
  'Bằng Chuyên khoa I tại Đại học Y Hà Nội',
  'Bằng Chuyên khoa II tại Đại học Y Dược TP.HCM',
  'Chứng nhận đào tạo tại Singapore General Hospital',
  'Chứng chỉ siêu âm tim nâng cao (ASE)',
  'Chứng nhận nghiên cứu sinh tại Nhật Bản (JICA)',
  'Chứng chỉ quản lý bệnh viện (GAVI)',
  'Thành viên Hội Y học Việt Nam',
];

const achievements = [
  'Giải thưởng Bác sĩ trẻ xuất sắc',
  'Đăng tải 5 bài nghiên cứu trên tạp chí y khoa quốc tế',
  'Tham gia đào tạo cho hơn 200 bác sĩ tuyến dưới',
  'Hoàn thành khóa đào tạo chuyên sâu tại Pháp',
  'Nhận bằng khen của Bộ trưởng Bộ Y tế',
  'Tham gia nhiều hội nghị y khoa quốc tế tại châu Âu và châu Á',
  'Đồng tác giả sách chuyên khảo y học',
  'Giải nhất nghiên cứu khoa học cấp bệnh viện',
  'Hoàn thành fellowship tại Hàn Quốc',
  'Kinh nghiệm hợp tác quốc tế với WHO và UNICEF',
];

const previousWorkplaces = [
  'Nguyên Phó khoa Khám bệnh — Bệnh viện Bạch Mai',
  'Nguyên bác sĩ điều trị — Bệnh viện Chợ Rẫy',
  'Nguyên Trưởng khoa — Bệnh viện Đại học Y Dược TP.HCM',
  'Nguyên bác sĩ nội trú — Bệnh viện Việt Đức',
  'Bác sĩ chuyên khoa tại Bệnh viện 108',
  'Giảng viên Đại học Y Hà Nội',
  'Bác sĩ tình nguyện tại vùng sâu vùng xa',
  'Bác sĩ nghiên cứu tại Viện Pasteur',
  'Nguyên Phó Giám đốc — Bệnh viện quận',
  'Bác sĩ thường trú tại Bệnh viện Trung ương Huế',
];

// ══════════════════════════════════════════════════════════════
// GENERATOR FUNCTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Sinh nội dung Markdown & HTML chi tiết cho chuyên khoa
 */
function generateSpecialtyMarkdown(name) {
  const diseases = specialtyDiseases[name] || ['Bệnh lý chuyên khoa'];
  const overview = specialtyOverviews[name] || `Chuyên khoa ${name} chẩn đoán và điều trị các bệnh lý liên quan.`;
  const equipment = specialtyEquipment[name] || ['Trang thiết bị y tế hiện đại'];

  const diseaseMd = diseases.map(d => `- ${d}`).join('\n');
  const diseaseHtml = diseases.map(d => `<li>${d}</li>`).join('');
  const equipMd = equipment.map(e => `- ${e}`).join('\n');
  const equipHtml = equipment.map(e => `<li>${e}</li>`).join('');

  const md = `## Chuyên khoa ${name}\n\n${overview}\n\n### Các bệnh lý thường gặp\n${diseaseMd}\n\n### Quy trình khám bệnh\n1. **Tiếp nhận và phân loại**: Đăng ký, khai báo thông tin sức khỏe, đo các chỉ số sinh hiệu cơ bản\n2. **Khám lâm sàng**: Bác sĩ chuyên khoa thăm khám trực tiếp, hỏi bệnh sử chi tiết\n3. **Chỉ định cận lâm sàng**: Xét nghiệm máu, chẩn đoán hình ảnh (X-quang, siêu âm, CT, MRI) nếu cần\n4. **Chẩn đoán và điều trị**: Kết luận bệnh, tư vấn phương án điều trị, kê đơn thuốc hoặc chỉ định thủ thuật\n\n### Khi nào bạn nên đến khám?\n- Có triệu chứng kéo dài trên 1 tuần không cải thiện\n- Triệu chứng tái phát nhiều lần\n- Ảnh hưởng nghiêm trọng đến sinh hoạt và công việc hàng ngày\n- Có tiền sử gia đình mắc bệnh liên quan\n- Cần kiểm tra sức khỏe định kỳ\n\n### Trang thiết bị hiện đại\n${equipMd}`;

  const html = `<h2>Chuyên khoa ${name}</h2><p>${overview}</p><h3>Các bệnh lý thường gặp</h3><ul>${diseaseHtml}</ul><h3>Quy trình khám bệnh</h3><ol><li><strong>Tiếp nhận và phân loại</strong>: Đăng ký, khai báo thông tin sức khỏe, đo các chỉ số sinh hiệu cơ bản</li><li><strong>Khám lâm sàng</strong>: Bác sĩ chuyên khoa thăm khám trực tiếp, hỏi bệnh sử chi tiết</li><li><strong>Chỉ định cận lâm sàng</strong>: Xét nghiệm, chẩn đoán hình ảnh nếu cần</li><li><strong>Chẩn đoán và điều trị</strong>: Kết luận bệnh, tư vấn phương án điều trị</li></ol><h3>Khi nào bạn nên đến khám?</h3><ul><li>Có triệu chứng kéo dài trên 1 tuần</li><li>Tái phát nhiều lần</li><li>Ảnh hưởng đến sinh hoạt hàng ngày</li></ul><h3>Trang thiết bị hiện đại</h3><ul>${equipHtml}</ul>`;

  return { md, html };
}

/**
 * Sinh nội dung Markdown & HTML chi tiết cho phòng khám/bệnh viện
 */
function generateClinicMarkdown(c) {
  const historyYears = new Date().getFullYear() - c.year;
  const bedInfo = c.beds > 0 ? `, quy mô ${c.beds} giường bệnh` : '';
  const insuranceInfo = c.beds > 0
    ? '- Chấp nhận bảo hiểm y tế nhà nước (BHYT)\n- Liên kết với hơn 20 công ty bảo hiểm tư nhân (Bảo Việt, PVI, Liberty, Manulife...)\n- Hỗ trợ thanh toán trực tiếp, không cần ứng trước chi phí'
    : '- Chấp nhận thanh toán tiền mặt và chuyển khoản\n- Liên kết với nhiều công ty bảo hiểm tư nhân\n- Chính sách bảo hành điều trị dài hạn';

  const md = `## ${c.name}\n\n${c.desc}\n\n### Thông tin chung\n- **Năm thành lập**: ${c.year} (hơn ${historyYears} năm hoạt động)\n- **Địa chỉ**: ${c.address}${bedInfo}\n\n### Dịch vụ nổi bật\n- Khám chuyên khoa sâu với bác sĩ đầu ngành\n- Xét nghiệm tổng quát và chuyên sâu\n- Chẩn đoán hình ảnh hiện đại (CT, MRI, siêu âm 4D)\n- Điều trị nội trú và ngoại trú\n- Phẫu thuật chuyên khoa và phẫu thuật nội soi\n\n### Bảo hiểm y tế\n${insuranceInfo}\n\n### Hướng dẫn đi khám\n1. **Đặt lịch hẹn** qua BookingCare để được ưu tiên khám\n2. **Đến trước giờ hẹn 15 phút** để làm thủ tục tiếp nhận\n3. **Mang theo giấy tờ**: CMND/CCCD, thẻ BHYT (nếu có), kết quả xét nghiệm cũ (nếu có)\n4. **Sau khám**: Nhận kết quả, đơn thuốc và lịch tái khám tại quầy`;

  const html = `<h2>${c.name}</h2><p>${c.desc}</p><h3>Thông tin chung</h3><ul><li><strong>Năm thành lập</strong>: ${c.year} (hơn ${historyYears} năm hoạt động)</li><li><strong>Địa chỉ</strong>: ${c.address}${bedInfo}</li></ul><h3>Dịch vụ nổi bật</h3><ul><li>Khám chuyên khoa sâu với bác sĩ đầu ngành</li><li>Xét nghiệm tổng quát và chuyên sâu</li><li>Chẩn đoán hình ảnh hiện đại</li><li>Điều trị nội trú và ngoại trú</li><li>Phẫu thuật chuyên khoa</li></ul>`;

  return { md, html };
}

/**
 * Sinh user ngẫu nhiên VỚI ảnh avatar theo giới tính
 * v3.0: Gán avatar PNG thật từ imageGenerator thay vì null
 */
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
    : `091${String(2000 + index).padStart(7, '0')}`;

  // ✅ [v4.0] Đọc avatar từ file ảnh thực tế trong assets/avatars/
  const genderPrefix = gender === 'G1' ? 'male' : 'female';
  const variantNum = (index % 5) + 1;
  const avatarBase64 = getImageBase64(`avatars/${genderPrefix}_${variantNum}.jpg`);

  return {
    email, password: null, // sẽ được gán sau bởi seedAllcode.js
    firstName: fullFirst, lastName: firstName,
    roleId, gender, address: pick(addresses),
    phoneNumber: phone, positionId,
    image: avatarBase64, // ✅ Ảnh thực tế từ file, lưu dạng base64 thô (không prefix)
  };
}

/**
 * Sinh Doctor_Info với mô tả kinh nghiệm phong phú
 * v3.0: Tiểu sử bác sĩ chi tiết (ĐH, chứng chỉ, thành tích)
 */
function generateDoctorInfo(doctorId, idx, totalSpecialties, totalClinics) {
  const specialtyId = (idx % totalSpecialties) + 1;
  const clinicId = (idx % totalClinics) + 1;
  const priceId = pick(['PRI1', 'PRI2', 'PRI3', 'PRI4', 'PRI5', 'PRI6']);
  const provinceId = pick(['PRO1', 'PRO2', 'PRO3', 'PRO4', 'PRO5', 'PRO6']);
  const paymentId = pick(['PAY1', 'PAY2', 'PAY3']);

  const years = randInt(5, 35);
  const specName = specialtyNames[(specialtyId - 1) % specialtyNames.length];
  const uni = pick(universities);
  const gradYear = new Date().getFullYear() - years - randInt(0, 3);
  const cert1 = certifications[idx % certifications.length];
  const cert2 = certifications[(idx + 3) % certifications.length];
  const achv = achievements[idx % achievements.length];
  const prevWork = previousWorkplaces[idx % previousWorkplaces.length];

  const description = `Bác sĩ có ${years} năm kinh nghiệm trong lĩnh vực ${specName}. Tốt nghiệp ${uni}. Tận tâm, nhiệt tình và luôn đặt lợi ích của bệnh nhân lên hàng đầu.`;

  const contentMarkdown = `## Bác sĩ chuyên khoa ${specName}\n\n### Quá trình đào tạo\n- Tốt nghiệp Bác sĩ Đa khoa — ${uni} (${gradYear})\n- Chuyên khoa I ${specName} — ${pick(universities)} (${gradYear + randInt(2, 4)})\n- ${cert1}\n- ${cert2}\n\n### Kinh nghiệm chuyên môn\n- ${years} năm kinh nghiệm trong lĩnh vực ${specName}\n- ${prevWork}\n- Đã điều trị thành công hơn ${randInt(500, 5000)} ca bệnh\n\n### Thành tích nổi bật\n- ${achv}\n- Thành viên Hội ${specName} Việt Nam`;

  const contentHTML = `<h2>Bác sĩ chuyên khoa ${specName}</h2><h3>Quá trình đào tạo</h3><ul><li>Tốt nghiệp Bác sĩ Đa khoa — ${uni} (${gradYear})</li><li>Chuyên khoa I ${specName}</li><li>${cert1}</li></ul><h3>Kinh nghiệm chuyên môn</h3><ul><li>${years} năm kinh nghiệm trong lĩnh vực ${specName}</li><li>${prevWork}</li></ul><h3>Thành tích nổi bật</h3><ul><li>${achv}</li></ul>`;

  const notes = [
    'Khám từ thứ 2 đến thứ 6. Vui lòng đặt lịch trước.',
    'Khám sáng thứ 2, 4, 6. Chiều thứ 3, 5.',
    'Nhận khám bảo hiểm y tế. Mang theo thẻ BHYT.',
    'Khám chiều thứ 3, 5. Sáng thứ 7.',
    'Khám từ thứ 2 đến thứ 7. Nghỉ Chủ nhật.',
    'Ưu tiên bệnh nhân đặt lịch trước qua BookingCare.',
  ];

  return {
    doctorId, specialtyId, clinicId, priceId, provinceId, paymentId,
    contentHTML, contentMarkdown, description, note: pick(notes), count: randInt(0, 50),
  };
}

// Mapping index → tên file ảnh chuyên khoa
const SPECIALTY_FILES = [
  '0_co_xuong_khop.png', '1_than_kinh.png', '2_tim_mach.png',
  '3_tai_mui_hong.png', '4_da_lieu.png', '5_tieu_hoa.png',
  '6_nhi_khoa.png', '7_mat.png', '8_rang_ham_mat.png',
  '9_san_phu_khoa.png', '10_ho_hap.png', '11_noi_tiet.png',
  '12_than_tiet_nieu.png', '13_ung_buou.png', '14_tam_than.png',
];

// Mapping index → tên file ảnh phòng khám
const CLINIC_FILES = [
  '0_cho_ray.png', '1_bach_mai.png', '2_y_duoc_tphcm.png',
  '3_viet_duc.png', '4_vinmec.png', '5_fv.png',
  '6_nha_khoa_paris.png', '7_tu_du.png', '8_tw_hue.png',
  '9_da_nang.png',
];

/**
 * Đọc ảnh base64 cho chuyên khoa (theo index).
 * v4.0: Đọc từ file ảnh thực tế trong assets/specialties/
 */
function generateSpecialtyImageBase64(index) {
  const filename = SPECIALTY_FILES[index % SPECIALTY_FILES.length];
  return getImageBase64(`specialties/${filename}`);
}

/**
 * Đọc ảnh base64 cho phòng khám (theo index).
 * v4.0: Đọc từ file ảnh thực tế trong assets/clinics/
 */
function generateClinicImageBase64(index) {
  const filename = CLINIC_FILES[index % CLINIC_FILES.length];
  return getImageBase64(`clinics/${filename}`);
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  pick, randInt, shuffle, removeDiacritics, uuidv4,
  specialtyNames, clinicPool, reviewComments, bookingReasons,
  generateSpecialtyMarkdown, generateClinicMarkdown,
  generateRandomUser, generateDoctorInfo,
  generateSpecialtyImageBase64, generateClinicImageBase64,
};
