// src/controllers/userController.js
const userService = require('../services/userService');

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
    const result = await userService.editUser(req.body);
    // errCode 0 = OK (200), 1 = thiếu id (400), 3 = không tìm thấy (404)
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
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    }
    const result = await userService.deleteUser(id);
    // errCode 0 = OK (200), 3 = không tìm thấy (404)
    const statusMap = { 0: 200, 3: 404 };
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

module.exports = {
  handleLogin,
  handleGetAllUsers,
  handleCreateNewUser,
  handleEditUser,
  handleDeleteUser,
  getAllCode,
  handleSearch,
};
