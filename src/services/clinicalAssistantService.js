// bookingcare-backend/src/services/clinicalAssistantService.js
// [Clinical Smart Assistant Engine] Tìm kiếm ICD-10, Triệu chứng, Mẫu Snippet và Gợi ý theo ngữ cảnh
const db = require('../models');
const { Op } = require('sequelize');

// Helper chuẩn hóa tiếng Việt không dấu
const removeVietnameseTones = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};

/**
 * 1. Tìm kiếm chẩn đoán ICD-10 thông minh
 * Hỗ trợ: Mã chính xác, Mã tiền tố, Tên có dấu / không dấu, Từ đồng nghĩa,
 * Ranking theo Chuyên khoa & Tần suất bác sĩ sử dụng
 */
const searchIcd10 = async (param1 = {}, param2 = {}) => {
  try {
    const options = typeof param1 === 'string' ? { query: param1, ...param2 } : (param1 || {});
    const { query = '', doctorId = null, specialtyId = null, limit = 8 } = options;
    const rawQuery = String(query || '').trim();
    const cleanQuery = rawQuery.toLowerCase();
    const noToneQuery = removeVietnameseTones(rawQuery);

    if (!cleanQuery) {
      // Nếu chưa gõ từ khóa: ưu tiên lấy các mã phổ biến của chuyên khoa hoặc toàn viện
      const whereCondition = { isActive: true };
      if (specialtyId) {
        whereCondition[Op.or] = [
          { specialtyId: Number(specialtyId) },
          { specialtyId: null },
        ];
      }

      const defaultResults = await db.ICD10Catalog.findAll({
        where: whereCondition,
        order: [
          ['commonRank', 'DESC'],
          ['code', 'ASC'],
        ],
        limit: Number(limit) || 8,
      });

      return {
        errCode: 0,
        message: 'Lấy gợi ý ICD-10 phổ biến thành công',
        data: defaultResults.map((item) => ({
          id: item.id,
          code: item.code,
          nameVi: item.nameVi,
          nameEn: item.nameEn,
          chapter: item.chapter,
          specialtyId: item.specialtyId,
          score: item.commonRank,
        })),
      };
    }

    // Lấy tần suất sử dụng của bác sĩ nếu có doctorId
    let doctorPrefsMap = new Map();
    if (doctorId) {
      const prefs = await db.DoctorClinicalPreference.findAll({
        where: {
          doctorId: Number(doctorId),
          termType: 'ICD10',
        },
      });
      prefs.forEach((p) => {
        doctorPrefsMap.set(p.termKey.toUpperCase(), p.frequency || 1);
      });
    }

    // Lấy toàn bộ danh mục active để thực hiện thuật toán ranking đa cấp
    const allCatalogs = await db.ICD10Catalog.findAll({
      where: { isActive: true },
    });

    const scoredResults = [];

    for (const item of allCatalogs) {
      const codeUpper = item.code.toUpperCase();
      const qUpper = rawQuery.toUpperCase();
      const nameVi = item.nameVi || '';
      const nameViLower = nameVi.toLowerCase();
      const nameViNoTone = removeVietnameseTones(nameVi);
      const nameEnLower = (item.nameEn || '').toLowerCase();
      const synonyms = (item.synonyms || '').toLowerCase();
      const synonymsNoTone = removeVietnameseTones(synonyms);

      let score = 0;
      let matchType = null;

      // 1. Khớp mã chính xác (M17 === M17)
      if (codeUpper === qUpper) {
        score += 100;
        matchType = 'exact_code';
      }
      // 2. Khớp tiền tố mã (M17.0 bắt đầu bằng M17)
      else if (codeUpper.startsWith(qUpper)) {
        score += 85;
        matchType = 'prefix_code';
      }
      // 3. Khớp tên có dấu chính xác
      else if (nameViLower === cleanQuery) {
        score += 90;
        matchType = 'exact_name';
      }
      // 4. Khớp tên không dấu chính xác
      else if (nameViNoTone === noToneQuery) {
        score += 85;
        matchType = 'exact_name_notone';
      }
      // 5. Khớp tên bắt đầu bằng cụm từ
      else if (nameViLower.startsWith(cleanQuery) || nameViNoTone.startsWith(noToneQuery)) {
        score += 75;
        matchType = 'prefix_name';
      }
      // 6. Khớp một phần trong tên (chứa cụm từ)
      else if (nameViLower.includes(cleanQuery) || nameViNoTone.includes(noToneQuery)) {
        score += 65;
        matchType = 'contains_name';
      }
      // 7. Khớp từ đồng nghĩa / tiếng Anh / viết tắt
      else if (
        synonyms.includes(cleanQuery) ||
        synonymsNoTone.includes(noToneQuery) ||
        nameEnLower.includes(cleanQuery)
      ) {
        score += 55;
        matchType = 'synonym_match';
      }
      // 8. Khớp từng từ đơn lẻ (Partial Word Matching)
      else {
        const queryWords = noToneQuery.split(/\s+/).filter(Boolean);
        const matchedWords = queryWords.filter((w) => nameViNoTone.includes(w) || synonymsNoTone.includes(w));
        if (matchedWords.length === queryWords.length && queryWords.length > 0) {
          score += 45;
          matchType = 'all_words_match';
        }
      }

      // Chỉ giữ lại bản ghi có khớp
      if (score > 0) {
        // Boost điểm chuyên khoa liên quan (+15 điểm)
        if (specialtyId && Number(item.specialtyId) === Number(specialtyId)) {
          score += 15;
        }

        // Boost điểm tần suất bác sĩ sử dụng (+2 điểm mỗi lần dùng, tối đa +12 điểm)
        const docFreq = doctorPrefsMap.get(codeUpper) || 0;
        if (docFreq > 0) {
          score += Math.min(docFreq * 2, 12);
        }

        // Cộng thêm trọng số phổ biến chung (max +5 điểm)
        score += Math.min(Math.round((item.commonRank || 0) / 20), 5);

        scoredResults.push({
          id: item.id,
          code: item.code,
          nameVi: item.nameVi,
          nameEn: item.nameEn,
          chapter: item.chapter,
          specialtyId: item.specialtyId,
          score,
          matchType,
          usedCount: docFreq,
        });
      }
    }

    // Sắp xếp giảm dần theo điểm số
    scoredResults.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

    const finalResults = scoredResults.slice(0, Number(limit) || 8);

    return {
      errCode: 0,
      message: 'Tìm kiếm ICD-10 thành công',
      data: finalResults,
    };
  } catch (error) {
    console.error('>>> Error in searchIcd10:', error);
    return { errCode: -1, message: 'Lỗi server khi tìm kiếm chẩn đoán ICD-10' };
  }
};

/**
 * 2. Tìm kiếm triệu chứng lâm sàng
 */
const searchSymptoms = async (param1 = {}, param2 = {}) => {
  try {
    const options = typeof param1 === 'string' ? { query: param1, ...param2 } : (param1 || {});
    const { query = '', specialtyId = null, limit = 8 } = options;
    const rawQuery = String(query || '').trim();
    const cleanQuery = rawQuery.toLowerCase();
    const noToneQuery = removeVietnameseTones(rawQuery);

    const allSymptoms = await db.ClinicalSymptomCatalog.findAll({
      where: { isActive: true },
    });

    const scoredResults = [];

    for (const item of allSymptoms) {
      const nameVi = item.nameVi || '';
      const nameViLower = nameVi.toLowerCase();
      const nameViNoTone = removeVietnameseTones(nameVi);
      const synonyms = (item.synonyms || '').toLowerCase();
      const synonymsNoTone = removeVietnameseTones(synonyms);
      const bodyPart = (item.bodyPart || '').toLowerCase();
      const bodyPartNoTone = removeVietnameseTones(bodyPart);

      let score = 0;

      if (!cleanQuery) {
        score = 10;
      } else if (nameViLower === cleanQuery || nameViNoTone === noToneQuery) {
        score += 90;
      } else if (nameViLower.startsWith(cleanQuery) || nameViNoTone.startsWith(noToneQuery)) {
        score += 75;
      } else if (nameViLower.includes(cleanQuery) || nameViNoTone.includes(noToneQuery)) {
        score += 60;
      } else if (synonyms.includes(cleanQuery) || synonymsNoTone.includes(noToneQuery)) {
        score += 50;
      } else if (bodyPart.includes(cleanQuery) || bodyPartNoTone.includes(noToneQuery)) {
        score += 40;
      }

      if (score > 0) {
        if (specialtyId && Number(item.specialtyId) === Number(specialtyId)) {
          score += 15;
        }

        const suggestedIcdCodes = item.suggestedIcdCodes
          ? item.suggestedIcdCodes.split(',').map((c) => c.trim()).filter(Boolean)
          : [];

        scoredResults.push({
          id: item.id,
          nameVi: item.nameVi,
          nameEn: item.nameEn,
          bodyPart: item.bodyPart,
          suggestedIcdCodes,
          score,
        });
      }
    }

    scoredResults.sort((a, b) => b.score - a.score);

    return {
      errCode: 0,
      message: 'Tìm kiếm triệu chứng thành công',
      data: scoredResults.slice(0, Number(limit) || 8),
    };
  } catch (error) {
    console.error('>>> Error in searchSymptoms:', error);
    return { errCode: -1, message: 'Lỗi server khi tìm kiếm triệu chứng' };
  }
};

/**
 * 3. Ghi nhận lựa chọn của bác sĩ (Personalization Frequency Tracking)
 */
const recordDoctorPreference = async ({ doctorId, termType, termKey }) => {
  try {
    if (!doctorId || !termType || !termKey) {
      return { errCode: 1, message: 'Thiếu thông tin bắt buộc' };
    }

    const cleanKey = String(termKey).trim().toUpperCase();

    const [pref, created] = await db.DoctorClinicalPreference.findOrCreate({
      where: {
        doctorId: Number(doctorId),
        termType: String(termType).toUpperCase(),
        termKey: cleanKey,
      },
      defaults: {
        doctorId: Number(doctorId),
        termType: String(termType).toUpperCase(),
        termKey: cleanKey,
        frequency: 1,
        lastUsedAt: new Date(),
      },
    });

    if (!created) {
      await pref.increment('frequency', { by: 1 });
      pref.lastUsedAt = new Date();
      await pref.save();
    }

    return { errCode: 0, message: 'Đã cập nhật tùy chọn bác sĩ thành công' };
  } catch (error) {
    console.error('>>> Error in recordDoctorPreference:', error);
    return { errCode: -1, message: 'Lỗi server khi ghi nhận tùy chọn bác sĩ' };
  }
};

/**
 * 4. Lấy danh sách Snippet mẫu ghi chép lâm sàng
 * Gồm mẫu hệ thống dùng chung (SYSTEM) và mẫu cá nhân của bác sĩ (DOCTOR)
 */
const getSnippets = async ({ doctorId = null, category = null, specialtyId = null, search = '' }) => {
  try {
    const whereConditions = {
      isActive: true,
      [Op.or]: [
        { scope: 'SYSTEM' },
        ...(doctorId ? [{ scope: 'DOCTOR', doctorId: Number(doctorId) }] : []),
      ],
    };

    if (category) {
      whereConditions.category = category;
    }

    if (specialtyId) {
      whereConditions[Op.and] = [
        {
          [Op.or]: [
            { specialtyId: Number(specialtyId) },
            { specialtyId: null },
          ],
        },
      ];
    }

    if (search) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereConditions[Op.or] = [
        { triggerKey: { [Op.iLike]: q } },
        { title: { [Op.iLike]: q } },
        { content: { [Op.iLike]: q } },
      ];
    }

    const snippets = await db.ClinicalSnippet.findAll({
      where: whereConditions,
      order: [
        ['scope', 'DESC'], // Mẫu cá nhân của bác sĩ (DOCTOR) ưu tiên hiển thị trước
        ['triggerKey', 'ASC'],
      ],
    });

    return {
      errCode: 0,
      message: 'Lấy danh sách mẫu snippet thành công',
      data: snippets,
    };
  } catch (error) {
    console.error('>>> Error in getSnippets:', error);
    return { errCode: -1, message: 'Lỗi server khi lấy danh sách snippet' };
  }
};

/**
 * 5. Bác sĩ tự tạo Snippet cá nhân mới
 */
const createDoctorSnippet = async (doctorId, data) => {
  try {
    if (!doctorId) return { errCode: 1, message: 'Chưa xác thực bác sĩ' };
    const { triggerKey, title, content, category, specialtyId } = data || {};

    if (!triggerKey || !title || !content) {
      return { errCode: 2, message: 'Vui lòng nhập đầy đủ mã gọi tắt, tiêu đề và nội dung mẫu' };
    }

    // Đảm bảo triggerKey bắt đầu bằng dấu ; hoặc /
    let cleanKey = triggerKey.trim().toLowerCase();
    if (!cleanKey.startsWith(';') && !cleanKey.startsWith('/')) {
      cleanKey = `;${cleanKey}`;
    }

    // Kiểm tra trùng triggerKey trong phạm vi cá nhân của bác sĩ
    const existing = await db.ClinicalSnippet.findOne({
      where: {
        doctorId: Number(doctorId),
        triggerKey: cleanKey,
      },
    });

    if (existing) {
      return { errCode: 3, message: `Mã gọi tắt "${cleanKey}" đã tồn tại trong danh sách mẫu của bạn` };
    }

    const newSnippet = await db.ClinicalSnippet.create({
      triggerKey: cleanKey,
      title: title.trim(),
      content: content.trim(),
      category: category || 'general',
      scope: 'DOCTOR',
      doctorId: Number(doctorId),
      specialtyId: specialtyId ? Number(specialtyId) : null,
      isActive: true,
    });

    return {
      errCode: 0,
      message: 'Tạo mẫu snippet cá nhân thành công',
      data: newSnippet,
    };
  } catch (error) {
    console.error('>>> Error in createDoctorSnippet:', error);
    return { errCode: -1, message: 'Lỗi server khi tạo snippet cá nhân' };
  }
};

/**
 * 6. Xóa Snippet cá nhân của bác sĩ (Bảo vệ quyền sở hữu)
 */
const deleteDoctorSnippet = async (snippetId, doctorId) => {
  try {
    const snippet = await db.ClinicalSnippet.findOne({
      where: {
        id: Number(snippetId),
        doctorId: Number(doctorId),
        scope: 'DOCTOR',
      },
    });

    if (!snippet) {
      return { errCode: 404, message: 'Không tìm thấy mẫu snippet cá nhân hoặc không có quyền xóa' };
    }

    await snippet.destroy();
    return { errCode: 0, message: 'Đã xóa mẫu snippet cá nhân thành công' };
  } catch (error) {
    console.error('>>> Error in deleteDoctorSnippet:', error);
    return { errCode: -1, message: 'Lỗi server khi xóa snippet cá nhân' };
  }
};

/**
 * 7. Gợi ý theo ngữ cảnh ca khám hiện tại (Contextual Suggestions)
 * - Đọc triệu chứng từ ca khám -> tìm các ICD-10 tương quan
 * - Đọc các chẩn đoán từ tiền sử các ca khám trước
 */
const getContextualSuggestions = async ({ bookingId, doctorId }) => {
  try {
    const booking = await db.Booking.findOne({
      where: { id: bookingId, doctorId },
      include: [
        { model: db.User, as: 'patientData' },
      ],
    });

    if (!booking) {
      return { errCode: 1, message: 'Không tìm thấy ca khám' };
    }

    // 1. Tiền sử chẩn đoán từ các ca khám cũ của bệnh nhân này
    const pastBookings = await db.Booking.findAll({
      where: {
        patientId: booking.patientId,
        id: { [Op.ne]: bookingId },
        statusId: 'S3', // Đã khám xong
        diagnosis: { [Op.ne]: null },
      },
      order: [['date', 'DESC'], ['id', 'DESC']],
      limit: 5,
    });

    const historicalDiagnoses = pastBookings.map((b) => ({
      bookingId: b.id,
      date: b.date,
      diagnosis: b.diagnosis,
      treatmentPlan: b.treatmentPlan,
    }));

    // 2. Gợi ý chẩn đoán dựa trên triệu chứng hiện tại của booking
    let suggestedFromSymptoms = [];
    if (booking.symptoms) {
      const symptomRes = await searchSymptoms({
        query: booking.symptoms,
        limit: 5,
      });

      if (symptomRes.errCode === 0 && symptomRes.data.length > 0) {
        const icdCodesToFetch = [
          ...new Set(
            symptomRes.data.flatMap((s) => s.suggestedIcdCodes || [])
          ),
        ];

        if (icdCodesToFetch.length > 0) {
          suggestedFromSymptoms = await db.ICD10Catalog.findAll({
            where: {
              code: { [Op.in]: icdCodesToFetch },
              isActive: true,
            },
          });
        }
      }
    }

    return {
      errCode: 0,
      message: 'Lấy gợi ý ngữ cảnh lâm sàng thành công',
      data: {
        historicalDiagnoses,
        suggestedFromSymptoms,
      },
    };
  } catch (error) {
    console.error('>>> Error in getContextualSuggestions:', error);
    return { errCode: -1, message: 'Lỗi server khi lấy gợi ý ngữ cảnh' };
  }
};

module.exports = {
  searchIcd10,
  searchSymptoms,
  recordDoctorPreference,
  getSnippets,
  createDoctorSnippet,
  deleteDoctorSnippet,
  getContextualSuggestions,
};
