// src/utils/validateBase64Image.js
// ✅ [SECURITY-FIX Phase 4/5/6] Validate Base64 image trước khi lưu DB
// Chặn upload file quá lớn hoặc sai định dạng

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Validate chuỗi Base64 image.
 * @param {string} base64String - Chuỗi base64 (có thể có hoặc không có data URI prefix)
 * @returns {{ isValid: boolean, error?: string }}
 */
const validateBase64Image = (base64String) => {
  if (!base64String || typeof base64String !== 'string') {
    return { isValid: false, error: 'Dữ liệu ảnh không hợp lệ (rỗng hoặc sai kiểu)!' };
  }

  // --- Bước 1: Kiểm tra định dạng MIME type từ data URI ---
  // Format: data:image/jpeg;base64,/9j/4AAQ...
  const dataUriMatch = base64String.match(/^data:(image\/[a-zA-Z+]+);base64,/);

  if (!dataUriMatch) {
    return {
      isValid: false,
      error: 'Ảnh phải có định dạng data URI hợp lệ (data:image/...;base64,...)!',
    };
  }

  const mimeType = dataUriMatch[1].toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      isValid: false,
      error: `Định dạng ảnh không được phép: "${mimeType}". Chỉ chấp nhận: ${ALLOWED_MIME_TYPES.join(', ')}.`,
    };
  }

  // --- Bước 2: Tách phần base64 data thuần ---
  const base64Data = base64String.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  // Kiểm tra base64 hợp lệ (chỉ chứa ký tự base64)
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64Data)) {
    return { isValid: false, error: 'Dữ liệu Base64 chứa ký tự không hợp lệ!' };
  }

  // --- Bước 3: Kiểm tra kích thước sau khi decode ---
  // Công thức: decoded size ≈ (base64Length * 3) / 4
  const paddingCount = (base64Data.match(/=+$/) || [''])[0].length;
  const decodedSize = (base64Data.length * 3) / 4 - paddingCount;

  if (decodedSize > MAX_SIZE_BYTES) {
    const sizeMB = (decodedSize / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      error: `Kích thước ảnh (${sizeMB}MB) vượt quá giới hạn cho phép (5MB)!`,
    };
  }

  return { isValid: true };
};

module.exports = { validateBase64Image, ALLOWED_MIME_TYPES, MAX_SIZE_BYTES };
