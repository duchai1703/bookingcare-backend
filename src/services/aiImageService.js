'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 02 — Gemini Vision] AI Image Service
// Handles Secure Validation, Magic-Byte Signature, Temp Storage & Cleanup
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configuration
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const TEMP_IMAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

// Secure temporary directory path
const TEMP_DIR = path.join(__dirname, '../../uploads/temp_ai');

// Ensure temporary directory exists with restricted permissions
try {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true, mode: 0o700 });
  }
} catch (err) {
  console.error('[AI_IMAGE_SERVICE] Failed to create temp directory:', err);
}

// In-memory registry of active temporary images: imageId -> metadata
const activeTempImages = new Map();

// ═══════════════════════════════════════════════════════════════════════
// 1. MAGIC BYTE & SIGNATURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Kiểm tra Magic Bytes của buffer để xác định định dạng ảnh thực tế.
 * Không tin tưởng tuyệt đối vào req.file.mimetype hay extension do client gửi.
 * @param {Buffer} buffer
 * @returns {string|null} - 'image/jpeg' | 'image/png' | 'image/webp' | null
 */
function detectMagicByteMimeType(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // 1. JPEG check: Starts with FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // 2. PNG check: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return 'image/png';
  }

  // 3. WebP check: Starts with "RIFF" (52 49 46 46) and bytes 8..11 are "WEBP" (57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Kiểm tra xem buffer có chứa mã độc SVG hoặc HTML / Script không
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function containsForbiddenScriptOrSvg(buffer) {
  if (!buffer || buffer.length === 0) return false;
  // Đọc tối đa 1KB đầu và 1KB cuối của file dưới dạng text
  const headStr = buffer.slice(0, 1024).toString('utf8').toLowerCase();
  const tailStr = buffer.length > 1024 ? buffer.slice(-1024).toString('utf8').toLowerCase() : '';

  const dangerousTokens = [
    '<svg',
    '<?xml',
    '<script',
    '<!doctype html',
    '<html',
    'javascript:',
    'onload=',
    'onerror=',
  ];

  return dangerousTokens.some((token) => headStr.includes(token) || tailStr.includes(token));
}

/**
 * Validate toàn diện một buffer ảnh trước khi xử lý
 * @param {Buffer} buffer
 * @param {string} originalFilename
 * @param {string} clientMimeType
 * @returns {{ isValid: boolean, error?: string, code?: string, detectedMime?: string }}
 */
function validateImageBuffer(buffer, originalFilename = '', clientMimeType = '') {
  // 1. Kiểm tra tồn tại buffer
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      isValid: false,
      code: 'IMAGE_REQUIRED',
      error: 'Vui lòng cung cấp tệp hình ảnh hợp lệ.',
    };
  }

  // 2. Kiểm tra dung lượng (Max 5MB)
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      code: 'IMAGE_TOO_LARGE',
      error: `Ảnh vượt quá giới hạn 5MB (Kích thước hiện tại: ${sizeMb}MB). Vui lòng chọn ảnh nhẹ hơn.`,
    };
  }

  // 3. Kiểm tra extension an toàn
  const ext = path.extname(originalFilename || '').toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      code: 'IMAGE_TYPE_NOT_ALLOWED',
      error: `Định dạng tệp "${ext}" không được hỗ trợ. Chỉ chấp nhận JPG, PNG, hoặc WebP.`,
    };
  }

  // 4. Chặn dứt khoát SVG và HTML
  if (
    clientMimeType.includes('svg') ||
    ext === '.svg' ||
    containsForbiddenScriptOrSvg(buffer)
  ) {
    return {
      isValid: false,
      code: 'IMAGE_TYPE_NOT_ALLOWED',
      error: 'Định dạng SVG hoặc tệp chứa mã độc không được phép tải lên vì lý do an toàn bảo mật.',
    };
  }

  // 5. Kiểm tra Magic Bytes thực tế của file
  const detectedMime = detectMagicByteMimeType(buffer);
  if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
    return {
      isValid: false,
      code: 'IMAGE_INVALID',
      error: 'Nội dung tệp không phải là hình ảnh hợp lệ (JPEG, PNG hoặc WebP).',
    };
  }

  return {
    isValid: true,
    detectedMime,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 2. TEMPORARY STORAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lưu tệp ảnh vào khu vực tạm thời có gắn mã định danh UUID và TTL 5 phút
 * @param {Buffer} buffer
 * @param {string} originalFilename
 * @param {number} userId - ID người dùng sở hữu (từ JWT)
 * @returns {Promise<{ imageId: string, mimeType: string, size: number, filename: string }>}
 */
async function saveTemporaryImage(buffer, originalFilename, userId) {
  const validation = validateImageBuffer(buffer, originalFilename);
  if (!validation.isValid) {
    const err = new Error(validation.error);
    err.code = validation.code;
    throw err;
  }

  const mimeType = validation.detectedMime;
  const ext = mimeType === 'image/jpeg' ? '.jpg' : (mimeType === 'image/png' ? '.png' : '.webp');
  const imageId = `img_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const filename = `${imageId}${ext}`;
  const filepath = path.join(TEMP_DIR, filename);

  // Ghi file không đồng bộ ra disk tạm thời
  await fs.promises.writeFile(filepath, buffer, { mode: 0o600 });

  const metadata = {
    id: imageId,
    filename,
    filepath,
    mimeType,
    size: buffer.length,
    userId: Number(userId),
    createdAt: Date.now(),
    expiresAt: Date.now() + TEMP_IMAGE_TTL_MS,
  };

  activeTempImages.set(imageId, metadata);

  return {
    imageId,
    mimeType,
    size: buffer.length,
    filename,
  };
}

/**
 * Lấy thông tin và buffer của tệp ảnh tạm thời, kiểm tra quyền sở hữu IDOR
 * @param {string} imageId
 * @param {number} userId
 * @returns {Promise<{ metadata: Object, buffer: Buffer }>}
 */
async function getTemporaryImage(imageId, userId) {
  if (!imageId || typeof imageId !== 'string') {
    const err = new Error('Thiếu mã định danh hình ảnh.');
    err.code = 'IMAGE_REQUIRED';
    throw err;
  }

  const meta = activeTempImages.get(imageId);
  if (!meta) {
    const err = new Error('Ảnh đã hết hạn hoặc không tồn tại trong hệ thống.');
    err.code = 'IMAGE_EXPIRED';
    throw err;
  }

  // IDOR Ownership Check
  if (userId && Number(meta.userId) !== Number(userId)) {
    const err = new Error('Bạn không có quyền truy cập tệp hình ảnh này.');
    err.code = 'AI_FORBIDDEN';
    throw err;
  }

  // Check TTL
  if (Date.now() > meta.expiresAt) {
    cleanupImage(imageId);
    const err = new Error('Ảnh đã hết hạn thời gian xử lý tạm thời (5 phút).');
    err.code = 'IMAGE_EXPIRED';
    throw err;
  }

  // Đọc buffer từ disk
  try {
    const buffer = await fs.promises.readFile(meta.filepath);
    return { metadata: meta, buffer };
  } catch (readErr) {
    cleanupImage(imageId);
    const err = new Error('Không thể truy xuất tệp ảnh tạm.');
    err.code = 'IMAGE_PROCESSING_FAILED';
    throw err;
  }
}

/**
 * Xóa an toàn tệp ảnh tạm thời khỏi đĩa cứng và gỡ khỏi bộ nhớ
 * @param {string} imageId
 */
function cleanupImage(imageId) {
  if (!imageId) return;
  const meta = activeTempImages.get(imageId);
  if (meta) {
    activeTempImages.delete(imageId);
    try {
      if (fs.existsSync(meta.filepath)) {
        fs.unlinkSync(meta.filepath);
      }
    } catch (err) {
      console.warn(`[AI_IMAGE_CLEANUP] Could not unlink ${meta.filepath}:`, err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. BACKGROUND TTL CLEANER (Chạy mỗi 60s dọn file mồ côi)
// ═══════════════════════════════════════════════════════════════════════

const cleanerInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, meta] of activeTempImages.entries()) {
    if (now > meta.expiresAt) {
      cleanupImage(id);
    }
  }

  // Quét đĩa cứng đề phòng file sót
  try {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        const fullPath = path.join(TEMP_DIR, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > TEMP_IMAGE_TTL_MS) {
            fs.unlinkSync(fullPath);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}, 60 * 1000);

if (cleanerInterval.unref) {
  cleanerInterval.unref();
}

// ═══════════════════════════════════════════════════════════════════════
// ERROR CODES (Section XXVII)
// ═══════════════════════════════════════════════════════════════════════
const AI_IMAGE_ERROR_CODES = {
  IMAGE_REQUIRED: 'IMAGE_REQUIRED',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  IMAGE_TYPE_NOT_ALLOWED: 'IMAGE_TYPE_NOT_ALLOWED',
  IMAGE_INVALID: 'IMAGE_INVALID',
  IMAGE_UPLOAD_FAILED: 'IMAGE_UPLOAD_FAILED',
  IMAGE_PROCESSING_FAILED: 'IMAGE_PROCESSING_FAILED',
  IMAGE_EXPIRED: 'IMAGE_EXPIRED',
  VISION_UNAVAILABLE: 'VISION_UNAVAILABLE',
  VISION_TIMEOUT: 'VISION_TIMEOUT',
  VISION_PROVIDER_ERROR: 'VISION_PROVIDER_ERROR',
  VISION_UNSAFE_CONTENT: 'VISION_UNSAFE_CONTENT',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_UNAUTHORIZED: 'AI_UNAUTHORIZED',
  AI_FORBIDDEN: 'AI_FORBIDDEN',
};

/**
 * Validate object req.file từ Multer
 * @param {Object} file
 */
function validateImageFile(file) {
  if (!file) {
    return {
      valid: false,
      isValid: false,
      code: AI_IMAGE_ERROR_CODES.IMAGE_REQUIRED,
      error: 'Vui lòng cung cấp tệp hình ảnh.',
    };
  }
  const buffer = file.buffer;
  const originalname = file.originalname || '';
  const mimetype = file.mimetype || '';
  const res = validateImageBuffer(buffer, originalname, mimetype);
  return {
    valid: res.isValid,
    isValid: res.isValid,
    code: res.code,
    error: res.error,
    mimeType: res.detectedMime,
    detectedMime: res.detectedMime,
  };
}

module.exports = {
  validateImageBuffer,
  validateImageFile,
  detectMagicByteMimeType,
  containsForbiddenScriptOrSvg,
  saveTemporaryImage,
  getTemporaryImage,
  cleanupImage,
  AI_IMAGE_ERROR_CODES,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  TEMP_IMAGE_TTL_MS,
  TEMP_DIR,
};
