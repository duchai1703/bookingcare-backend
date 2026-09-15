// src/utils/convertBlobToBase64.js
// ✅ [FIX-IMAGE v3] Utility: Convert PostgreSQL BYTEA → base64 string an toàn
// Dùng khi đọc image từ DB để trả về Frontend
//
// MÔ HÌNH LƯU TRỮ:
//   - stripBase64Prefix lưu pure base64 TEXT (ví dụ: "iVBORw0KGgo...") vào BLOB
//   - BLOB lưu bytes UTF-8 của base64 text
//   - Đọc ra: cần toString('utf8') để lấy lại base64 text gốc
//   - KHÔNG dùng toString('base64') → sẽ encode lại lần 2!
//
// XỬ LÝ CẢ DATA CŨ VÀ MỚI:
//   Case 1 (DATA MỚI): BLOB chứa UTF-8 bytes của pure base64 → toString('utf8') → OK
//   Case 2 (DATA CŨ):  BLOB chứa UTF-8 bytes của "data:image/...;base64,..." → toString('utf8') → strip prefix

/**
 * Convert BYTEA/Buffer từ PostgreSQL → pure base64 string.
 * Tương thích ngược với cả data cũ (có prefix) và data mới (pure base64).
 * @param {Buffer|string|null} blob - Image data từ database
 * @returns {string} Pure base64 string (không có prefix data:image/...)
 */
const convertBlobToBase64 = (blob) => {
  if (!blob) return '';

  // Nếu đã là string (edge case: raw: false trên một số Sequelize version)
  if (typeof blob === 'string') {
    // Strip prefix nếu có (data cũ), trả pure base64
    return blob.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  }

  // Buffer → thử decode theo convention mới: UTF-8 bytes của pure base64 text
  const buf = Buffer.from(blob);
  const utf8String = buf.toString('utf8');

  // Strip prefix nếu có (backward-compat với data cũ có prefix "data:image/...;base64,")
  const stripped = utf8String.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  // ✅ [FIX v3] Validate: nếu kết quả là valid base64 → trả về (convention mới đúng)
  // Nếu không valid (data cũ bị lưu dưới dạng binary buffer bởi Buffer.from(str,'base64'))
  // → encode lại toàn bộ binary bằng toString('base64') để recover
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (stripped.length > 0 && base64Regex.test(stripped)) {
    return stripped; // Convention mới: pure base64 text → đọc utf8 → OK
  }

  // Fallback: data lưu dạng binary (Buffer.from(str,'base64')) → encode lại
  return buf.toString('base64');
};

module.exports = { convertBlobToBase64 };
