// src/utils/convertBlobToBase64.js
// ✅ [FIX-IMAGE v2] Utility: Convert MySQL BLOB → base64 string an toàn
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
 * Convert BLOB/Buffer từ MySQL → pure base64 string.
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

  // ✅ [FIX v2] Buffer → toString('utf8') để lấy lại base64 TEXT gốc
  // TRƯỚC ĐÂY: dùng toString('base64') → DOUBLE ENCODE!
  // Lý do: BLOB lưu "iVBORw0KGgo..." dưới dạng UTF-8 bytes
  //         toString('base64') encode bytes → "aVZCT1J3MEtH..." (SAI!)
  //         toString('utf8') decode bytes → "iVBORw0KGgo..." (ĐÚNG!)
  const utf8String = Buffer.from(blob).toString('utf8');

  // Strip prefix nếu có (backward-compat với data cũ có prefix "data:image/...;base64,")
  return utf8String.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
};

module.exports = { convertBlobToBase64 };
