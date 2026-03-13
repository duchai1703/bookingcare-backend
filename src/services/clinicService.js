// src/services/clinicService.js
const db = require('../models');

const createClinic = async (data) => {
  try {
    if (!data.name || !data.address) {
      return { errCode: 1, message: 'Thiếu tên hoặc địa chỉ phòng khám!' };
    }
    await db.Clinic.create({
      name: data.name,
      address: data.address,
      image: data.imageBase64 || '',
      descriptionHTML: data.descriptionHTML || '',
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
    const clinics = await db.Clinic.findAll();
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
    const clinic = await db.Clinic.findOne({ where: { id } });
    if (!clinic) {
      return { errCode: 3, message: 'Không tìm thấy phòng khám!' };
    }
    const doctorInfos = await db.Doctor_Info.findAll({
      where: { clinicId: id },
      attributes: ['doctorId'],
    });
    return {
      errCode: 0,
      data: { clinic, doctorList: doctorInfos.map(d => d.doctorId) },
    };
  } catch (err) {
    console.error('>>> getDetailClinicById error:', err);
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
    if (data.imageBase64) {
      clinic.image = data.imageBase64;
    }
    clinic.descriptionHTML = data.descriptionHTML || clinic.descriptionHTML;
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

module.exports = { createClinic, getAllClinic, getDetailClinicById, editClinic, deleteClinic };
