// src/controllers/userController.js
const userService = require('../services/userService');
const authService = require('../services/authService');

const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu email hoặc mật khẩu!' });
    }
    const result = await userService.handleUserLogin(email, password);
    // errCode 0 = thành công, 1 = email sai, 3 = mật khẩu sai
    const httpStatus = result.errCode === 0 ? 200 : 401;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleLogin error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleGetAllUsers = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    }
    const result = await userService.getAllUsers(id);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleGetAllUsers error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleCreateNewUser = async (req, res) => {
  try {
    const result = await userService.createNewUser(req.body);
    // errCode 0 = thành công (201 Created), 1 = thiếu params (400), 2 = email trùng (409)
    const statusMap = { 0: 201, 1: 400, 2: 409 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleCreateNewUser error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleEditUser = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // FIX BE-01: lấy id từ URL
    const result = await userService.editUser(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleEditUser error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleDeleteUser = async (req, res) => {
  try {
    const id = req.params.id; // FIX BE-02: lấy từ URL (DELETE không có body)
    if (!id) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    }
    const result = await userService.deleteUser(id, req.user?.id); // BE-10: truyền requesterId
    const statusMap = { 0: 200, 3: 404, 5: 400, 6: 409 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleDeleteUser error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const getAllCode = async (req, res) => {
  try {
    const result = await userService.getAllCodeService(req.query.type);
    // errCode 0 = OK, 1 = thiếu type (400)
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> getAllCode error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// MỚI: REQ-PT-002 – Tìm kiếm bác sĩ/chuyên khoa/phòng khám
const handleSearch = async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu từ khóa tìm kiếm!' });
    }
    const result = await userService.searchService(keyword);
    const httpStatus = result.errCode === 0 ? 200 : 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleSearch error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// [Phase 9] Auth Handlers — Register, Forgot Password, Reset Password
// ═══════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/register — Đăng ký bệnh nhân (R3)
const handleRegisterPatient = async (req, res) => {
  try {
    const result = await authService.registerPatient(req.body);
    // errCode: 0 = thành công (201), 1 = thiếu params (400),
    //          2 = email trùng (409), 10 = guest hijack (409)
    const statusMap = { 0: 201, 1: 400, 2: 409, 10: 409 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleRegisterPatient error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// POST /api/v1/auth/forgot-password — Gửi email link reset
const handleForgotPassword = async (req, res) => {
  try {
    const result = await authService.forgotPassword(req.body);
    // Luôn trả 200 OK để chống email enumeration
    return res.status(200).json(result);
  } catch (err) {
    console.error('>>> handleForgotPassword error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// POST /api/v1/auth/reset-password — Đặt mật khẩu mới
const handleResetPassword = async (req, res) => {
  try {
    const result = await authService.resetPassword(req.body);
    // errCode: 0 = thành công (200), 1 = thiếu params (400),
    //          2 = token hết hạn (400), 3 = user không tồn tại (404),
    //          4 = token đã dùng/không hợp lệ (400)
    const statusMap = { 0: 200, 1: 400, 2: 400, 3: 404, 4: 400 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleResetPassword error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  handleLogin,
  handleGetAllUsers,
  handleCreateNewUser,
  handleEditUser,
  handleDeleteUser,
  getAllCode,
  handleSearch,
  handleRegisterPatient,
  handleForgotPassword,
  handleResetPassword,
};

