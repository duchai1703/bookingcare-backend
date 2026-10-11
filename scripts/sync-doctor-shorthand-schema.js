// bookingcare-backend/scripts/sync-doctor-shorthand-schema.js
require('dotenv').config();
const db = require('../src/models');

const INITIAL_SHORTHANDS = [
  // --- CHẨN ĐOÁN (targetField: 'diagnosis' hoặc 'ALL') ---
  {
    shortCode: 'tha',
    expandedText: '[I10] Tăng huyết áp vô căn (nguyên phát)',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 45,
  },
  {
    shortCode: 'dt2',
    expandedText: '[E11] Đái tháo đường týp 2 (Type 2 Diabetes Mellitus)',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 38,
  },
  {
    shortCode: 't2d',
    expandedText: '[E11] Đái tháo đường týp 2 (Type 2 Diabetes Mellitus)',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 20,
  },
  {
    shortCode: 'thkg',
    expandedText: '[M17] Thoái hóa khớp gối nguyên phát hai bên',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 52,
  },
  {
    shortCode: 'thcs',
    expandedText: '[M54.5] Thoái hóa cột sống thắt lưng / Đau lưng cơ năng',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 35,
  },
  {
    shortCode: 'vkdt',
    expandedText: '[M06.9] Viêm khớp dạng thấp, không đặc hiệu',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 28,
  },
  {
    shortCode: 'gut',
    expandedText: '[M10] Bệnh Gút cấp / Đợt cấp gút mạn (Gouty arthritis)',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 25,
  },
  {
    shortCode: 'rlmm',
    expandedText: '[E78.5] Tăng lipid máu hỗn hợp / Rối loạn mỡ máu',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 30,
  },
  {
    shortCode: 'vtt',
    expandedText: '[K29.7] Viêm dạ dày tá tràng mạn tính / Trào ngược dạ dày (GERD)',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 33,
  },
  {
    shortCode: 'cl',
    expandedText: '[J00] Viêm mũi họng cấp tính (Cảm lạnh thông thường)',
    targetField: 'diagnosis',
    category: 'DIAGNOSIS',
    usageCount: 15,
  },

  // --- KHÁM LÂM SÀNG & THỰC THỂ (targetField: 'clinicalNotes' hoặc 'ALL') ---
  {
    shortCode: 'ktp',
    expandedText: 'Tim đều rõ, T1 T2 rõ, không nghe tiếng thổi bệnh lý. Phổi thông khí hai bên đều rõ, không rale ẩm, không rale rít.',
    targetField: 'clinicalNotes',
    category: 'EXAM',
    usageCount: 60,
  },
  {
    shortCode: 'kkg',
    expandedText: 'Khớp gối hai bên cân đối, không sưng nề tụ dịch, không nóng đỏ. Tầm vận động gập 130°, duỗi 0°. Dấu hiệu bào bánh chè (+) nhẹ. Nghiệm pháp ngăn kéo (-), Lachman (-).',
    targetField: 'clinicalNotes',
    category: 'EXAM',
    usageCount: 48,
  },
  {
    shortCode: 'kcs',
    expandedText: 'Cột sống thắt lưng trục thẳng, độ cong sinh lý bảo tồn. Ấn các mỏm gai sau L4-L5 và cơ cạnh sống không điểm đau chói dữ dội. Nghiệm pháp Schober 14/10cm. Nghiệm pháp Lasegue (-) 80° hai bên.',
    targetField: 'clinicalNotes',
    category: 'EXAM',
    usageCount: 40,
  },
  {
    shortCode: 'kb',
    expandedText: 'Bụng mềm, không chướng, di động đều theo nhịp thở. Gan lách không sờ chạm dưới bờ sườn. Ấn thượng vị và quanh rốn không điểm đau khu trú. Phản ứng thành bụng (-).',
    targetField: 'clinicalNotes',
    category: 'EXAM',
    usageCount: 32,
  },
  {
    shortCode: 'ttb',
    expandedText: 'Bệnh nhân tỉnh táo, tiếp xúc tốt, da niêm mạc hồng hào, không phù, tuyến giáp không to, hạch ngoại vi không sờ chạm. Sinh hiệu ổn định.',
    targetField: 'clinicalNotes',
    category: 'EXAM',
    usageCount: 55,
  },

  // --- TRIỆU CHỨNG LÂM SÀNG (targetField: 'symptoms' hoặc 'chiefComplaint') ---
  {
    shortCode: 'dkg',
    expandedText: 'Đau mỏi hai khớp gối, đau tăng khi đi lại hoặc leo cầu thang, nghe tiếng lạo xạo khớp khi vận động, có cứng khớp buổi sáng khoảng 10-15 phút.',
    targetField: 'symptoms',
    category: 'CLINICAL',
    usageCount: 42,
  },
  {
    shortCode: 'dtl',
    expandedText: 'Đau âm ỉ vùng thắt lưng, đau tăng khi ngồi lâu hoặc cúi mang vác nặng, nghỉ ngơi có giảm nhẹ, chưa lan xuống chân.',
    targetField: 'symptoms',
    category: 'CLINICAL',
    usageCount: 36,
  },
  {
    shortCode: 'ddcm',
    expandedText: 'Đau đầu âm ỉ vùng trán và hai thái dương, kèm hoa mắt chóng mặt khi thay đổi tư thế, đo huyết áp tại nhà dao động 140-150 mmHg.',
    targetField: 'symptoms',
    category: 'CLINICAL',
    usageCount: 29,
  },
  {
    shortCode: 'ohe',
    expandedText: 'Đau tức nóng rát vùng thượng vị sau bữa ăn, kèm ợ hơi, ợ chua, cảm giác đắng miệng và non nao vào buổi sáng.',
    targetField: 'symptoms',
    category: 'CLINICAL',
    usageCount: 27,
  },

  // --- KẾ HOẠCH & DẶN DÒ ĐIỀU TRỊ (targetField: 'treatmentPlan' / 'careInstructions') ---
  {
    shortCode: 'u2v',
    expandedText: 'Uống 1 viên x 2 lần/ngày, sau bữa ăn sáng và tối.',
    targetField: 'medicineUsage',
    category: 'PRESCRIPTION',
    usageCount: 75,
  },
  {
    shortCode: 'u1v',
    expandedText: 'Uống 1 viên/ngày vào buổi sáng sau khi ăn no.',
    targetField: 'medicineUsage',
    category: 'PRESCRIPTION',
    usageCount: 65,
  },
  {
    shortCode: 'u1t',
    expandedText: 'Uống 1 viên vào buổi tối trước khi đi ngủ 30 phút.',
    targetField: 'medicineUsage',
    category: 'PRESCRIPTION',
    usageCount: 40,
  },
  {
    shortCode: 'tk1w',
    expandedText: 'Tái khám sau 1 tuần hoặc tái khám ngay nếu có dấu hiệu đau tăng, sốt hoặc bất thường.',
    targetField: 'careInstructions',
    category: 'ADVICE',
    usageCount: 50,
  },
  {
    shortCode: 'tk2w',
    expandedText: 'Tái khám sau 2 tuần để đánh giá đáp ứng điều trị và điều chỉnh liều thuốc.',
    targetField: 'careInstructions',
    category: 'ADVICE',
    usageCount: 45,
  },
  {
    shortCode: 'tk1m',
    expandedText: 'Tái khám định kỳ sau 1 tháng, mang theo toàn bộ đơn thuốc và kết quả cận lâm sàng.',
    targetField: 'careInstructions',
    category: 'ADVICE',
    usageCount: 38,
  },
  {
    shortCode: 'kcl',
    expandedText: 'Hạn chế leo cầu thang, tránh ngồi xổm hoặc mang vác nặng. Chườm ấm khớp gối 15-20 phút mỗi tối trước khi ngủ. Tập đạp xe nhẹ nhàng tại chỗ.',
    targetField: 'careInstructions',
    category: 'ADVICE',
    usageCount: 46,
  },
  {
    shortCode: 'ankn',
    expandedText: 'Chế độ ăn nhạt giảm muối (<5g/ngày), hạn chế mỡ động vật và nội tạng, tăng cường rau xanh củ quả, uống đủ 2 lít nước mỗi ngày.',
    targetField: 'careInstructions',
    category: 'ADVICE',
    usageCount: 41,
  },
  {
    shortCode: 'vltt',
    expandedText: 'Điều trị nội khoa kết hợp vật lý trị liệu phục hồi chức năng: hồng ngoại, sóng ngắn trị liệu, bài tập căng giãn cơ đáy chậu và cơ tứ đầu đùi.',
    targetField: 'treatmentPlan',
    category: 'CLINICAL',
    usageCount: 34,
  },
];

async function syncDoctorShorthandSchema() {
  console.log('=== ĐỒNG BỘ SCHEMA & NẠP TỪ VIẾT TẮT Y KHOA (DOCTOR SHORTHANDS) ===');
  try {
    console.log('1. Đồng bộ bảng Doctor_Shorthands...');
    await db.DoctorShorthand.sync({ alter: true });
    console.log('✓ Bảng Doctor_Shorthands đã sẵn sàng.');

    console.log(`2. Nạp ${INITIAL_SHORTHANDS.length} từ viết tắt y khoa tiêu chuẩn...`);
    let createdCount = 0;
    for (const item of INITIAL_SHORTHANDS) {
      const [record, created] = await db.DoctorShorthand.findOrCreate({
        where: {
          doctorId: null, // SYSTEM shorthand
          shortCode: item.shortCode,
          targetField: item.targetField,
        },
        defaults: {
          ...item,
          doctorId: null,
          isActive: true,
        },
      });
      if (created) createdCount++;
    }

    const totalCount = await db.DoctorShorthand.count();
    console.log(`✅ Hoàn thành khởi tạo! Đã thêm mới ${createdCount} từ viết tắt. Tổng số trong DB: ${totalCount}.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi đồng bộ schema DoctorShorthand:', err);
    process.exit(1);
  }
}

syncDoctorShorthandSchema();
