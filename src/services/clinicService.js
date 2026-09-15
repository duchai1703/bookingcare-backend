// src/services/clinicService.js
// ✅ [SECURITY-FIX] Sanitize HTML trước khi lưu DB (Defense-in-Depth Layer 1)
// ✅ [FIX-IMAGE] Strip prefix trước khi lưu, convert BLOB khi đọc
const db = require('../models');
const { sanitizeContent } = require('../utils/sanitizeHtml');
const { validateBase64Image } = require('../utils/validateBase64Image');
const { stripBase64Prefix } = require('../utils/stripBase64Prefix');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');

const createClinic = async (data) => {
  try {
    if (!data.name || !data.address) {
      return { errCode: 1, message: 'Thiếu tên hoặc địa chỉ phòng khám!' };
    }
    // ✅ [SECURITY-FIX Phase 6] Validate Base64 image
    if (data.imageBase64) {
      const imgResult = validateBase64Image(data.imageBase64);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
    }
    await db.Clinic.create({
      name: data.name,
      address: data.address,
      // ✅ [FIX-IMAGE] Strip prefix TRƯỚC khi lưu vào BLOB
      image: data.imageBase64 ? stripBase64Prefix(data.imageBase64) : '',
      // ✅ [SECURITY-FIX] Sanitize descriptionHTML trước khi lưu
      descriptionHTML: sanitizeContent(data.descriptionHTML),
      descriptionMarkdown: data.descriptionMarkdown || '',
    });
    return { errCode: 0, message: 'Tạo phòng khám thành công!' };
  } catch (err) {
    console.error('>>> createClinic error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const getAllClinic = async () => {
  try {
    const clinics = await db.Clinic.findAll({ raw: false });
    // ✅ [FIX-IMAGE] Convert BLOB → pure base64 (tương thích cả data cũ & mới)
    clinics.forEach((clinic) => {
      if (clinic.image) {
        clinic.setDataValue('image', convertBlobToBase64(clinic.image));
      }
    });
    return { errCode: 0, data: clinics };
  } catch (err) {
    console.error('>>> getAllClinic error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const getDetailClinicById = async (id) => {
  try {
    if (!id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const clinic = await db.Clinic.findOne({ where: { id }, raw: false });
    if (!clinic) {
      return { errCode: 3, message: 'Không tìm thấy phòng khám!' };
    }
    // ✅ [FIX-IMAGE] Convert BLOB → pure base64
    if (clinic.image) {
      clinic.setDataValue('image', convertBlobToBase64(clinic.image));
    }
    // ✅ [v4.0] Query đầy đủ thông tin bác sĩ (avatar, tên, chức danh, chuyên khoa)
    // thay vì chỉ trả về mảng doctorId
    const doctorInfos = await db.Doctor_Info.findAll({
      where: { clinicId: id },
      attributes: ['doctorId', 'specialtyId', 'description'],
      include: [
        {
          model: db.User, as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'image', 'gender', 'positionId'],
          include: [
            { model: db.Allcode, as: 'positionData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
        },
        { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name', 'image'] },
      ],
      raw: false,
      nest: true,
    });
    // Chuyển đổi từ Doctor_Info → User object (frontend cần format: {id, firstName, lastName, image, positionData, Doctor_Info: {...}})
    const specialtiesMap = new Map();
    const doctorList = doctorInfos.map(info => {
      const user = info.doctorData;
      if (user && user.image) {
        user.setDataValue('image', convertBlobToBase64(user.image));
      }

      // Tổng hợp danh sách chuyên khoa thực tế có bác sĩ tại CSYT
      const sp = info.specialtyData;
      if (sp && sp.id) {
        if (!specialtiesMap.has(sp.id)) {
          let spImg = sp.image;
          if (spImg) {
            spImg = convertBlobToBase64(spImg);
          }
          specialtiesMap.set(sp.id, {
            id: sp.id,
            name: sp.name,
            image: spImg || '',
            doctorCount: 1,
          });
        } else {
          specialtiesMap.get(sp.id).doctorCount += 1;
        }
      }

      return {
        id: user?.id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        image: user?.getDataValue('image') || '',
        positionData: user?.positionData || {},
        Doctor_Info: {
          specialtyId: info.specialtyId,
          specialtyData: info.specialtyData ? {
            id: info.specialtyData.id,
            name: info.specialtyData.name,
          } : {},
          description: info.description || '',
        },
      };
    });

    const specialties = Array.from(specialtiesMap.values());

    return {
      errCode: 0,
      data: { clinic, doctorList, specialties },
    };
  } catch (err) {
    console.error('>>> getDetailClinicById error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

const getClinicSpecialties = async (clinicId) => {
  try {
    if (!clinicId) {
      return { errCode: 1, message: 'Thiếu clinicId!' };
    }
    const doctorInfos = await db.Doctor_Info.findAll({
      where: { clinicId },
      attributes: ['specialtyId'],
      include: [
        { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name', 'image'] },
      ],
      raw: false,
      nest: true,
    });

    const specialtiesMap = new Map();
    doctorInfos.forEach(info => {
      const sp = info.specialtyData;
      if (sp && sp.id) {
        if (!specialtiesMap.has(sp.id)) {
          let spImg = sp.image;
          if (spImg) {
            spImg = convertBlobToBase64(spImg);
          }
          specialtiesMap.set(sp.id, {
            id: sp.id,
            name: sp.name,
            image: spImg || '',
            doctorCount: 1,
          });
        } else {
          specialtiesMap.get(sp.id).doctorCount += 1;
        }
      }
    });

    return {
      errCode: 0,
      data: Array.from(specialtiesMap.values()),
    };
  } catch (err) {
    console.error('>>> getClinicSpecialties error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// MỚI: SRS REQ-AM-012 – Chỉnh sửa phòng khám
const editClinic = async (data) => {
  try {
    if (!data.id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const clinic = await db.Clinic.findOne({ where: { id: data.id }, raw: false });
    if (!clinic) {
      return { errCode: 3, message: 'Không tìm thấy phòng khám!' };
    }
    clinic.name = data.name || clinic.name;
    clinic.address = data.address || clinic.address;
    // ✅ [SECURITY-FIX Phase 6] Validate Base64 image
    if (data.imageBase64) {
      const imgResult = validateBase64Image(data.imageBase64);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
      // ✅ [FIX-IMAGE] Strip prefix trước khi lưu
      clinic.image = stripBase64Prefix(data.imageBase64);
    }
    // ✅ [SECURITY-FIX] Sanitize descriptionHTML trước khi update
    clinic.descriptionHTML = data.descriptionHTML ? sanitizeContent(data.descriptionHTML) : clinic.descriptionHTML;
    clinic.descriptionMarkdown = data.descriptionMarkdown || clinic.descriptionMarkdown;
    await clinic.save();
    return { errCode: 0, message: 'Cập nhật phòng khám thành công!' };
  } catch (err) {
    console.error('>>> editClinic error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// MỚI: SRS REQ-AM-013 – Xóa phòng khám
const deleteClinic = async (id) => {
  try {
    if (!id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const clinic = await db.Clinic.findOne({ where: { id } });
    if (!clinic) {
      return { errCode: 3, message: 'Không tìm thấy phòng khám!' };
    }
    await db.Clinic.destroy({ where: { id } });
    return { errCode: 0, message: 'Xóa phòng khám thành công!' };
  } catch (err) {
    console.error('>>> deleteClinic error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = { createClinic, getAllClinic, getDetailClinicById, getClinicSpecialties, editClinic, deleteClinic };
