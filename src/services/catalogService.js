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

const getSystemSettings = async () => {
  const data = await db.SystemSetting.findAll({ order: [['key', 'ASC']] });
  return { errCode: 0, data };
};

const updateSystemSetting = async (key, value, description) => {
  if (!key) return { errCode: 1, message: 'Missing key' };
  // upsert = INSERT hoặc UPDATE nếu đã tồn tại
  await db.SystemSetting.upsert({ key, value, description });
  return { errCode: 0, message: 'Setting updated successfully' };
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
};
