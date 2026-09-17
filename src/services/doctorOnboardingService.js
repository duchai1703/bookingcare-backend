const db = require('../models/index');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

/**
 * Tính điểm độ hoàn thiện hồ sơ bác sĩ (0 - 100%)
 */
const calculateCompletenessScore = (data) => {
  let score = 0;
  // Nhóm 1: Định danh & Thông tin cá nhân (30 điểm)
  if (data.email && data.phoneNumber) score += 10;
  if (data.firstName && data.lastName) score += 10;
  if (data.gender && data.birthday) score += 5;
  if (data.avatar) score += 5;

  // Nhóm 2: Chuyên môn & Chứng chỉ (40 điểm)
  if (data.specialtyId) score += 10;
  if (data.licenseNumber) score += 10;
  if (data.licenseIssueDate && data.licenseIssuePlace) score += 5;
  if (Array.isArray(data.licenseImages) && data.licenseImages.length > 0) score += 10;
  if (data.qualificationDegree) score += 5;

  // Nhóm 3: Nơi công tác & Tài chính (30 điểm)
  if (data.clinicId) score += 10;
  if (data.proposedRoom) score += 5;
  if (data.priceId) score += 5;
  if (data.bankAccountNumber && data.bankName && data.bankAccountName) score += 10;

  return Math.min(score, 100);
};

/**
 * Phân tích và phát hiện các rủi ro hệ thống (Risk Flags)
 */
const detectRiskFlags = async (data, existingDoctorInfo) => {
  const flags = [];

  // 1. Cảnh báo thiếu ảnh chứng chỉ hành nghề
  if (!Array.isArray(data.licenseImages) || data.licenseImages.length === 0) {
    flags.push({
      code: 'MISSING_LICENSE_IMAGE',
      level: 'HIGH',
      message: 'Chưa tải lên bản scan Giấy phép hành nghề / Chứng chỉ chuyên môn',
    });
  }

  // 2. Cảnh báo tên chủ tài khoản ngân hàng không trùng khớp họ tên
  if (data.bankAccountName && data.firstName && data.lastName) {
    const fullNameNorm = `${data.lastName} ${data.firstName}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const bankNorm = data.bankAccountName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nameParts = fullNameNorm.split(' ').filter(Boolean);
    const hasAnyMatch = nameParts.some(part => bankNorm.includes(part));
    if (!hasAnyMatch) {
      flags.push({
        code: 'BANK_NAME_MISMATCH',
        level: 'MEDIUM',
        message: 'Tên chủ tài khoản ngân hàng không có thành phần trùng khớp với họ tên bác sĩ',
      });
    }
  }

  // 3. Cảnh báo trùng số Giấy phép hành nghề với bác sĩ đang hoạt động
  if (data.licenseNumber) {
    const duplicateLicense = await db.Doctor_Onboarding_Request.findOne({
      where: {
        licenseNumber: data.licenseNumber,
        status: 'APPROVED',
        ...(data.id ? { id: { [Op.ne]: data.id } } : {})
      }
    });
    if (duplicateLicense) {
      flags.push({
        code: 'DUPLICATE_LICENSE',
        level: 'CRITICAL',
        message: `Số CCHN ${data.licenseNumber} đã được cấp và kích hoạt cho một bác sĩ khác trên hệ thống`,
      });
    }
  }

  // 4. Cảnh báo kinh nghiệm hành nghề dưới 1 năm
  if (Number(data.experienceYears) < 1) {
    flags.push({
      code: 'LOW_EXPERIENCE',
      level: 'LOW',
      message: 'Thời gian kinh nghiệm khai báo dưới 1 năm, cần kiểm tra kỹ văn bằng',
    });
  }

  return flags;
};

/**
 * Ánh xạ học hàm / học vị sang mã Allcode Position
 */
const mapPositionId = (degree) => {
  if (!degree) return 'P0';
  const degLower = degree.toLowerCase();
  if (degLower.includes('giáo sư') || degLower.includes('gs')) return 'P4';
  if (degLower.includes('phó giáo sư') || degLower.includes('pgs')) return 'P3';
  if (degLower.includes('tiến sĩ') || degLower.includes('ts')) return 'P2';
  if (degLower.includes('thạc sĩ') || degLower.includes('ths') || degLower.includes('ck2')) return 'P1';
  return 'P0'; // Bác sĩ
};

/**
 * Chuẩn hóa gender sang Allcode G1 (Nam), G2 (Nữ), G3 (Khác)
 */
const normalizeGender = (gender) => {
  if (!gender) return 'G1';
  const g = String(gender).toUpperCase();
  if (g === 'G1' || g === 'M' || g === 'MALE' || g === 'NAM') return 'G1';
  if (g === 'G2' || g === 'F' || g === 'FEMALE' || g === 'NỮ' || g === 'NU') return 'G2';
  return 'G3';
};

/**
 * Bác sĩ nộp hoặc cập nhật hồ sơ đăng ký tự phục vụ
 */
const submitOnboarding = async (data) => {
  try {
    if (!data.email || !data.phoneNumber || !data.firstName || !data.lastName) {
      return {
        errCode: 1,
        message: 'Thiếu các thông tin bắt buộc: Họ tên, Email, Số điện thoại!',
      };
    }
    if (!data.specialtyId || !data.clinicId) {
      return {
        errCode: 1,
        message: 'Vui lòng chọn Chuyên khoa chính và Cơ sở y tế làm việc từ danh mục hệ thống!',
      };
    }
    if (!data.licenseNumber) {
      return {
        errCode: 1,
        message: 'Vui lòng cung cấp số Giấy phép hành nghề / Chứng chỉ hành nghề y tế (CCHN)!',
      };
    }

    // Kiểm tra xem email đã được kích hoạt làm Bác sĩ chính thức chưa
    const existingUser = await db.User.findOne({
      where: { email: data.email, roleId: 'R2' }
    });
    if (existingUser) {
      return {
        errCode: 2,
        message: 'Email này đã tồn tại tài khoản Bác sĩ đang hoạt động trong hệ thống!',
      };
    }

    // Tính điểm hoàn thiện & phát hiện rủi ro
    const completenessScore = calculateCompletenessScore(data);
    const riskFlags = await detectRiskFlags(data);

    // Hash mật khẩu
    let hashedPassword = null;
    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10);
    }

    // Kiểm tra xem đã có request nào trước đó chưa
    let request = await db.Doctor_Onboarding_Request.findOne({
      where: { email: data.email }
    });

    const payload = {
      email: data.email,
      phoneNumber: data.phoneNumber,
      ...(hashedPassword ? { password: hashedPassword } : {}),
      firstName: data.firstName,
      lastName: data.lastName,
      gender: normalizeGender(data.gender),
      birthday: data.birthday || null,
      address: data.address || null,
      nationalId: data.nationalId || null,
      avatar: data.avatar || null,
      specialtyId: Number(data.specialtyId),
      subSpecialtyIds: Array.isArray(data.subSpecialtyIds) ? data.subSpecialtyIds : [],
      licenseNumber: data.licenseNumber,
      licenseIssueDate: data.licenseIssueDate || null,
      licenseIssuePlace: data.licenseIssuePlace || null,
      licenseImages: Array.isArray(data.licenseImages) ? data.licenseImages : [],
      qualificationDegree: data.qualificationDegree || 'Bác sĩ đa khoa',
      experienceYears: Number(data.experienceYears) || 0,
      bioDescription: data.bioDescription || null,
      clinicId: Number(data.clinicId),
      proposedRoom: data.proposedRoom || null,
      priceId: data.priceId || 'PRI1',
      bankAccountNumber: data.bankAccountNumber || null,
      bankName: data.bankName || null,
      bankAccountName: data.bankAccountName || null,
      completenessScore,
      riskFlags,
      status: 'SUBMITTED', // Gửi thẩm định
      adminFeedback: null,
      requiredFields: [],
    };

    if (request) {
      if (request.status === 'APPROVED') {
        return {
          errCode: 3,
          message: 'Hồ sơ này đã được Admin phê duyệt trước đó, không thể nộp lại!',
        };
      }
      await request.update(payload);
    } else {
      if (!data.password) {
        return {
          errCode: 1,
          message: 'Vui lòng thiết lập mật khẩu bảo vệ tài khoản!',
        };
      }
      request = await db.Doctor_Onboarding_Request.create(payload);
    }

    return {
      errCode: 0,
      message: 'Hồ sơ đăng ký Bác sĩ đã được tiếp nhận và đưa vào hàng chờ thẩm định của Admin!',
      data: {
        requestId: request.id,
        status: request.status,
        completenessScore: request.completenessScore,
        riskFlags: request.riskFlags,
        submittedAt: request.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error in submitOnboarding:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi nộp hồ sơ đăng ký bác sĩ: ' + error.message,
    };
  }
};

/**
 * Tra cứu trạng thái hồ sơ của bác sĩ theo Email hoặc ID
 */
const getOnboardingStatus = async (identifier) => {
  try {
    const isNum = !isNaN(identifier);
    const where = isNum ? { id: identifier } : { email: identifier };

    const request = await db.Doctor_Onboarding_Request.findOne({
      where,
      include: [
        { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
        { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
      ],
      attributes: { exclude: ['password'] },
    });

    if (!request) {
      return {
        errCode: 1,
        message: 'Không tìm thấy thông tin hồ sơ đăng ký!',
      };
    }

    return {
      errCode: 0,
      data: request,
    };
  } catch (error) {
    console.error('Error in getOnboardingStatus:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi tra cứu hồ sơ: ' + error.message,
    };
  }
};

/**
 * Lấy hàng đợi thẩm định hồ sơ (Verification Queue) cho Admin
 */
const getVerificationQueue = async (query = {}) => {
  try {
    const { status = 'ALL', search = '', page = 1, limit = 10 } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      where[Op.or] = [
        { firstName: { [Op.iLike]: searchTerm } },
        { lastName: { [Op.iLike]: searchTerm } },
        { email: { [Op.iLike]: searchTerm } },
        { phoneNumber: { [Op.iLike]: searchTerm } },
        { licenseNumber: { [Op.iLike]: searchTerm } },
      ];
    }

    // Đếm tổng số lượng theo từng trạng thái để làm badge tab
    const [allCount, submittedCount, changesCount, approvedCount, rejectedCount] = await Promise.all([
      db.Doctor_Onboarding_Request.count(),
      db.Doctor_Onboarding_Request.count({ where: { status: 'SUBMITTED' } }),
      db.Doctor_Onboarding_Request.count({ where: { status: 'CHANGES_REQUESTED' } }),
      db.Doctor_Onboarding_Request.count({ where: { status: 'APPROVED' } }),
      db.Doctor_Onboarding_Request.count({ where: { status: 'REJECTED' } }),
    ]);

    const { count, rows } = await db.Doctor_Onboarding_Request.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [
        ['status', 'ASC'], // Ưu tiên các status cần xử lý
        ['updatedAt', 'DESC'],
      ],
      include: [
        { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
        { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
        { model: db.Allcode, as: 'priceTypeData', attributes: ['keyMap', 'valueEn', 'valueVi'] },
        { model: db.User, as: 'reviewerData', attributes: ['id', 'firstName', 'lastName', 'email'] },
      ],
      attributes: { exclude: ['password'] },
    });

    return {
      errCode: 0,
      data: {
        totalItems: count,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        items: rows,
        summary: {
          all: allCount,
          submitted: submittedCount,
          changesRequested: changesCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
      },
    };
  } catch (error) {
    console.error('Error in getVerificationQueue:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi lấy hàng đợi thẩm định: ' + error.message,
    };
  }
};

/**
 * Lấy chi tiết một hồ sơ thẩm định cho Admin
 */
const getOnboardingDetail = async (id) => {
  try {
    const request = await db.Doctor_Onboarding_Request.findByPk(id, {
      include: [
        { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
        { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address', 'phone'] },
        { model: db.Allcode, as: 'priceTypeData', attributes: ['keyMap', 'valueEn', 'valueVi'] },
        { model: db.User, as: 'reviewerData', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: db.User, as: 'approvedDoctorData', attributes: ['id', 'firstName', 'lastName', 'email', 'roleId'] },
      ],
      attributes: { exclude: ['password'] },
    });

    if (!request) {
      return {
        errCode: 1,
        message: 'Không tìm thấy hồ sơ thẩm định!',
      };
    }

    return {
      errCode: 0,
      data: request,
    };
  } catch (error) {
    console.error('Error in getOnboardingDetail:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi lấy chi tiết hồ sơ: ' + error.message,
    };
  }
};

/**
 * Admin yêu cầu bác sĩ bổ sung / sửa đổi thông tin (Request Changes)
 */
const requestChanges = async (id, { feedback, requiredFields = [] }, adminId) => {
  try {
    const request = await db.Doctor_Onboarding_Request.findByPk(id);
    if (!request) {
      return { errCode: 1, message: 'Không tìm thấy hồ sơ yêu cầu!' };
    }
    if (request.status === 'APPROVED') {
      return { errCode: 2, message: 'Hồ sơ đã được phê duyệt trước đó, không thể yêu cầu sửa đổi!' };
    }

    await request.update({
      status: 'CHANGES_REQUESTED',
      adminFeedback: feedback || 'Vui lòng bổ sung giấy tờ và thông tin chứng chỉ còn thiếu.',
      requiredFields: Array.isArray(requiredFields) ? requiredFields : [],
      reviewedBy: adminId || null,
      reviewedAt: new Date(),
    });

    return {
      errCode: 0,
      message: 'Đã gửi yêu cầu bổ sung hồ sơ tới Bác sĩ thành công!',
      data: request,
    };
  } catch (error) {
    console.error('Error in requestChanges:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi yêu cầu bổ sung hồ sơ: ' + error.message,
    };
  }
};

/**
 * Admin từ chối hồ sơ đăng ký (Reject)
 */
const rejectOnboarding = async (id, { reason }, adminId) => {
  try {
    const request = await db.Doctor_Onboarding_Request.findByPk(id);
    if (!request) {
      return { errCode: 1, message: 'Không tìm thấy hồ sơ yêu cầu!' };
    }
    if (request.status === 'APPROVED') {
      return { errCode: 2, message: 'Hồ sơ đã được phê duyệt trước đó, không thể từ chối!' };
    }

    await request.update({
      status: 'REJECTED',
      adminFeedback: reason || 'Hồ sơ không đáp ứng đủ tiêu chuẩn thẩm định chuyên môn.',
      reviewedBy: adminId || null,
      reviewedAt: new Date(),
    });

    return {
      errCode: 0,
      message: 'Đã từ chối hồ sơ đăng ký của Bác sĩ!',
      data: request,
    };
  } catch (error) {
    console.error('Error in rejectOnboarding:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi từ chối hồ sơ: ' + error.message,
    };
  }
};

/**
 * Admin Phê duyệt hồ sơ & Kích hoạt tài khoản Bác sĩ (Auto-Provisioning Transaction)
 */
const approveOnboarding = async (id, adminId) => {
  const transaction = await db.sequelize.transaction();
  try {
    const request = await db.Doctor_Onboarding_Request.findByPk(id, { transaction });
    if (!request) {
      await transaction.rollback();
      return { errCode: 1, message: 'Không tìm thấy hồ sơ yêu cầu!' };
    }
    if (request.status === 'APPROVED') {
      await transaction.rollback();
      return { errCode: 2, message: 'Hồ sơ này đã được phê duyệt và kích hoạt trước đó!' };
    }

    // 1. Tạo hoặc kích hoạt tài khoản User với role Bác sĩ (R2)
    let user = await db.User.findOne({
      where: { email: request.email },
      transaction,
    });

    const positionId = mapPositionId(request.qualificationDegree);

    if (user) {
      await user.update({
        firstName: request.firstName,
        lastName: request.lastName,
        phoneNumber: request.phoneNumber,
        address: request.address,
        gender: normalizeGender(request.gender),
        birthday: request.birthday || null,
        roleId: 'R2', // Đảm bảo role Bác sĩ
        positionId: positionId,
        ...(request.avatar ? { image: Buffer.from(request.avatar, 'base64') } : {}),
      }, { transaction });
    } else {
      user = await db.User.create({
        email: request.email,
        password: request.password, // Đã hash lúc submit
        firstName: request.firstName,
        lastName: request.lastName,
        phoneNumber: request.phoneNumber,
        address: request.address,
        gender: normalizeGender(request.gender),
        birthday: request.birthday || null,
        roleId: 'R2',
        positionId: positionId,
        image: request.avatar ? Buffer.from(request.avatar, 'base64') : null,
      }, { transaction });
    }

    // 2. Tạo hoặc liên kết hồ sơ Doctor_Info
    const [doctorInfo] = await db.Doctor_Info.findOrCreate({
      where: { doctorId: user.id },
      defaults: {
        doctorId: user.id,
        specialtyId: request.specialtyId,
        clinicId: request.clinicId,
        priceId: request.priceId || 'PRI1',
        provinceId: 'PRO1',
        paymentId: 'PAY1',
        note: `Số CCHN: ${request.licenseNumber} - Nơi cấp: ${request.licenseIssuePlace || 'Sở Y tế'}`,
        description: request.bioDescription || `Bác sĩ ${request.qualificationDegree || ''} ${request.lastName} ${request.firstName}`,
        commissionRate: 15.00,
        workingStatus: 'active',
        bankAccountNumber: request.bankAccountNumber,
        bankName: request.bankName,
        bankAccountName: request.bankAccountName,
      },
      transaction,
    });

    // Cập nhật lại nếu đã tồn tại
    if (doctorInfo) {
      await doctorInfo.update({
        specialtyId: request.specialtyId,
        clinicId: request.clinicId,
        priceId: request.priceId || 'PRI1',
        note: `Số CCHN: ${request.licenseNumber} - Nơi cấp: ${request.licenseIssuePlace || 'Sở Y tế'}`,
        workingStatus: 'active',
        bankAccountNumber: request.bankAccountNumber,
        bankName: request.bankName,
        bankAccountName: request.bankAccountName,
      }, { transaction });
    }

    // 3. Đảm bảo cấu trúc Clinic_Specialty tồn tại
    let clinicSpecialty = null;
    if (db.Clinic_Specialty) {
      const [cs] = await db.Clinic_Specialty.findOrCreate({
        where: {
          clinicId: request.clinicId,
          specialtyId: request.specialtyId,
        },
        defaults: {
          clinicId: request.clinicId,
          specialtyId: request.specialtyId,
          status: 'active',
          description: `Chuyên khoa triển khai tại cơ sở y tế`,
        },
        transaction,
      });
      clinicSpecialty = cs;
    }

    // 4. Tạo hoặc liên kết phân bổ cơ sở làm việc Doctor_Assignment
    if (db.Doctor_Assignment) {
      const [assignment] = await db.Doctor_Assignment.findOrCreate({
        where: {
          doctorId: user.id,
          clinicId: request.clinicId,
          specialtyId: request.specialtyId,
        },
        defaults: {
          doctorId: user.id,
          clinicId: request.clinicId,
          specialtyId: request.specialtyId,
          clinicSpecialtyId: clinicSpecialty ? clinicSpecialty.id : null,
          roomNumber: request.proposedRoom || 'Phòng khám đa khoa',
          priceId: request.priceId || 'PRI1',
          commissionRate: 15.00,
          workingStatus: 'active',
          isPrimary: true,
        },
        transaction,
      });

      if (assignment) {
        await assignment.update({
          roomNumber: request.proposedRoom || assignment.roomNumber,
          priceId: request.priceId || assignment.priceId,
          workingStatus: 'active',
          isPrimary: true,
        }, { transaction });
      }
    }

    // 5. Cập nhật trạng thái Onboarding Request
    await request.update({
      status: 'APPROVED',
      approvedDoctorId: user.id,
      reviewedBy: adminId || null,
      reviewedAt: new Date(),
      adminFeedback: 'Hồ sơ đã được phê duyệt hợp lệ. Tài khoản bác sĩ đã được kích hoạt thành công.',
    }, { transaction });

    await transaction.commit();

    return {
      errCode: 0,
      message: 'Phê duyệt thành công! Tài khoản Bác sĩ đã được kích hoạt và đồng bộ toàn hệ thống.',
      data: {
        requestId: request.id,
        doctorId: user.id,
        doctorName: `${user.lastName} ${user.firstName}`,
        specialtyId: request.specialtyId,
        clinicId: request.clinicId,
        status: 'APPROVED',
      },
    };
  } catch (error) {
    await transaction.rollback();
    console.error('Error in approveOnboarding:', error);
    return {
      errCode: -1,
      message: 'Lỗi máy chủ khi phê duyệt hồ sơ: ' + error.message,
    };
  }
};

module.exports = {
  submitOnboarding,
  getOnboardingStatus,
  getVerificationQueue,
  getOnboardingDetail,
  requestChanges,
  rejectOnboarding,
  approveOnboarding,
  calculateCompletenessScore,
  detectRiskFlags,
};
