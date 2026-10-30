'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 01 — AI Foundation] Timezone & Date Normalization Utility
// Handles BookingCare timezone (Asia/Ho_Chi_Minh UTC+7) and midnight timestamps
// ═══════════════════════════════════════════════════════════════════════

const TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)
 */
function getNowVN() {
  const now = new Date();
  // Chuyển đổi sang giờ UTC+7
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600000);
}

/**
 * Format ngày dạng DD/MM/YYYY
 * @param {Date} dateObj
 * @returns {string}
 */
function formatDateLabel(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(Number(dateObj));
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Chuẩn hóa chuỗi ngày (tự nhiên hoặc định dạng) thành timestamp chuỗi (00:00:00 UTC)
 * Khớp hoàn toàn với cơ sở dữ liệu Schedule.date
 * @param {string|number} input - Chuỗi ngày ("hôm nay", "ngày mai", "2026-10-05", "05/10/2026", v.v.)
 * @returns {string|null} - Timestamp dạng string (VD: "1728086400000") hoặc null nếu không hợp lệ
 */
function normalizeDateToTimestamp(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();

  // 1. Đã là số timestamp hợp lệ
  if (/^\d{10,13}$/.test(str)) {
    return str;
  }

  const nowVN = getNowVN();

  // 2. Từ khóa tương đối bằng Tiếng Việt
  // Loại bỏ các tiền tố/hậu tố buổi ("sáng", "chiều", "tối") để lấy phần ngày
  const cleanedStr = str
    .replace(/(buổi\s*)?(sáng|chiều|tối)(\s*ngày)?/gi, '')
    .trim();

  if (/^(hôm\s*nay|nay|today)$/i.test(cleanedStr)) {
    return Date.UTC(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate()).toString();
  }
  if (/^(ngày\s*mai|mai|tomorrow)$/i.test(cleanedStr)) {
    const d = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + 1);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()).toString();
  }
  if (/^(ngày\s*kia|mốt|ngày\s*mốt)$/i.test(cleanedStr)) {
    const d = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + 2);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()).toString();
  }

  // 2.1 Thứ trong tuần (Asia/Ho_Chi_Minh)
  const isNextWeek = /(tuần\s*(sau|tới)|next\s*week)/i.test(str);
  const weekdayMatch = cleanedStr.match(/(?:thứ\s*|t)([2-7]|hai|ba|tư|bốn|năm|sáu|bảy)|chủ\s*nhật|cn/i);
  if (weekdayMatch) {
    const token = weekdayMatch[1] ? weekdayMatch[1].toLowerCase() : 'cn';
    let targetDay = 1; // Default Monday
    if (token === '2' || token === 'hai') targetDay = 1;
    else if (token === '3' || token === 'ba') targetDay = 2;
    else if (token === '4' || token === 'tư' || token === 'bốn') targetDay = 3;
    else if (token === '5' || token === 'năm') targetDay = 4;
    else if (token === '6' || token === 'sáu') targetDay = 5;
    else if (token === '7' || token === 'bảy') targetDay = 6;
    else if (token === 'cn' || /chủ\s*nhật/i.test(cleanedStr)) targetDay = 0;

    const currentDay = nowVN.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7; // Ngày kế tiếp
    if (isNextWeek) diff += 7;

    const targetDate = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + diff);
    return Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).toString();
  }

  // 3. Định dạng ISO: YYYY-MM-DD
  const isoMatch = cleanedStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 2020 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day).toString();
    }
  }

  // 4. Định dạng VN: DD/MM/YYYY hoặc D/M/YYYY
  const dmyMatch = cleanedStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (year >= 2020 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day).toString();
    }
  }

  // 4.1 Định dạng ngày ngắn DD/MM (mặc định năm hiện tại theo Asia/Ho_Chi_Minh)
  const dmShortMatch = cleanedStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dmShortMatch) {
    const day = Number(dmShortMatch[1]);
    const month = Number(dmShortMatch[2]);
    const year = nowVN.getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day).toString();
    }
  }

  // 5. Định dạng văn bản tự nhiên: "ngày 15 tháng 10 (năm 2026)"
  const vnTextMatch = cleanedStr.match(/ng\s*a\s*y\s*(\d{1,2})\s*th\s*a\s*ng\s*(\d{1,2})(?:\s*n\s*a\s*m\s*(\d{4}))?/i);
  if (vnTextMatch) {
    const day = Number(vnTextMatch[1]);
    const month = Number(vnTextMatch[2]);
    const year = Number(vnTextMatch[3] || nowVN.getFullYear());
    if (year >= 2020 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day).toString();
    }
  }

  return null;
}

/**
 * Trích xuất nhãn ngày từ văn bản tự do
 * @param {string} text
 * @returns {string|null}
 */
function extractDateTextFromQuery(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();

  // Bắt các từ khóa tương đối
  const relMatch = t.match(/(hôm\s*nay|ngày\s*mai|ngày\s*kia|mốt|hôm\s*qua|(?:thứ\s*|t)[2-7]|thứ\s*(hai|ba|tư|bốn|năm|sáu|bảy)|chủ\s*nhật|cn)/i);
  if (relMatch) return relMatch[0].trim();

  // Bắt định dạng ngày cụ thể
  const dateMatch = t.match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}|ng\s*a\s*y\s*\d{1,2}\s*th\s*a\s*ng\s*\d{1,2}(?:\s*n\s*a\s*m\s*\d{4})?/i);
  if (dateMatch) return dateMatch[0].trim();

  return null;
}

/**
 * Trích xuất khung thời gian (buổi sáng / buổi chiều) từ văn bản
 * @param {string} text
 * @returns {'morning'|'afternoon'|'all'}
 */
function extractPeriodFromText(text) {
  if (typeof text !== 'string') return 'all';
  if (/(buổi\s*sáng|sáng|morning)/i.test(text)) return 'morning';
  if (/(buổi\s*chiều|chiều|afternoon)/i.test(text)) return 'afternoon';
  return 'all';
}

/**
 * Lấy danh sách các ngày kế tiếp kèm nhãn và timestamp
 * @param {number} days
 */
function getUpcomingDates(days = 7) {
  const result = [];
  const nowVN = getNowVN();
  for (let i = 0; i < days; i++) {
    const d = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + i);
    const dateLabel = formatDateLabel(d);
    const timestampStr = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()).toString();
    result.push({
      dateLabel,
      timestampStr,
      dateObj: d,
    });
  }
  return result;
}

function getVietnamTodayDate() {
  return formatDateLabel(getNowVN());
}

function getVietnamTomorrowDate() {
  const nowVN = getNowVN();
  return formatDateLabel(new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate() + 1));
}

function formatTimestampToVNDate(timestamp) {
  if (!timestamp) return '';
  const num = Number(timestamp);
  if (isNaN(num)) return '';
  return formatDateLabel(new Date(num));
}

const TIME_SLOT_HOURS = {
  T1: { start: 8, startMinute: 0, end: 9, endMinute: 0, label: '08:00 - 09:00' },
  T2: { start: 9, startMinute: 0, end: 10, endMinute: 0, label: '09:00 - 10:00' },
  T3: { start: 10, startMinute: 0, end: 11, endMinute: 0, label: '10:00 - 11:00' },
  T4: { start: 11, startMinute: 0, end: 12, endMinute: 0, label: '11:00 - 12:00' },
  T5: { start: 13, startMinute: 0, end: 14, endMinute: 0, label: '13:00 - 14:00' },
  T6: { start: 14, startMinute: 0, end: 15, endMinute: 0, label: '14:00 - 15:00' },
  T7: { start: 15, startMinute: 0, end: 16, endMinute: 0, label: '15:00 - 16:00' },
  T8: { start: 16, startMinute: 0, end: 17, endMinute: 0, label: '16:00 - 17:00' },
};

/**
 * Kiểm tra xem một khung giờ khám (slot) có thuộc về quá khứ so với thời điểm hiện tại (Asia/Ho_Chi_Minh) hay không
 * @param {string|number} dateInput - Timestamp hoặc chuỗi ngày
 * @param {string} timeType - Mã khung giờ ('T1'...'T8')
 * @returns {boolean}
 */
function isSlotInPast(dateInput, timeType) {
  if (!dateInput || !timeType) return false;
  const nowVN = getNowVN();

  let timestamp = dateInput;
  if (typeof dateInput === 'string' && !/^\d+$/.test(dateInput.trim())) {
    timestamp = normalizeDateToTimestamp(dateInput);
  }
  const dateNum = Number(timestamp);
  if (isNaN(dateNum)) return false;

  const apptDate = new Date(dateNum);
  const targetYear = apptDate.getUTCFullYear();
  const targetMonth = apptDate.getUTCMonth();
  const targetDate = apptDate.getUTCDate();

  const currentYear = nowVN.getFullYear();
  const currentMonth = nowVN.getMonth();
  const currentDate = nowVN.getDate();

  const targetMidnight = Date.UTC(targetYear, targetMonth, targetDate);
  const currentMidnight = Date.UTC(currentYear, currentMonth, currentDate);

  if (targetMidnight < currentMidnight) {
    return true; // Ngày trong quá khứ
  }
  if (targetMidnight > currentMidnight) {
    return false; // Ngày trong tương lai
  }

  // Cùng ngày hôm nay -> kiểm tra giờ bắt đầu của slot
  const slotInfo = TIME_SLOT_HOURS[timeType];
  if (!slotInfo) return false;

  const currentMinutes = nowVN.getHours() * 60 + nowVN.getMinutes();
  const slotStartMinutes = slotInfo.start * 60 + (slotInfo.startMinute || 0);

  return currentMinutes >= slotStartMinutes;
}

/**
 * Lấy thời điểm chính xác của ca khám kết hợp ngày và khung giờ (Asia/Ho_Chi_Minh UTC+7)
 * Trả về Date object theo chuẩn UTC
 * @param {string|number} dateInput - Timestamp (thường là UTC midnight của ngày) hoặc chuỗi ngày
 * @param {string} timeType - Mã khung giờ ('T1'...'T8')
 * @returns {Date|null}
 */
function getExactAppointmentTime(dateInput, timeType) {
  if (!dateInput) return null;
  let timestamp = dateInput;
  if (typeof dateInput === 'string' && !/^\d+$/.test(dateInput.trim())) {
    timestamp = normalizeDateToTimestamp(dateInput);
  }
  const dateNum = Number(timestamp);
  if (isNaN(dateNum)) return null;

  const apptDate = new Date(dateNum);
  const year = apptDate.getUTCFullYear();
  const month = apptDate.getUTCMonth();
  const day = apptDate.getUTCDate();

  const slotInfo = timeType ? TIME_SLOT_HOURS[timeType] : null;
  const hour = slotInfo ? slotInfo.start : 0;
  const minute = slotInfo ? (slotInfo.startMinute || 0) : 0;

  // Giờ Việt Nam là UTC+7, nên thời điểm UTC tương ứng là (hour - 7)
  return new Date(Date.UTC(year, month, day, hour - 7, minute, 0));
}

module.exports = {
  TIMEZONE,
  TIME_SLOT_HOURS,
  getNowVN,
  formatDateLabel,
  formatTimestampToVNDate,
  normalizeDateToTimestamp,
  normalizeNaturalDateToTimestamp: normalizeDateToTimestamp,
  getVietnamTodayDate,
  getVietnamTomorrowDate,
  extractDateTextFromQuery,
  extractPeriodFromText,
  getUpcomingDates,
  isSlotInPast,
  getExactAppointmentTime,
};
