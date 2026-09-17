// SRS Section 4.2 & Blueprint Doctor Self-Onboarding
module.exports = (sequelize, DataTypes) => {
  const Doctor_Onboarding_Request = sequelize.define('Doctor_Onboarding_Request', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: true, // 'M', 'F', 'O'
    },
    birthday: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    nationalId: {
      type: DataTypes.STRING(30),
      allowNull: true, // CCCD/Hộ chiếu
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true, // Base64 string hoặc image url
    },
    // Chuyên môn & Chứng chỉ
    specialtyId: {
      type: DataTypes.INTEGER,
      allowNull: false, // Chuyên khoa chính
    },
    subSpecialtyIds: {
      type: DataTypes.JSONB,
      defaultValue: [], // Mảng ID chuyên khoa phụ
    },
    licenseNumber: {
      type: DataTypes.STRING(100),
      allowNull: false, // Số Giấy phép hành nghề / CCHN
    },
    licenseIssueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    licenseIssuePlace: {
      type: DataTypes.STRING(255),
      allowNull: true, // Nơi cấp CCHN (Sở Y tế, Bộ Y tế...)
    },
    licenseImages: {
      type: DataTypes.JSONB,
      defaultValue: [], // Mảng link/base64 ảnh scan CCHN & bằng cấp
    },
    qualificationDegree: {
      type: DataTypes.STRING(100),
      allowNull: true, // Bác sĩ CK1, CK2, Thạc sĩ, Tiến sĩ...
    },
    experienceYears: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    bioDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Cơ sở công tác & Kinh tế
    clinicId: {
      type: DataTypes.INTEGER,
      allowNull: false, // Cơ sở y tế chính muốn công tác
    },
    proposedRoom: {
      type: DataTypes.STRING(100),
      allowNull: true, // Phòng khám đề xuất
    },
    priceId: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    bankAccountNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    bankName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    bankAccountName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Thẩm định & Workflow
    completenessScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0, // Điểm hồ sơ 0-100%
    },
    riskFlags: {
      type: DataTypes.JSONB,
      defaultValue: [], // Cảnh báo hệ thống: ['MISSING_LICENSE_IMAGE', 'NAME_MISMATCH', 'DUPLICATE_LICENSE']
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'SUBMITTED', // 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'
    },
    adminFeedback: {
      type: DataTypes.TEXT,
      allowNull: true, // Ghi chú yêu cầu bổ sung của Admin
    },
    requiredFields: {
      type: DataTypes.JSONB,
      defaultValue: [], // Các trường Admin đánh dấu cần bổ sung
    },
    approvedDoctorId: {
      type: DataTypes.INTEGER,
      allowNull: true, // ID User Bác sĩ được tạo sau khi Approve
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true, // Admin ID thực hiện review
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'Doctor_Onboarding_Requests',
    indexes: [
      { fields: ['email'], name: 'idx_doctor_onboard_email' },
      { fields: ['phoneNumber'], name: 'idx_doctor_onboard_phone' },
      { fields: ['licenseNumber'], name: 'idx_doctor_onboard_license' },
      { fields: ['status'], name: 'idx_doctor_onboard_status' },
      { fields: ['clinicId'], name: 'idx_doctor_onboard_clinic' },
      { fields: ['specialtyId'], name: 'idx_doctor_onboard_specialty' },
    ],
  });

  return Doctor_Onboarding_Request;
};
