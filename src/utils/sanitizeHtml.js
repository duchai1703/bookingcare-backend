// src/utils/sanitizeHtml.js
// ✅ [SECURITY-FIX] Cấu hình sanitize-html — Chặn Stored XSS từ gốc (Backend)
// Defense-in-Depth Layer 1: Lọc HTML nguy hiểm TRƯỚC khi lưu vào Database
// Chỉ cho phép các thẻ định dạng text, list, link, image cơ bản

const sanitizeHtml = require('sanitize-html');

// Cấu hình whitelist an toàn cho nội dung y tế (Markdown → HTML)
const SANITIZE_CONFIG = {
  allowedTags: [
    // Heading
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Block
    'p', 'div', 'br', 'hr', 'blockquote', 'pre', 'code',
    // Inline formatting
    'b', 'i', 'u', 'strong', 'em', 'small', 'sub', 'sup', 'mark', 'del', 'ins', 'span',
    // Lists
    'ul', 'ol', 'li',
    // Links
    'a',
    // Images
    'img',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'th': ['colspan', 'rowspan'],
    'td': ['colspan', 'rowspan'],
    'span': ['style'],
    'p': ['style'],
    'div': ['style'],
    'h1': ['style'],
    'h2': ['style'],
    'h3': ['style'],
    'h4': ['style'],
    'pre': ['class'],    // Cho code highlighting
    'code': ['class'],   // Cho code highlighting
  },
  // Chỉ cho phép style properties an toàn (font, color, alignment)
  allowedStyles: {
    '*': {
      'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^rgba\(/i],
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      'font-size': [/^\d+(?:px|em|rem|%)$/],
      'font-weight': [/^\d+$/, /^bold$/, /^normal$/],
      'font-style': [/^italic$/, /^normal$/],
      'text-decoration': [/^underline$/, /^line-through$/, /^none$/],
      'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^rgba\(/i],
    },
  },
  // Bắt buộc thêm rel="noopener noreferrer" cho link → chống tab-nabbing
  transformTags: {
    'a': sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer',
    }),
  },
  // KHÔNG cho phép: script, iframe, object, embed, form, input, style tag, event handlers
  // sanitize-html mặc định đã block tất cả các thẻ/attributes không nằm trong whitelist
};

/**
 * Làm sạch HTML content trước khi lưu DB
 * @param {string} html - Chuỗi HTML cần sanitize
 * @returns {string} - Chuỗi HTML đã được làm sạch
 */
const sanitizeContent = (html) => {
  if (!html || typeof html !== 'string') return '';
  return sanitizeHtml(html, SANITIZE_CONFIG);
};

module.exports = { sanitizeContent, SANITIZE_CONFIG };
