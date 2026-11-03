// src/services/familyMemberService.js
// Quản lý Hồ sơ Sổ Y Bạ Người thân (HL7 FHIR RelatedPerson)
const db = require('../models');

/**
 * Chuẩn hóa giá trị giới tính về enum AllCode G1, G2, G3
 * Đồng bộ hai chiều giữa Web Portal (MALE/FEMALE/OTHER) và DB/Chatbot (G1/G2/G3)
 */
const normalizeGender = (gender) => {
  if (gender === null || gender === undefined) return null;
  const str = String(gender).trim();
  if (!str) return null;
  const gUpper = str.toUpperCase();
  if (['G1', 'MALE', 'M', 'NAM'].includes(gUpper)) return 'G1';
  if (['G2', 'FEMALE', 'F', 'NỮ', 'NU'].includes(gUpper)) return 'G2';
  if (['G3', 'OTHER', 'KHÁC', 'KHAC'].includes(gUpper)) return 'G3';
  return null;
};

/**
 * Lấy danh sách hồ sơ người thân của một tài khoản bệnh nhân
 * @param {number} userId - ID người dùng hiện tại (req.user.id)
 */
const getFamilyMembers = async (userId) => {
  try {
    if (!userId) {
      return { errCode: 1, message: 'Thiếu mã người dùng hợp lệ!' };
    }

    const members = await db.Family_Member.findAll({
      where: { userId },
      order: [
        ['isPrimary', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    });

    return {
      errCode: 0,
      message: 'Lấy danh sách người thân thành công!',
      data: members,
    };
  } catch (error) {
    console.error('getFamilyMembers error:', error);
    return { errCode: -1, message: 'Lỗi server khi lấy danh sách người thân!' };
  }
};

/**
 * Lấy chi tiết một hồ sơ người thân theo ID (Bảo vệ IDOR)
 * @param {number} userId - ID người dùng hiện tại
 * @param {number} memberId - ID hồ sơ người thân
 */
const getFamilyMemberById = async (userId, memberId) => {
  try {
    if (!userId || !memberId) {
      return { errCode: 1, message: 'Thiếu thông tin người dùng hoặc hồ sơ!' };
    }

    const member = await db.Family_Member.findOne({
      where: { id: memberId, userId },
    });

    if (!member) {
      return { errCode: 2, message: 'Hồ sơ người thân không tồn tại hoặc không thuộc quyền quản lý của bạn!' };
    }

    return {
      errCode: 0,
      message: 'Lấy chi tiết hồ sơ người thân thành công!',
      data: member,
    };
  } catch (error) {
    console.error('getFamilyMemberById error:', error);
    return { errCode: -1, message: 'Lỗi server khi lấy chi tiết người thân!' };
  }
};

/**
 * Tạo mới hồ sơ người thân trong sổ y bạ gia đình
 * @param {number} userId - ID người dùng hiện tại
 * @param {object} data - Dữ liệu hồ sơ
 */
const createFamilyMember = async (userId, data) => {
  try {
    if (!userId) {
      return { errCode: 1, message: 'Vui lòng đăng nhập để thực hiện thao tác!' };
    }

    const { fullName, relationship, gender, birthday, phoneNumber, address, nationalId, medicalHistory, notes } = data;

    if (!fullName || !fullName.trim()) {
      return { errCode: 1, message: 'Họ và tên người thân là bắt buộc!' };
    }

    const validRelationships = ['CHILD', 'PARENT', 'SPOUSE', 'OTHER'];
    const rel = validRelationships.includes(relationship) ? relationship : 'OTHER';

    const normalizedGender = normalizeGender(gender);

    const newMember = await db.Family_Member.create({
      userId,
      fullName: fullName.trim(),
      relationship: rel,
      gender: normalizedGender,
      birthday: birthday || null,
      phoneNumber: phoneNumber ? phoneNumber.trim() : null,
      address: address ? address.trim() : null,
      nationalId: nationalId ? nationalId.trim() : null,
      medicalHistory: medicalHistory ? medicalHistory.trim() : null,
      notes: notes ? notes.trim() : null,
      isPrimary: false,
    });

    return {
      errCode: 0,
      message: 'Thêm hồ sơ người thân vào sổ y bạ thành công!',
      data: newMember,
    };
  } catch (error) {
    console.error('createFamilyMember error:', error);
    return { errCode: -1, message: 'Lỗi server khi thêm hồ sơ người thân!' };
  }
};

/**
 * Cập nhật thông tin hồ sơ người thân (Bảo vệ IDOR)
 * @param {number} userId - ID người dùng hiện tại
 * @param {number} memberId - ID hồ sơ người thân
 * @param {object} data - Dữ liệu cập nhật
 */
const updateFamilyMember = async (userId, memberId, data) => {
  try {
    if (!userId || !memberId) {
      return { errCode: 1, message: 'Thiếu thông tin người dùng hoặc hồ sơ!' };
    }

    const member = await db.Family_Member.findOne({
      where: { id: memberId, userId },
    });

    if (!member) {
      return { errCode: 2, message: 'Hồ sơ người thân không tồn tại hoặc không thuộc quyền quản lý!' };
    }

    const { fullName, relationship, gender, birthday, phoneNumber, address, nationalId, medicalHistory, notes, isPrimary } = data;

    if (fullName !== undefined) member.fullName = fullName.trim();
    if (relationship !== undefined) {
      const validRelationships = ['CHILD', 'PARENT', 'SPOUSE', 'OTHER'];
      member.relationship = validRelationships.includes(relationship) ? relationship : 'OTHER';
    }
    if (gender !== undefined) {
      member.gender = normalizeGender(gender);
    }
    if (birthday !== undefined) member.birthday = birthday;
    if (phoneNumber !== undefined) member.phoneNumber = phoneNumber ? phoneNumber.trim() : null;
    if (address !== undefined) member.address = address ? address.trim() : null;
    if (nationalId !== undefined) member.nationalId = nationalId ? nationalId.trim() : null;
    if (medicalHistory !== undefined) member.medicalHistory = medicalHistory ? medicalHistory.trim() : null;
    if (notes !== undefined) member.notes = notes ? notes.trim() : null;
    if (isPrimary !== undefined) member.isPrimary = Boolean(isPrimary);

    await member.save();

    return {
      errCode: 0,
      message: 'Cập nhật hồ sơ người thân thành công!',
      data: member,
    };
  } catch (error) {
    console.error('updateFamilyMember error:', error);
    return { errCode: -1, message: 'Lỗi server khi cập nhật hồ sơ người thân!' };
  }
};

/**
 * Xóa một hồ sơ người thân (Bảo vệ IDOR)
 * @param {number} userId - ID người dùng hiện tại
 * @param {number} memberId - ID hồ sơ người thân
 */
const deleteFamilyMember = async (userId, memberId) => {
  try {
    if (!userId || !memberId) {
      return { errCode: 1, message: 'Thiếu thông tin người dùng hoặc hồ sơ!' };
    }

    const member = await db.Family_Member.findOne({
      where: { id: memberId, userId },
    });

    if (!member) {
      return { errCode: 2, message: 'Hồ sơ người thân không tồn tại hoặc không thuộc quyền quản lý!' };
    }

    await member.destroy();

    return {
      errCode: 0,
      message: 'Đã xóa hồ sơ người thân khỏi sổ y bạ!',
    };
  } catch (error) {
    console.error('deleteFamilyMember error:', error);
    return { errCode: -1, message: 'Lỗi server khi xóa hồ sơ người thân!' };
  }
};

module.exports = {
  getFamilyMembers,
  getFamilyMemberById,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  normalizeGender,
};
