// bookingcare-backend/src/services/catalogService.js
// [Phase B] Quản lý danh mục y khoa, thuốc và cài đặt hệ thống
'use strict';
const db = require('../models');

// ══════════════════════════════════════════════════════
// MEDICAL CATALOG
// ══════════════════════════════════════════════════════

const getAllMedicalCatalogs = async ({ type, isActive } = {}) => {
  const where = {};
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;

  const data = await db.MedicalCatalog.findAll({
    where,
    order: [['type', 'ASC'], ['name', 'ASC']],
  });
  return { errCode: 0, data };
};

const createMedicalCatalog = async (body) => {
  if (!body.name || !body.type) {
    return { errCode: 1, message: 'Missing required fields: name, type' };
  }
  const item = await db.MedicalCatalog.create(body);
  return { errCode: 0, data: item };
};

const editMedicalCatalog = async (id, body) => {
  const item = await db.MedicalCatalog.findByPk(id);
  if (!item) return { errCode: 1, message: 'MedicalCatalog not found' };
  await item.update(body);
  return { errCode: 0, message: 'Updated successfully' };
};

const deleteMedicalCatalog = async (id) => {
  const item = await db.MedicalCatalog.findByPk(id);
  if (!item) return { errCode: 1, message: 'MedicalCatalog not found' };
  await item.destroy();
  return { errCode: 0, message: 'Deleted successfully' };
};

// ══════════════════════════════════════════════════════
// MEDICINE
// ══════════════════════════════════════════════════════

const getAllMedicines = async ({ isActive, search } = {}) => {
  const where = {};
  if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;
  if (search) {
    where.name = { [db.Sequelize.Op.iLike]: `%${search}%` };
  }

  const data = await db.Medicine.findAll({
    where,
    order: [['name', 'ASC']],
  });
  return { errCode: 0, data };
};

const createMedicine = async (body) => {
  if (!body.name) return { errCode: 1, message: 'Missing required field: name' };
  const item = await db.Medicine.create(body);
  return { errCode: 0, data: item };
};

const editMedicine = async (id, body) => {
  const item = await db.Medicine.findByPk(id);
  if (!item) return { errCode: 1, message: 'Medicine not found' };
  await item.update(body);
  return { errCode: 0, message: 'Updated successfully' };
};

const deleteMedicine = async (id) => {
  const item = await db.Medicine.findByPk(id);
  if (!item) return { errCode: 1, message: 'Medicine not found' };
  await item.destroy();
  return { errCode: 0, message: 'Deleted successfully' };
};

// ══════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ══════════════════════════════════════════════════════

const DEFAULT_SYSTEM_SETTINGS = [
  // 1. Vận hành & Quy tắc Đặt khám
  { key: 'booking_hold_timeout_minutes', value: '15', description: 'Thời gian tối đa giữ chỗ chờ thanh toán VNPay (phút)' },
  { key: 'max_daily_bookings_per_patient', value: '3', description: 'Số lịch hẹn tối đa một bệnh nhân được đặt trong cùng 1 ngày' },
  { key: 'min_hours_before_booking_cancel', value: '2', description: 'Thời gian tối thiểu cho phép bệnh nhân hủy lịch trước giờ khám (giờ)' },

  // 2. Kênh Thông báo & Tự động hóa
  { key: 'auto_email_booking_confirmation', value: 'true', description: 'Tự động gửi email xác nhận ngay khi đặt lịch thành công' },
  { key: 'auto_email_remedy_prescription', value: 'true', description: 'Tự động gửi email hóa đơn & đơn thuốc điện tử cho bệnh nhân sau khám' },
  { key: 'appointment_reminder_hours_before', value: '2', description: 'Thời gian gửi email / thông báo nhắc lịch trước giờ khám (giờ)' },

  // 3. Thông tin Thương hiệu & Hỗ trợ CSKH
  { key: 'platform_support_hotline', value: '1900-2115', description: 'Hotline tổng đài CSKH hỗ trợ bệnh nhân 24/7' },
  { key: 'platform_support_email', value: 'hotro@bookingcare.vn', description: 'Email tiếp nhận hỗ trợ và phản hồi của BookingCare' },
  { key: 'platform_headquarters_address', value: '28 Thành Thái, Dịch Vọng Hậu, Cầu Giấy, Hà Nội', description: 'Địa chỉ trụ sở công ty hiển thị trên hóa đơn / email' },

  // 4. An toàn & Bảo trì Hệ thống
  { key: 'maintenance_mode', value: 'false', description: 'Kích hoạt chế độ bảo trì toàn hệ thống' },
  { key: 'session_timeout_hours', value: '2', description: 'Thời hạn hiệu lực của phiên đăng nhập quản trị (giờ)' },
];

const LEGACY_KEYS = [
  'refund_rate_cancel_before_24h',
  'refund_rate_cancel_after_24h',
  'refund_threshold_hours',
  'service_fee_rate',
];

const getSystemSettings = async () => {
  // Dọn dẹp các key hoàn tiền / phí sàn cũ (đã chuyển sang Financial Policy Engine)
  await db.SystemSetting.destroy({ where: { key: LEGACY_KEYS } });

  let data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  
  // Tự động khởi tạo (Self-healing Auto-seed) nếu bảng trống hoặc thiếu key mới
  const existingKeys = new Set(data.map(item => item.key));
  let added = false;
  for (const item of DEFAULT_SYSTEM_SETTINGS) {
    if (!existingKeys.has(item.key)) {
      await db.SystemSetting.upsert(item);
      added = true;
    }
  }
  if (added || data.length === 0) {
    data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  }

  return { errCode: 0, data };
};

const updateSystemSetting = async (key, value, description) => {
  if (!key) return { errCode: 1, message: 'Missing key' };
  // upsert = INSERT hoặc UPDATE nếu đã tồn tại
  await db.SystemSetting.upsert({ key, value: String(value), description });
  return { errCode: 0, message: 'Setting updated successfully' };
};

const updateBulkSystemSettings = async (settingsList = []) => {
  if (!Array.isArray(settingsList) || settingsList.length === 0) {
    return { errCode: 1, message: 'Invalid settings payload' };
  }
  for (const item of settingsList) {
    if (item.key) {
      await db.SystemSetting.upsert({
        key: item.key,
        value: String(item.value),
        description: item.description,
      });
    }
  }
  const data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  return { errCode: 0, message: 'Bulk settings updated successfully', data };
};

const resetSystemSettings = async () => {
  // Xóa sạch để đưa về mặc định nền tảng chuẩn
  await db.SystemSetting.destroy({ where: {} });
  for (const item of DEFAULT_SYSTEM_SETTINGS) {
    await db.SystemSetting.upsert(item);
  }
  const data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  return { errCode: 0, message: 'Reset to default settings successfully', data };
};

module.exports = {
  // MedicalCatalog
  getAllMedicalCatalogs,
  createMedicalCatalog,
  editMedicalCatalog,
  deleteMedicalCatalog,
  // Medicine
  getAllMedicines,
  createMedicine,
  editMedicine,
  deleteMedicine,
  // SystemSetting
  getSystemSettings,
  updateSystemSetting,
  updateBulkSystemSettings,
  resetSystemSettings,
};
