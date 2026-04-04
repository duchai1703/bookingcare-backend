// src/services/userService.js
const db = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateBase64Image } = require('../utils/validateBase64Image');
const { stripBase64Prefix } = require('../utils/stripBase64Prefix');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');
// FIX BE-05: đã xóa genSaltSync — dùng bcrypt.hash() async trực tiếp

// ===== LOGIN + JWT TOKEN (SRS REQ-AU-001, 002, 007, 009) =====
const handleUserLogin = async (email, password) => {
  try {
    const user = await db.User.findOne({ where: { email }, raw: true });
    if (!user) {
      return { errCode: 1, message: 'Email không tồn tại trong hệ thống!' };
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { errCode: 3, message: 'Sai mật khẩu!' };
    }

    // ✅ [SECURITY-FIX Phase 5] JWT Hardening: Giảm thời gian sống từ 24h → 2h
    const token = jwt.sign(
      { id: user.id, email: user.email, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    return {
      errCode: 0,
      message: 'OK',
      user: {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      accessToken: token, // Frontend lưu vào Redux store
    };
  } catch (err) {
    console.error('>>> Login error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== GET ALL USERS (SRS REQ-AM-001) =====
const getAllUsers = async (id) => {
  try {
    let users;
    if (id === 'ALL') {
      users = await db.User.findAll({
        attributes: { exclude: ['password'] },
        raw: false,
      });
    } else {
      users = await db.User.findOne({
        where: { id },
        attributes: { exclude: ['password'] },
        raw: false,
      });
    }
    // ✅ [FIX-IMAGE] Convert BLOB → pure base64 (tương thích cả data cũ & mới)
    const convertImage = (user) => {
      if (user && user.image) {
        user.setDataValue('image', convertBlobToBase64(user.image));
      }
      return user;
    };
    if (Array.isArray(users)) {
      users.forEach(convertImage);
    } else if (users) {
      convertImage(users);
    }
    return { errCode: 0, message: 'OK', data: users };
  } catch (err) {
    console.error('>>> getAllUsers error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== CREATE NEW USER (SRS REQ-AM-002, REQ-AU-002) =====
const createNewUser = async (data) => {
  try {
    if (!data.email || !data.password || !data.firstName || !data.lastName || !data.roleId) {
      return { errCode: 1, message: 'Thiếu tham số bắt buộc!' };
    }
    const exist = await db.User.findOne({ where: { email: data.email } });
    if (exist) {
      return { errCode: 2, message: 'Email đã tồn tại!' };
    }
    // ✅ [SECURITY-FIX] Validate Base64 image trước khi lưu
    if (data.image) {
      const imgResult = validateBase64Image(data.image);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
    }
    const hashedPassword = await bcrypt.hash(data.password, 10); // FIX BE-05: async hash
    await db.User.create({
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      address: data.address || '',
      phoneNumber: data.phoneNumber || '',
      gender: data.gender || '',
      roleId: data.roleId,
      // ✅ [FIX-IMAGE] Strip prefix trước khi lưu vào BLOB
      image: data.image ? stripBase64Prefix(data.image) : '',
      positionId: data.positionId || '',
    });
    return { errCode: 0, message: 'Tạo người dùng thành công!' };
  } catch (err) {
    console.error('>>> createNewUser error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== EDIT USER (SRS REQ-AM-003) =====
const editUser = async (data) => {
  try {
    if (!data.id) {
      return { errCode: 1, message: 'Thiếu tham số id!' };
    }
    const user = await db.User.findOne({ where: { id: data.id }, raw: false });
    if (!user) {
      return { errCode: 3, message: 'Không tìm thấy người dùng!' };
    }
    user.firstName = data.firstName || user.firstName;
    user.lastName = data.lastName || user.lastName;
    user.address = data.address || user.address;
    user.phoneNumber = data.phoneNumber || user.phoneNumber;
    user.gender = data.gender || user.gender;
    user.roleId = data.roleId || user.roleId;
    user.positionId = data.positionId || user.positionId;
    if (data.image) {
      // ✅ [SECURITY-FIX] Validate Base64 image trước khi lưu
      const imgResult = validateBase64Image(data.image);
      if (!imgResult.isValid) {
        return { errCode: 4, message: imgResult.error };
      }
      // ✅ [FIX-IMAGE] Strip prefix trước khi lưu
      user.image = stripBase64Prefix(data.image);
    }
    await user.save();
    return { errCode: 0, message: 'Cập nhật thành công!' };
  } catch (err) {
    console.error('>>> editUser error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== DELETE USER (SRS REQ-AM-004) =====
const deleteUser = async (id, requesterId) => {
  try {
    // FIX BE-10 Guard 1: Admin không tự xóa mình
    if (requesterId && String(id) === String(requesterId)) {
      return { errCode: 5, message: 'Không thể tự xóa tài khoản của chính mình!' };
    }
    const user = await db.User.findOne({ where: { id } });
    if (!user) {
      return { errCode: 3, message: 'Không tìm thấy người dùng!' };
    }
    // FIX BE-10 Guard 2: Bác sĩ đang có booking chưa xử lý
    if (user.roleId === 'R2') {
      const { Op } = require('sequelize');
      const activeBooking = await db.Booking.findOne({
        where: { doctorId: id, statusId: { [Op.in]: ['S1', 'S2'] } },
      });
      if (activeBooking) {
        return { errCode: 6, message: 'Bác sĩ đang có lịch hẹn chưa hoàn thành, không thể xóa!' };
      }
    }
    await db.User.destroy({ where: { id } });
    return { errCode: 0, message: 'Xóa người dùng thành công!' };
  } catch (err) {
    console.error('>>> deleteUser error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== GET ALLCODE (SRS Section 4.2) =====
const getAllCodeService = async (type) => {
  try {
    if (!type) {
      return { errCode: 1, message: 'Thiếu tham số type!' };
    }
    const allcodes = await db.Allcode.findAll({ where: { type } });
    return { errCode: 0, message: 'OK', data: allcodes };
  } catch (err) {
    console.error('>>> getAllCode error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

// ===== MỚI: SEARCH (SRS REQ-PT-002) =====
const searchService = async (keyword) => {
  try {
    const { Op } = require('sequelize');
    const likeQuery = { [Op.like]: `%${keyword}%` };

    // Tìm bác sĩ theo tên
    // FIX BE-11: CONCAT để tìm tên đầy đủ ("Nguyen Van A" khớp cả firstName lẫn lastName)
    const doctors = await db.User.findAll({
      where: {
        roleId: 'R2',
        [Op.or]: [
          db.Sequelize.where(
            db.Sequelize.fn('CONCAT', db.Sequelize.col('lastName'), ' ', db.Sequelize.col('firstName')),
            { [Op.like]: `%${keyword.trim()}%` }
          ),
          db.Sequelize.where(
            db.Sequelize.fn('CONCAT', db.Sequelize.col('firstName'), ' ', db.Sequelize.col('lastName')),
            { [Op.like]: `%${keyword.trim()}%` }
          ),
        ],
      },
      attributes: ['id', 'firstName', 'lastName', 'image'],
      include: [
        { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
      ],
      raw: false,
      nest: true,
    });
    // ✅ [FIX-IMAGE] Convert BLOB → base64 cho kết quả tìm kiếm
    doctors.forEach((doc) => {
      if (doc.image) {
        doc.setDataValue('image', convertBlobToBase64(doc.image));
      }
    });

    // Tìm chuyên khoa theo tên
    const specialties = await db.Specialty.findAll({
      where: { name: likeQuery },
      attributes: ['id', 'name', 'image'],
      raw: false,
    });
    // ✅ [FIX-IMAGE] Convert BLOB → base64 cho kết quả tìm kiếm
    specialties.forEach((spec) => {
      if (spec.image) {
        spec.setDataValue('image', convertBlobToBase64(spec.image));
      }
    });

    // Tìm phòng khám theo tên
    const clinics = await db.Clinic.findAll({
      where: {
        [Op.or]: [
          { name: likeQuery },
          { address: likeQuery },
        ],
      },
      attributes: ['id', 'name', 'address', 'image'],
      raw: false,
    });
    // ✅ [FIX-IMAGE] Convert BLOB → base64 cho kết quả tìm kiếm
    clinics.forEach((clinic) => {
      if (clinic.image) {
        clinic.setDataValue('image', convertBlobToBase64(clinic.image));
      }
    });

    return {
      errCode: 0,
      data: { doctors, specialties, clinics },
    };
  } catch (err) {
    console.error('>>> searchService error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};

module.exports = {
  handleUserLogin,
  getAllUsers,
  createNewUser,
  editUser,
  deleteUser,
  getAllCodeService,
  searchService,
};
