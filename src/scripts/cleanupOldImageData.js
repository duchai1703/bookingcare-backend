// src/scripts/cleanupOldImageData.js
// ✅ [FIX-IMAGE] Migration Script: Cleanup data cũ trong DB
//
// VẤN ĐỀ: Trước khi fix, ảnh được lưu vào BLOB kèm prefix "data:image/...;base64,"
//         Sau khi fix, ảnh mới chỉ lưu pure base64 (không có prefix)
//         → Data cũ cần được cleanup để thống nhất format
//
// CÁCH CHẠY: node src/scripts/cleanupOldImageData.js
//
// AN TOÀN: Script này chỉ UPDATE data — không DELETE, không thay đổi schema
//          Có transaction rollback nếu lỗi

const db = require('../models');

const TABLES_WITH_IMAGE = [
  { model: db.User, name: 'Users' },
  { model: db.Specialty, name: 'Specialties' },
  { model: db.Clinic, name: 'Clinics' },
];

const DATA_URI_REGEX = /^data:image\/[a-zA-Z+]+;base64,/;

const cleanupTable = async (Model, tableName, transaction) => {
  console.log(`\n📋 Đang xử lý bảng: ${tableName}...`);

  const records = await Model.findAll({ raw: false, transaction });
  let fixedCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    if (!record.image) {
      skippedCount++;
      continue;
    }

    // Convert BLOB → string để kiểm tra
    let imageStr;
    if (Buffer.isBuffer(record.image)) {
      imageStr = record.image.toString('utf8');
    } else if (typeof record.image === 'string') {
      imageStr = record.image;
    } else {
      skippedCount++;
      continue;
    }

    // Kiểm tra nếu string bắt đầu bằng "data:image" → data cũ, cần strip prefix
    if (imageStr.match(DATA_URI_REGEX)) {
      const pureBase64 = imageStr.replace(DATA_URI_REGEX, '');
      record.image = pureBase64;
      await record.save({ transaction });
      fixedCount++;
      console.log(`  ✅ Fixed record ID=${record.id}`);
    } else {
      skippedCount++;
    }
  }

  console.log(`  📊 Kết quả: ${fixedCount} đã sửa, ${skippedCount} bỏ qua (đã đúng format)`);
  return fixedCount;
};

const main = async () => {
  console.log('=========================================');
  console.log('🔧 CLEANUP OLD IMAGE DATA IN DATABASE');
  console.log('=========================================');
  console.log('Mục đích: Loại bỏ prefix "data:image/...;base64," khỏi BLOB');
  console.log('          để thống nhất format pure base64 cho toàn bộ DB');
  console.log('');

  const t = await db.sequelize.transaction();

  try {
    let totalFixed = 0;

    for (const { model, name } of TABLES_WITH_IMAGE) {
      const fixed = await cleanupTable(model, name, t);
      totalFixed += fixed;
    }

    await t.commit();

    console.log('\n=========================================');
    console.log(`✅ HOÀN TẤT! Tổng cộng đã sửa: ${totalFixed} records`);
    console.log('=========================================');
  } catch (err) {
    await t.rollback();
    console.error('\n❌ LỖI! Đã rollback toàn bộ thay đổi.');
    console.error('Chi tiết:', err);
  }

  process.exit(0);
};

main();
