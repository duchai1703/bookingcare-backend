// src/utils/stripBase64Prefix.js
// ✅ [FIX-IMAGE] Utility: Loại bỏ prefix "data:image/...;base64," khỏi chuỗi base64
// trước khi lưu vào MySQL BLOB — tránh Double-Encoding bug
//
// LUỒNG ĐÚNG:
//   Frontend gửi: "data:image/jpeg;base64,/9j/4AAQ..."
//   → validateBase64Image() kiểm tra prefix + MIME + size ✅
//   → stripBase64Prefix() loại bỏ prefix → "/9j/4AAQ..."
//   → Sequelize lưu pure base64 vào BLOB
//   → Khi đọc: Buffer.from(blob).toString('base64') → "/9j/4AAQ..." (ĐÚNG)
//   → Frontend: "data:image/jpeg;base64,/9j/4AAQ..." (ĐÚNG)

/**
 * Loại bỏ data URI prefix khỏi chuỗi base64 image.
 * @param {string} dataUri - Chuỗi data URI (vd: "data:image/jpeg;base64,/9j/4AAQ...")
 * @returns {string} Pure base64 string (vd: "/9j/4AAQ...")
 */
const stripBase64Prefix = (dataUri) => {
  if (!dataUri || typeof dataUri !== 'string') return dataUri;
  // Regex match: data:image/jpeg;base64, | data:image/png;base64, | data:image/webp;base64,
  return dataUri.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
};

module.exports = { stripBase64Prefix };
