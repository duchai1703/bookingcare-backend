// bookingcare-backend/src/controllers/doctorShorthandController.js
const doctorShorthandService = require('../services/doctorShorthandService');

/**
 * GET /api/v1/doctor/shorthands/search
 * Tìm kiếm từ viết tắt cho inline autocomplete trên mọi ô nhập liệu
 */
const handleSearchShorthands = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { query, targetField, limit } = req.query;

    const response = await doctorShorthandService.searchShorthands({
      doctorId,
      query,
      targetField,
      limit,
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('Controller handleSearchShorthands error:', error);
    return res.status(500).json({
      errCode: -1,
      message: 'Lỗi server khi tìm kiếm từ viết tắt: ' + error.message,
    });
  }
};

/**
 * GET /api/v1/doctor/shorthands
 * Lấy toàn bộ danh mục từ viết tắt cho màn hình quản lý
 */
const handleGetDoctorShorthands = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { search, targetField, category, page, limit } = req.query;

    const response = await doctorShorthandService.getDoctorShorthands({
      doctorId,
      search,
      targetField,
      category,
      page,
      limit,
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('Controller handleGetDoctorShorthands error:', error);
    return res.status(500).json({
      errCode: -1,
      message: 'Lỗi server khi lấy danh sách từ viết tắt: ' + error.message,
    });
  }
};

/**
 * POST /api/v1/doctor/shorthands
 * Tạo mới từ viết tắt cá nhân
 */
const handleCreateShorthand = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const response = await doctorShorthandService.createShorthand(req.body, doctorId);
    return res.status(response.errCode === 0 ? 201 : 400).json(response);
  } catch (error) {
    console.error('Controller handleCreateShorthand error:', error);
    return res.status(500).json({
      errCode: -1,
      message: 'Lỗi server khi tạo từ viết tắt: ' + error.message,
    });
  }
};

/**
 * PUT /api/v1/doctor/shorthands/:id
 * Sửa từ viết tắt cá nhân
 */
const handleUpdateShorthand = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { id } = req.params;
    const response = await doctorShorthandService.updateShorthand(id, req.body, doctorId);
    return res.status(response.errCode === 0 ? 200 : 400).json(response);
  } catch (error) {
    console.error('Controller handleUpdateShorthand error:', error);
    return res.status(500).json({
      errCode: -1,
      message: 'Lỗi server khi cập nhật từ viết tắt: ' + error.message,
    });
  }
};

/**
 * DELETE /api/v1/doctor/shorthands/:id
 * Xóa từ viết tắt cá nhân
 */
const handleDeleteShorthand = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { id } = req.params;
    const response = await doctorShorthandService.deleteShorthand(id, doctorId);
    return res.status(response.errCode === 0 ? 200 : 400).json(response);
  } catch (error) {
    console.error('Controller handleDeleteShorthand error:', error);
    return res.status(500).json({
      errCode: -1,
      message: 'Lỗi server khi xóa từ viết tắt: ' + error.message,
    });
  }
};

/**
 * POST /api/v1/doctor/shorthands/:id/use
 * Ghi nhận số lần sử dụng
 */
const handleRecordUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await doctorShorthandService.recordUsage(id);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Controller handleRecordUsage error:', error);
    return res.status(500).json({
      errCode: -1,
      message: 'Lỗi server ghi nhận lượt dùng: ' + error.message,
    });
  }
};

module.exports = {
  handleSearchShorthands,
  handleGetDoctorShorthands,
  handleCreateShorthand,
  handleUpdateShorthand,
  handleDeleteShorthand,
  handleRecordUsage,
};
