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
  { key: 'refund_rate_cancel_before_24h', value: '100', description: 'Tỷ lệ hoàn tiền khi hủy trước mốc quy định (%)' },
  { key: 'refund_rate_cancel_after_24h',  value: '50',  description: 'Tỷ lệ hoàn tiền khi hủy sau mốc quy định (%)' },
  { key: 'refund_threshold_hours',        value: '24',  description: 'Mốc thời gian quy định hủy lịch trước giờ khám (giờ)' },
  { key: 'service_fee_rate',              value: '5',   description: 'Phí dịch vụ nền tảng hệ thống (%)' },
];

const getSystemSettings = async () => {
  let data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  
  // Tự động khởi tạo (Self-healing Auto-seed) nếu bảng trống
  if (!data || data.length === 0) {
    for (const item of DEFAULT_SYSTEM_SETTINGS) {
      await db.SystemSetting.upsert(item);
    }
    data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  } else {
    // Đảm bảo các key mới như refund_threshold_hours được khởi tạo nếu chưa có
    const existingKeys = new Set(data.map(item => item.key));
    let added = false;
    for (const item of DEFAULT_SYSTEM_SETTINGS) {
      if (!existingKeys.has(item.key)) {
        await db.SystemSetting.upsert(item);
        added = true;
      }
    }
    if (added) {
      data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
    }
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
