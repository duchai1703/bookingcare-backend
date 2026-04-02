// src/services/specialtyService.js
// ✅ [SECURITY-FIX] Sanitize HTML trước khi lưu DB (Defense-in-Depth Layer 1)
const db = require('../models');
const { sanitizeContent } = require('../utils/sanitizeHtml');
const { validateBase64Image } = require('../utils/validateBase64Image');

const createSpecialty = async (data) => {
  try {
    if (!data.name) {
      return { errCode: 1, message: 'Thiếu tên chuyên khoa!' };
    }
    // ✅ [SECURITY-FIX Phase 6] Validate Base64 image
    if (data.imageBase64) {
      const imgResult = validateBase64Image(data.imageBase64);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
    }
    await db.Specialty.create({
      name: data.name,
      image: data.imageBase64 || '',
      // ✅ [SECURITY-FIX] Sanitize descriptionHTML trước khi lưu
      descriptionHTML: sanitizeContent(data.descriptionHTML),
      descriptionMarkdown: data.descriptionMarkdown || '',
    });
    return { errCode: 0, message: 'Tạo chuyên khoa thành công!' };
  } catch (err) {
    console.error('>>> createSpecialty error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const getAllSpecialty = async () => {
  try {
    const specialties = await db.Specialty.findAll({ raw: false });
    // FIX WHITE SCREEN: Convert image BLOB → base64 string for frontend
    specialties.forEach((spec) => {
      if (spec.image) {
        spec.setDataValue('image', Buffer.from(spec.image).toString('base64'));
      }
    });
    return { errCode: 0, data: specialties };
  } catch (err) {
    console.error('>>> getAllSpecialty error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const getDetailSpecialtyById = async (id, location) => {
  try {
    if (!id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const specialty = await db.Specialty.findOne({ where: { id }, raw: false });
    if (!specialty) {
      return { errCode: 3, message: 'Không tìm thấy chuyên khoa!' };
    }
    // FIX: Convert image BLOB → base64 string
    if (specialty.image) {
      specialty.setDataValue('image', Buffer.from(specialty.image).toString('base64'));
    }
    let whereClause = { specialtyId: id };
    if (location && location !== 'ALL') {
      whereClause.provinceId = location;
    }
    const doctorInfos = await db.Doctor_Info.findAll({
      where: whereClause,
      attributes: ['doctorId', 'provinceId'],
    });
    return {
      errCode: 0,
      data: { specialty, doctorList: doctorInfos.map(d => d.doctorId) },
    };
  } catch (err) {
    console.error('>>> getDetailSpecialtyById error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// MỚI: SRS REQ-AM-016 – Chỉnh sửa chuyên khoa
const editSpecialty = async (data) => {
  try {
    if (!data.id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const specialty = await db.Specialty.findOne({ where: { id: data.id }, raw: false });
    if (!specialty) {
      return { errCode: 3, message: 'Không tìm thấy chuyên khoa!' };
    }
    specialty.name = data.name || specialty.name;
    // ✅ [SECURITY-FIX Phase 6] Validate Base64 image
    if (data.imageBase64) {
      const imgResult = validateBase64Image(data.imageBase64);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
      specialty.image = data.imageBase64;
    }
    // ✅ [SECURITY-FIX] Sanitize descriptionHTML trước khi update
    specialty.descriptionHTML = data.descriptionHTML ? sanitizeContent(data.descriptionHTML) : specialty.descriptionHTML;
    specialty.descriptionMarkdown = data.descriptionMarkdown || specialty.descriptionMarkdown;
    await specialty.save();
    return { errCode: 0, message: 'Cập nhật chuyên khoa thành công!' };
  } catch (err) {
    console.error('>>> editSpecialty error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// MỚI: SRS REQ-AM-017 – Xóa chuyên khoa
const deleteSpecialty = async (id) => {
  try {
    if (!id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const specialty = await db.Specialty.findOne({ where: { id } });
    if (!specialty) {
      return { errCode: 3, message: 'Không tìm thấy chuyên khoa!' };
    }
    await db.Specialty.destroy({ where: { id } });
    return { errCode: 0, message: 'Xóa chuyên khoa thành công!' };
  } catch (err) {
    console.error('>>> deleteSpecialty error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = { createSpecialty, getAllSpecialty, getDetailSpecialtyById, editSpecialty, deleteSpecialty };
