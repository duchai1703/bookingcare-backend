// bookingcare-backend/scripts/sync-clinical-assistant-schema.js
// Tạo bảng và seed dữ liệu chuẩn hóa cho Bộ công cụ gợi ý thông minh lâm sàng (ICD-10, Triệu chứng, Snippets)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models');

const INITIAL_ICD10_DATA = [
  // --- Cơ xương khớp (Specialty: Cơ xương khớp) ---
  {
    code: 'M17',
    nameVi: 'Thoái hóa khớp gối (Gonarthrosis)',
    nameEn: 'Gonarthrosis (arthrosis of knee)',
    synonyms: 'thoai hoa khop goi, viem khop goi, gonarthrosis, OA knee, thoái hoá gối',
    chapter: 'XIII',
    commonRank: 100,
  },
  {
    code: 'M17.0',
    nameVi: 'Thoái hóa khớp gối nguyên phát hai bên',
    nameEn: 'Primary gonarthrosis, bilateral',
    synonyms: 'thoai hoa khop goi hai ben, primary bilateral gonarthrosis',
    chapter: 'XIII',
    commonRank: 85,
  },
  {
    code: 'M17.1',
    nameVi: 'Thoái hóa khớp gối nguyên phát khác (một bên)',
    nameEn: 'Other primary gonarthrosis',
    synonyms: 'thoai hoa khop goi mot ben, gonarthrosis unilateral',
    chapter: 'XIII',
    commonRank: 80,
  },
  {
    code: 'M25.5',
    nameVi: 'Đau khớp không đặc hiệu',
    nameEn: 'Pain in joint',
    synonyms: 'dau khop, dau khop khong ro nguyen nhan, arthralgia, joint pain',
    chapter: 'XIII',
    commonRank: 95,
  },
  {
    code: 'M54.5',
    nameVi: 'Đau lưng vùng thắt lưng (Low back pain)',
    nameEn: 'Low back pain',
    synonyms: 'dau lung, dau that lung, LBP, dau cot song that lung, lumbalgia',
    chapter: 'XIII',
    commonRank: 98,
  },
  {
    code: 'M50',
    nameVi: 'Bệnh lý đĩa đệm cột sống cổ',
    nameEn: 'Cervical disc disorders',
    synonyms: 'thoat vi dia dem co, benh dia dem co, cervical disc herniation',
    chapter: 'XIII',
    commonRank: 88,
  },
  {
    code: 'M51.2',
    nameVi: 'Thoát vị đĩa đệm cột sống thắt lưng',
    nameEn: 'Other specified intervertebral disc displacement',
    synonyms: 'thoat vi dia dem lung, TVDD that lung, lumbar disc herniation, sciatica',
    chapter: 'XIII',
    commonRank: 92,
  },
  {
    code: 'M19',
    nameVi: 'Viêm xương khớp khác (Thoái hóa khớp khác)',
    nameEn: 'Other and unspecified osteoarthritis',
    synonyms: 'viem xuong khop, thoai hoa khop ngoai vi, osteoarthritis other',
    chapter: 'XIII',
    commonRank: 75,
  },
  {
    code: 'M75',
    nameVi: 'Tổn thương vai (Viêm quanh khớp vai)',
    nameEn: 'Shoulder lesions',
    synonyms: 'viem quanh khop vai, dau vai, viem gan co tren gai, frozen shoulder',
    chapter: 'XIII',
    commonRank: 86,
  },
  {
    code: 'M10',
    nameVi: 'Bệnh Gút (Gout)',
    nameEn: 'Gout',
    synonyms: 'benh gut, viem khop gout, tang acid uric mau, gouty arthritis',
    chapter: 'XIII',
    commonRank: 90,
  },
  {
    code: 'M06.9',
    nameVi: 'Viêm khớp dạng thấp, không đặc hiệu',
    nameEn: 'Rheumatoid arthritis, unspecified',
    synonyms: 'viem khop dang thap, VKDT, rheumatoid arthritis, RA',
    chapter: 'XIII',
    commonRank: 85,
  },
  {
    code: 'M81',
    nameVi: 'Loãng xương không có gãy xương bệnh lý',
    nameEn: 'Osteoporosis without pathological fracture',
    synonyms: 'loang xuong, giam mat do xuong, osteoporosis',
    chapter: 'XIII',
    commonRank: 87,
  },

  // --- Tim mạch ---
  {
    code: 'I10',
    nameVi: 'Tăng huyết áp vô căn (nguyên phát)',
    nameEn: 'Essential (primary) hypertension',
    synonyms: 'tang huyet ap, THA, cao huyet ap, hypertension, HTN',
    chapter: 'IX',
    commonRank: 99,
  },
  {
    code: 'I20',
    nameVi: 'Cơn đau thắt ngực (Angina pectoris)',
    nameEn: 'Angina pectoris',
    synonyms: 'con dau that nguc, thieu mau co tim, ischemic heart disease',
    chapter: 'IX',
    commonRank: 89,
  },
  {
    code: 'I25.1',
    nameVi: 'Bệnh xơ vữa mạch vành tim',
    nameEn: 'Atherosclerotic heart disease',
    synonyms: 'benh mach vanh, xo vua dong mach vanh, CAD',
    chapter: 'IX',
    commonRank: 84,
  },

  // --- Hô hấp ---
  {
    code: 'J00',
    nameVi: 'Viêm mũi họng cấp (Cảm lạnh thông thường)',
    nameEn: 'Acute nasopharyngitis [common cold]',
    synonyms: 'cam lanh, viem mui hong cap, so mui, common cold',
    chapter: 'X',
    commonRank: 95,
  },
  {
    code: 'J02',
    nameVi: 'Viêm họng cấp',
    nameEn: 'Acute pharyngitis',
    synonyms: 'viem hong, dau hong, acute pharyngitis',
    chapter: 'X',
    commonRank: 94,
  },
  {
    code: 'J20',
    nameVi: 'Viêm phế quản cấp',
    nameEn: 'Acute bronchitis',
    synonyms: 'viem phe quan, ho co dom, acute bronchitis',
    chapter: 'X',
    commonRank: 90,
  },
  {
    code: 'J45',
    nameVi: 'Hen phế quản (Suyễn)',
    nameEn: 'Asthma',
    synonyms: 'hen phe quan, hen suyen, con kho tho rít, bronchial asthma',
    chapter: 'X',
    commonRank: 87,
  },

  // --- Tiêu hóa & Nội tiết ---
  {
    code: 'K29.7',
    nameVi: 'Viêm dạ dày, không đặc hiệu',
    nameEn: 'Gastritis, unspecified',
    synonyms: 'viem da day, dau da day, dau thuong vi, gastritis',
    chapter: 'XI',
    commonRank: 96,
  },
  {
    code: 'K21.0',
    nameVi: 'Bệnh trào ngược dạ dày - thực quản có viêm thực quản (GERD)',
    nameEn: 'Gastro-esophageal reflux disease with oesophagitis',
    synonyms: 'trao nguoc da day thuc quan, GERD, o nong, o chua',
    chapter: 'XI',
    commonRank: 93,
  },
  {
    code: 'E11',
    nameVi: 'Đái tháo đường týp 2 (Type 2 Diabetes Mellitus)',
    nameEn: 'Type 2 diabetes mellitus',
    synonyms: 'tieu duong type 2, dai thao duong typ 2, T2D, T2DM',
    chapter: 'IV',
    commonRank: 98,
  },
  {
    code: 'E78.5',
    nameVi: 'Tăng lipid máu, không đặc hiệu (Rối loạn mỡ máu)',
    nameEn: 'Hyperlipidaemia, unspecified',
    synonyms: 'roi loan mo mau, tang cholesterol, roi loan lipid mau, dyslipidemia',
    chapter: 'IV',
    commonRank: 94,
  },
];

const INITIAL_SYMPTOMS_DATA = [
  // Khớp gối & Chi dưới
  {
    nameVi: 'Đau khớp gối',
    nameEn: 'Knee joint pain',
    synonyms: 'dau dau goi, dau nhuc dau goi, dau moi khop goi',
    bodyPart: 'Khớp gối',
    suggestedIcdCodes: 'M17,M17.0,M25.5',
  },
  {
    nameVi: 'Cứng khớp buổi sáng',
    nameEn: 'Morning stiffness in joints',
    synonyms: 'cung khop buoi sang, kho co duoi khop sau khi ngu day',
    bodyPart: 'Khớp gối',
    suggestedIcdCodes: 'M17,M06.9',
  },
  {
    nameVi: 'Tiếng lạo xạo khi vận động khớp gối (Crepitus)',
    nameEn: 'Joint crepitus',
    synonyms: 'tieng keu luc cuc, tieng keu lao xao dau goi khi di lai',
    bodyPart: 'Khớp gối',
    suggestedIcdCodes: 'M17,M17.1',
  },
  {
    nameVi: 'Sưng nề nóng đỏ quanh khớp',
    nameEn: 'Joint swelling and erythema',
    synonyms: 'sung khop, khop sung to, tran dich khop',
    bodyPart: 'Khớp gối',
    suggestedIcdCodes: 'M10,M06.9,M17',
  },
  // Cột sống & Thắt lưng
  {
    nameVi: 'Đau thắt lưng âm ỉ',
    nameEn: 'Dull lower back pain',
    synonyms: 'dau lung, moi lung, dau vung eo that lung',
    bodyPart: 'Cột sống thắt lưng',
    suggestedIcdCodes: 'M54.5,M51.2',
  },
  {
    nameVi: 'Đau lan xuống mông và cẳng chân (Đau thần kinh tọa)',
    nameEn: 'Radiating pain down the leg (Sciatica)',
    synonyms: 'dau than kinh toa, dau lan xuong chan, te bi chan',
    bodyPart: 'Cột sống thắt lưng',
    suggestedIcdCodes: 'M51.2,M54.5',
  },
  {
    nameVi: 'Hạn chế tầm vận động cúi ngửa',
    nameEn: 'Limited range of spinal motion',
    synonyms: 'kho cui ngap nguoi, cung cot song',
    bodyPart: 'Cột sống thắt lưng',
    suggestedIcdCodes: 'M54.5,M51.2',
  },
  // Khớp vai & Cổ
  {
    nameVi: 'Đau mỏi cổ vai gáy',
    nameEn: 'Neck and shoulder pain',
    synonyms: 'dau co vai gay, moi co, te tay do thoai hoa co',
    bodyPart: 'Cột sống cổ',
    suggestedIcdCodes: 'M50,M54.5',
  },
  {
    nameVi: 'Hạn chế giơ tay qua đầu / Đau khớp vai',
    nameEn: 'Pain on shoulder abduction',
    synonyms: 'kho dua tay len cao, dau vai khi nam nghieng',
    bodyPart: 'Khớp vai',
    suggestedIcdCodes: 'M75',
  },
  // Triệu chứng toàn thân & Cơ quan khác
  {
    nameVi: 'Đau đầu, chóng mặt, hoa mắt',
    nameEn: 'Headache and dizziness',
    synonyms: 'chong mat, nhuc dau, choang vang',
    bodyPart: 'Đầu',
    suggestedIcdCodes: 'I10',
  },
  {
    nameVi: 'Cơn tức nặng ngực trái',
    nameEn: 'Chest tightness / pressure',
    synonyms: 'tuc nguc, nhoi ngực, kho tho khi gang suc',
    bodyPart: 'Lồng ngực',
    suggestedIcdCodes: 'I20,I25.1',
  },
  {
    nameVi: 'Đau rát vùng thượng vị, ợ hơi, ợ chua',
    nameEn: 'Epigastric burning pain and heartburn',
    synonyms: 'dau thuong vi, o chua, non nao da day',
    bodyPart: 'Bụng',
    suggestedIcdCodes: 'K29.7,K21.0',
  },
  {
    nameVi: 'Sốt cao từng cơn kèm gai rét',
    nameEn: 'High fever with chills',
    synonyms: 'sot cao, sot nong, ret run, sot sieu vi, sot',
    bodyPart: 'Toàn thân',
    suggestedIcdCodes: 'R50.9,J00',
  },
  {
    nameVi: 'Ho khan kéo dài, rát cổ họng',
    nameEn: 'Dry cough and sore throat',
    synonyms: 'ho khan, ho co dom, ngua co hong, viem hong',
    bodyPart: 'Hô hấp',
    suggestedIcdCodes: 'J00,J20.9',
  },
  {
    nameVi: 'Khó thở, thở khò khè',
    nameEn: 'Dyspnea and wheezing',
    synonyms: 'kho tho, hut hoi, tho nhanh',
    bodyPart: 'Hô hấp',
    suggestedIcdCodes: 'J45.9,I50',
  },
];

const INITIAL_SNIPPETS_DATA = [
  {
    triggerKey: ';kham-goi',
    title: 'Mẫu khám thực thể Khớp gối',
    content: '- Nhìn: Khớp gối hai bên cân đối, không biến dạng lệch trục vẹo trong/ngoài, không sưng nề tụ dịch rõ.\n- Sờ: Nhiệt độ da quanh khớp bình thường, ấn điểm bám gân bánh chè (-), ấn khe khớp trong/ngoài không điểm đau chói.\n- Vận động: Gập 130°, duỗi 0°. Dấu hiệu bào bánh chè (+) nhẹ bên phải. Nghiệm pháp ngăn kéo (-), Lachman (-).\n- Chẩn đoán sơ bộ: Theo dõi thoái hóa khớp gối nguyên phát.',
    category: 'clinical_exam',
    scope: 'SYSTEM',
  },
  {
    triggerKey: ';kham-cot-song',
    title: 'Mẫu khám Cột sống thắt lưng',
    content: '- Cột sống thắt lưng còn đường cong sinh lý, cơ cạnh sống không co cứng cơ khu trú.\n- Ấn gai sau và cơ cạnh sống L4-L5, L5-S1 căng tức nhẹ, không điểm đau chói gõ búa.\n- Dấu hiệu Schober: 14/10 cm. Nghiệm pháp Lasegue hai bên (-) 80°.\n- Phản xạ gân xương bánh chè, gân gót bình thường hai bên. Cảm giác da và cơ lực chi dưới 5/5.',
    category: 'clinical_exam',
    scope: 'SYSTEM',
  },
  {
    triggerKey: ';kham-vai',
    title: 'Mẫu khám Khớp vai (Viêm quanh khớp vai)',
    content: '- Khớp vai hai bên cân đối, không teo cơ delta.\n- Ấn rãnh nhị đầu và mỏm cùng vai đau nhẹ.\n- Tầm vận động chủ động: Giạng 150°, đưa trước 160°, xoay ngoài 60°, xoay trong 70°.\n- Nghiệm pháp Neer (+), Hawkins-Kennedy (+), Yergason (-).',
    category: 'clinical_exam',
    scope: 'SYSTEM',
  },
  {
    triggerKey: ';tai-kham',
    title: 'Mẫu dặn dò kế hoạch tái khám',
    content: 'Tái khám sau khi dùng hết đợt thuốc hoặc đến khám lại ngay nếu xuất hiện các dấu hiệu bất thường: Đau tăng dữ dội không đáp ứng thuốc giảm đau, khớp sưng to nóng đỏ cấp tính, hoặc tê bì yếu liệt vận động chi.',
    category: 'treatment_plan',
    scope: 'SYSTEM',
  },
  {
    triggerKey: ';sinh-hoat-khop',
    title: 'Hướng dẫn sinh hoạt & tập luyện cơ xương khớp',
    content: '1. Nghỉ ngơi hợp lý, tránh mang vác vật nặng quá 5kg.\n2. Hạn chế leo cầu thang, không ngồi xổm hoặc xếp bằng.\n3. Tập các bài tập co cơ tĩnh cơ tứ đầu đùi 15 phút mỗi ngày.\n4. Duy trì cân nặng hợp lý, tránh để tăng cân gây áp lực lên khớp gối.',
    category: 'care_instructions',
    scope: 'SYSTEM',
  },
  {
    triggerKey: ';dan-do-thuoc',
    title: 'Dặn dò dùng thuốc dạ dày & chống viêm',
    content: 'Thuốc chống viêm giảm đau uống ngay sau bữa ăn no cùng nhiều nước. Nếu có tiền sử đau dạ dày hoặc cảm giác nóng rát thượng vị, uống kèm thuốc bảo vệ niêm mạc dạ dày trước ăn sáng 30 phút.',
    category: 'care_instructions',
    scope: 'SYSTEM',
  },
];

async function syncAndSeed() {
  console.log('=== ĐỒNG BỘ SCHEMA & SEED DỮ LIỆU BỘ CÔNG CỤ LÂM SÀNG THÔNG MINH ===');
  try {
    // 1. Tạo bảng an toàn
    console.log('1. Đồng bộ bảng ICD10_Catalogs...');
    await db.ICD10Catalog.sync({ alter: true });

    console.log('2. Đồng bộ bảng Clinical_Symptom_Catalogs...');
    await db.ClinicalSymptomCatalog.sync({ alter: true });

    console.log('3. Đồng bộ bảng Clinical_Snippets...');
    await db.ClinicalSnippet.sync({ alter: true });

    console.log('4. Đồng bộ bảng Doctor_Clinical_Preferences...');
    await db.DoctorClinicalPreference.sync({ alter: true });

    // 2. Tìm Specialty Cơ xương khớp nếu có để gắn FK
    const specialtyCkx = await db.Specialty.findOne({
      where: {
        name: { [db.Sequelize.Op.iLike]: '%cơ xương khớp%' },
      },
    });
    const specialtyId = specialtyCkx ? specialtyCkx.id : null;
    console.log(`📌 Chuyên khoa Cơ xương khớp ID: ${specialtyId || 'None'}`);

    // 3. Seed ICD-10
    console.log(`3. Nạp danh mục ICD-10 (${INITIAL_ICD10_DATA.length} bản ghi)...`);
    for (const item of INITIAL_ICD10_DATA) {
      await db.ICD10Catalog.findOrCreate({
        where: { code: item.code },
        defaults: {
          ...item,
          specialtyId: item.chapter === 'XIII' ? specialtyId : null,
        },
      });
    }

    // 4. Seed Triệu chứng
    console.log(`4. Nạp danh mục Triệu chứng (${INITIAL_SYMPTOMS_DATA.length} bản ghi)...`);
    for (const item of INITIAL_SYMPTOMS_DATA) {
      await db.ClinicalSymptomCatalog.findOrCreate({
        where: { nameVi: item.nameVi },
        defaults: {
          ...item,
          specialtyId: item.bodyPart?.includes('Khớp') || item.bodyPart?.includes('Cột sống') ? specialtyId : null,
        },
      });
    }

    // 5. Seed Snippets
    console.log(`5. Nạp danh mục Snippet mẫu (${INITIAL_SNIPPETS_DATA.length} bản ghi)...`);
    for (const item of INITIAL_SNIPPETS_DATA) {
      await db.ClinicalSnippet.findOrCreate({
        where: { triggerKey: item.triggerKey, scope: 'SYSTEM' },
        defaults: {
          ...item,
          specialtyId: item.triggerKey.includes('khop') || item.triggerKey.includes('kham') ? specialtyId : null,
        },
      });
    }

    const icdCount = await db.ICD10Catalog.count();
    const symptomCount = await db.ClinicalSymptomCatalog.count();
    const snippetCount = await db.ClinicalSnippet.count();

    console.log('✅ Hoàn thành khởi tạo Schema & Seed dữ liệu thành công!');
    console.log(`   - Tổng ICD-10 trong DB: ${icdCount}`);
    console.log(`   - Tổng Triệu chứng trong DB: ${symptomCount}`);
    console.log(`   - Tổng Snippet trong DB: ${snippetCount}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ schema lâm sàng:', error);
    process.exit(1);
  }
}

syncAndSeed();
