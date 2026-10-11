// bookingcare-backend/src/services/doctorShorthandService.js
// Service xử lý tìm kiếm, tự động điền và quản lý từ viết tắt lâm sàng
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
 * 1. Tìm kiếm nhanh từ viết tắt & gợi ý (Dùng cho inline autocomplete trên mọi ô nhập liệu)
 */
const searchShorthands = async (param1 = {}, param2 = {}) => {
  try {
    const options = typeof param1 === 'string' ? { query: param1, ...param2 } : (param1 || {});
    const { doctorId = null, query = '', targetField = 'ALL', limit = 8 } = options;

    const rawQuery = String(query || '').trim().toLowerCase();
    const noToneQuery = removeVietnameseTones(rawQuery);

    // Điều kiện tìm kiếm cơ bản: Active, thuộc Bác sĩ này HOẶC thuộc Hệ thống (doctorId is null)
    const whereConditions = {
      isActive: true,
      [Op.or]: [
        { doctorId: null },
      ],
    };

    if (doctorId) {
      whereConditions[Op.or].push({ doctorId: Number(doctorId) });
    }

    // Lọc theo ô nhập liệu (nếu ô chỉ định rõ, cho phép các mục targetField === 'ALL' hoặc targetField cụ thể)
    if (targetField && targetField !== 'ALL') {
      whereConditions[Op.and] = [
        {
          targetField: {
            [Op.in]: ['ALL', targetField],
          },
        },
      ];
    }

    const allCandidates = await db.DoctorShorthand.findAll({
      where: whereConditions,
    });

    if (!rawQuery) {
      // Nếu chưa gõ: Trả về các từ có tần suất dùng cao nhất
      allCandidates.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
      return {
        errCode: 0,
        message: 'Lấy danh sách gợi ý thành công',
        data: allCandidates.slice(0, Number(limit) || 8),
      };
    }

    const scoredResults = [];

    for (const item of allCandidates) {
      const code = (item.shortCode || '').toLowerCase();
      const codeNoTone = removeVietnameseTones(code);
      const text = (item.expandedText || '').toLowerCase();
      const textNoTone = removeVietnameseTones(text);

      let score = 0;
      let matchType = null;

      // 1. Khớp chính xác mã viết tắt (VD: gõ "tha" khớp "tha")
      if (code === rawQuery || codeNoTone === noToneQuery) {
        score += 100;
        matchType = 'exact_code';
      }
      // 2. Khớp tiền tố mã viết tắt (VD: gõ "th" khớp "thkg", "thcs")
      else if (code.startsWith(rawQuery) || codeNoTone.startsWith(noToneQuery)) {
        score += 85;
        matchType = 'prefix_code';
      }
      // 3. Khớp chứa mã viết tắt
      else if (code.includes(rawQuery) || codeNoTone.includes(noToneQuery)) {
        score += 70;
        matchType = 'contains_code';
      }
      // 4. Khớp tiền tố nội dung mở rộng
      else if (text.startsWith(rawQuery) || textNoTone.startsWith(noToneQuery)) {
        score += 65;
        matchType = 'prefix_text';
      }
      // 5. Khớp chứa trong nội dung mở rộng
      else if (text.includes(rawQuery) || textNoTone.includes(noToneQuery)) {
        score += 50;
        matchType = 'contains_text';
      }

      if (score > 0) {
        // Ưu tiên từ viết tắt của chính cá nhân bác sĩ (+15 điểm)
        if (doctorId && Number(item.doctorId) === Number(doctorId)) {
          score += 15;
        }

        // Ưu tiên chính xác theo trường chỉ định (+10 điểm)
        if (targetField && item.targetField === targetField) {
          score += 10;
        }

        // Điểm tần suất sử dụng (max +15 điểm)
        score += Math.min(Math.round((item.usageCount || 0) * 1.5), 15);

        scoredResults.push({
          id: item.id,
          shortCode: item.shortCode,
          expandedText: item.expandedText,
          targetField: item.targetField,
          category: item.category,
          usageCount: item.usageCount || 0,
          isPersonal: Boolean(item.doctorId),
          score,
          matchType,
        });
      }
    }

    scoredResults.sort((a, b) => b.score - a.score || a.shortCode.localeCompare(b.shortCode));

    return {
      errCode: 0,
      message: 'Tìm kiếm từ viết tắt thành công',
      data: scoredResults.slice(0, Number(limit) || 8),
    };
  } catch (error) {
    console.error('Error searching shorthands:', error);
    return {
      errCode: 1,
      message: 'Lỗi khi tìm kiếm từ viết tắt: ' + error.message,
      data: [],
    };
  }
};

/**
 * 2. Lấy danh sách cho trang Quản lý từ viết tắt của Bác sĩ (Kèm Thống kê)
 */
const getDoctorShorthands = async ({
  doctorId = null,
  search = '',
  targetField = 'ALL',
  category = 'ALL',
  page = 1,
  limit = 10,
}) => {
  try {
    const whereConditions = {
      isActive: true,
      [Op.or]: [{ doctorId: null }],
    };

    if (doctorId) {
      whereConditions[Op.or].push({ doctorId: Number(doctorId) });
    }

    if (targetField && targetField !== 'ALL') {
      whereConditions.targetField = targetField;
    }

    if (category && category !== 'ALL') {
      whereConditions.category = category;
    }

    const items = await db.DoctorShorthand.findAll({
      where: whereConditions,
      order: [
        ['usageCount', 'DESC'],
        ['shortCode', 'ASC'],
      ],
    });

    let filteredItems = items;
    const cleanSearch = removeVietnameseTones(search);
    if (cleanSearch) {
      filteredItems = items.filter((item) => {
        const c = removeVietnameseTones(item.shortCode);
        const t = removeVietnameseTones(item.expandedText);
        return c.includes(cleanSearch) || t.includes(cleanSearch);
      });
    }

    // Thống kê nhanh toàn bộ tập dữ liệu
    const totalCount = items.length;
    const personalCount = items.filter((it) => it.doctorId !== null).length;
    const systemCount = items.filter((it) => it.doctorId === null).length;
    const totalUsage = items.reduce((sum, it) => sum + (it.usageCount || 0), 0);

    // Xử lý Pagination
    const totalRecords = filteredItems.length;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const totalPages = Math.max(1, Math.ceil(totalRecords / limitNum));
    const offset = (pageNum - 1) * limitNum;
    const pagedItems = filteredItems.slice(offset, offset + limitNum);

    return {
      errCode: 0,
      message: 'Lấy danh mục từ viết tắt thành công',
      data: {
        shorthands: pagedItems,
        pagination: {
          total: totalRecords,
          page: pageNum,
          limit: limitNum,
          totalPages,
        },
        stats: {
          totalCount,
          personalCount,
          systemCount,
          totalUsage,
        },
      },
    };
  } catch (error) {
    console.error('Error getting doctor shorthands:', error);
    return {
      errCode: 1,
      message: 'Lỗi khi lấy danh mục: ' + error.message,
    };
  }
};

/**
 * 3. Tạo mới từ viết tắt cá nhân
 */
const createShorthand = async (data, doctorId) => {
  try {
    const { shortCode, expandedText, targetField = 'ALL', category = 'CLINICAL' } = data;

    if (!shortCode || !expandedText) {
      return {
        errCode: 2,
        message: 'Mã viết tắt và nội dung mở rộng không được để trống.',
      };
    }

    const cleanCode = String(shortCode).trim().toLowerCase();

    // Kiểm tra xem bác sĩ đã tạo mã này chưa
    const existing = await db.DoctorShorthand.findOne({
      where: {
        doctorId: Number(doctorId),
        shortCode: cleanCode,
        targetField,
      },
    });

    if (existing) {
      // Cập nhật lại nội dung thay vì báo lỗi gây gián đoạn
      existing.expandedText = expandedText.trim();
      existing.category = category;
      existing.isActive = true;
      await existing.save();
      return {
        errCode: 0,
        message: 'Đã cập nhật từ viết tắt sẵn có thành công!',
        data: existing,
      };
    }

    const created = await db.DoctorShorthand.create({
      doctorId: Number(doctorId),
      shortCode: cleanCode,
      expandedText: expandedText.trim(),
      targetField,
      category,
      usageCount: 1,
      isActive: true,
    });

    return {
      errCode: 0,
      message: 'Tạo từ viết tắt mới thành công!',
      data: created,
    };
  } catch (error) {
    console.error('Error creating shorthand:', error);
    return {
      errCode: 1,
      message: 'Lỗi khi tạo từ viết tắt: ' + error.message,
    };
  }
};

/**
 * 4. Cập nhật từ viết tắt
 */
const updateShorthand = async (id, data, doctorId) => {
  try {
    const item = await db.DoctorShorthand.findByPk(id);
    if (!item) {
      return {
        errCode: 2,
        message: 'Không tìm thấy từ viết tắt cần sửa.',
      };
    }

    // Chỉ cho phép sửa từ của chính mình
    if (item.doctorId && Number(item.doctorId) !== Number(doctorId)) {
      return {
        errCode: 3,
        message: 'Bạn không có quyền chỉnh sửa từ viết tắt của bác sĩ khác.',
      };
    }

    if (data.shortCode) item.shortCode = String(data.shortCode).trim().toLowerCase();
    if (data.expandedText) item.expandedText = String(data.expandedText).trim();
    if (data.targetField) item.targetField = data.targetField;
    if (data.category) item.category = data.category;
    if (typeof data.isActive === 'boolean') item.isActive = data.isActive;

    await item.save();

    return {
      errCode: 0,
      message: 'Cập nhật từ viết tắt thành công!',
      data: item,
    };
  } catch (error) {
    console.error('Error updating shorthand:', error);
    return {
      errCode: 1,
      message: 'Lỗi khi cập nhật từ viết tắt: ' + error.message,
    };
  }
};

/**
 * 5. Xóa từ viết tắt
 */
const deleteShorthand = async (id, doctorId) => {
  try {
    const item = await db.DoctorShorthand.findByPk(id);
    if (!item) {
      return {
        errCode: 2,
        message: 'Không tìm thấy từ viết tắt.',
      };
    }

    if (item.doctorId === null) {
      return {
        errCode: 3,
        message: 'Không thể xóa từ viết tắt mặc định của hệ thống y khoa.',
      };
    }

    if (Number(item.doctorId) !== Number(doctorId)) {
      return {
        errCode: 4,
        message: 'Bạn không có quyền xóa từ viết tắt của người khác.',
      };
    }

    await item.destroy();

    return {
      errCode: 0,
      message: 'Đã xóa từ viết tắt thành công!',
    };
  } catch (error) {
    console.error('Error deleting shorthand:', error);
    return {
      errCode: 1,
      message: 'Lỗi khi xóa từ viết tắt: ' + error.message,
    };
  }
};

/**
 * 6. Tăng số lần sử dụng (Track Usage Count)
 */
const recordUsage = async (id) => {
  try {
    const item = await db.DoctorShorthand.findByPk(id);
    if (item) {
      await item.increment('usageCount', { by: 1 });
    }
    return { errCode: 0 };
  } catch (error) {
    console.error('Error recording shorthand usage:', error);
    return { errCode: 1 };
  }
};

module.exports = {
  searchShorthands,
  getDoctorShorthands,
  createShorthand,
  updateShorthand,
  deleteShorthand,
  recordUsage,
};
