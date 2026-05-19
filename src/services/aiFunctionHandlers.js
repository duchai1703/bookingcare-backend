'use strict';

const db = require('../models');
const { Op } = require('sequelize');

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

// --- Sanitize Wildcard ---
// Chống SQL Wildcard Injection: escape ký tự % và _ trong LIKE query
function sanitizeWildcard(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[%_]/g, '\\$&');
}

// --- PII Masker ---
// Che thông tin nhạy cảm trước khi trả về cho AI
function maskPII(obj) {
  if (!obj) return obj;
  let masked = { ...obj };

  // Che email: abc***@domain.com
  if (masked.email) {
    const parts = masked.email.split('@');
    const local = parts[0] || '';
    const domain = parts[1] || '';
    masked.email =
      Array.from(local).slice(0, 3).join('') + '***@' + domain;
  }

  // Che SĐT: ****5678
  if (masked.phoneNumber) {
    masked.phoneNumber =
      '****' + Array.from(masked.phoneNumber).slice(-4).join('');
  }

  // Xóa hoàn toàn các trường nhạy cảm
  delete masked.password;
  delete masked.tokenVersion;
  delete masked.vnpayTransactionNo;
  delete masked.paymentToken;
  delete masked.token; // BẮT BUỘC VÁ LỖ HỔNG RÒ RỈ JWT TOKEN

  return masked;
}

// --- Truncate 3000 chars ---
// BẮT BUỘC: Array.from chống Surrogate Mutilation
function truncateResult(str, max = 3000) {
  const arr = Array.from(str || '');
  if (arr.length <= max) return str;
  return arr.slice(0, max).join('') + '... [đã cắt bớt]';
}

// --- Safe JSON Parse với Reviver ---
// Block __proto__, constructor, prototype pollution
function safeJsonParse(str) {
  try {
    return JSON.parse(str, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FUNCTION CALLING DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════

// Nhóm 1: Tra cứu thông tin (Public)
const aiFunctions = {
  searchDoctorsBySpecialty: {
    description:
      'Tìm danh sách bác sĩ theo tên chuyên khoa. Trả về tên, vị trí, phòng khám, giá khám.',
    parameters: {
      type: 'object',
      properties: {
        specialtyName: {
          type: 'string',
          description: 'Tên chuyên khoa (VD: "Cơ xương khớp", "Tim mạch")',
        },
        language: {
          type: 'string',
          enum: ['vi', 'en'],
          description: 'Ngôn ngữ hiển thị giá',
        },
      },
      required: ['specialtyName'],
    },
  },

  getAvailableSchedules: {
    description:
      'Xem các khung giờ còn trống của bác sĩ theo ngày. Truyền doctorName (tên đầy đủ) HOẶC doctorId. Ưu tiên dùng doctorName khi người dùng nói tên bác sĩ.',
    parameters: {
      type: 'object',
      properties: {
        doctorId: {
          type: 'number',
          description: 'ID bác sĩ (optional, dùng khi đã biết ID)',
        },
        doctorName: {
          type: 'string',
          description:
            "Tên đầy đủ của bác sĩ người dùng muốn chọn, ví dụ: 'Nghĩa Phan Hữu' hoặc 'Hải Vũ Công'. Bắt buộc truyền nếu không có doctorId.",
        },
        date: {
          type: 'string',
          description: 'Ngày khám (YYYY-MM-DD hoặc DD/MM/YYYY hoặc timestamp string)',
        },
      },
      required: ['date'],
    },
  },

  getClinicInfo: {
    description: 'Lấy thông tin phòng khám theo tên.',
    parameters: {
      type: 'object',
      properties: {
        clinicName: { type: 'string', description: 'Tên phòng khám' },
      },
      required: ['clinicName'],
    },
  },

  getDoctorDetail: {
    description: 'Lấy thông tin chi tiết một bác sĩ theo ID.',
    parameters: {
      type: 'object',
      properties: {
        doctorId: { type: 'number', description: 'ID bác sĩ' },
        language: { type: 'string', enum: ['vi', 'en'] },
      },
      required: ['doctorId'],
    },
  },
};

// Nhóm 2: Tra cứu cá nhân (Authenticated — cần userId từ JWT)
const aiAuthFunctions = {
  getMyBookings: {
    description:
      'Xem lịch hẹn của bệnh nhân đang đăng nhập. Trả về trạng thái, bác sĩ, ngày giờ.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Lọc theo trạng thái: S1,S2 (sắp tới) | S3 (đã khám) | S4 (đã hủy)',
          enum: ['S1,S2', 'S3', 'S4'],
        },
      },
    },
  },

  getMyPaymentStatus: {
    description: 'Xem trạng thái thanh toán của lịch hẹn gần nhất.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Handler 1: searchDoctorsBySpecialty
// ═══════════════════════════════════════════════════════════════════════
async function handleSearchDoctorsBySpecialty(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const { specialtyName, language = 'vi' } = args;

  if (typeof specialtyName !== 'string' || !specialtyName.trim()) {
    return { error: 'Thiếu tên chuyên khoa' };
  }

  // Sanitize + Khóa 500 chars
  const safeName = Array.from(sanitizeWildcard(specialtyName.trim()))
    .slice(0, 500)
    .join('');

  if (signal?.aborted) return { error: 'Đã hủy' };

  const specialty = await db.Specialty.findOne({
    where: { name: { [Op.like]: `%${safeName}%` } },
    attributes: ['id', 'name'],
    lock: false,
  });

  if (!specialty) return { doctors: [], message: 'Không tìm thấy chuyên khoa' };

  if (signal?.aborted) return { error: 'Đã hủy' };

  const doctorInfos = await db.Doctor_Info.findAll({
    where: { specialtyId: specialty.id },
    attributes: ['doctorId', 'description'],
    limit: 5,
    order: [['doctorId', 'ASC']],
    lock: false,
    include: [
      {
        model: db.Allcode,
        as: 'priceData',
        attributes: ['valueVi', 'valueEn'],
      },
      {
        model: db.Clinic,
        as: 'clinicData',
        attributes: ['name', 'address'],
      },
      {
        model: db.User,
        as: 'doctorData',
        attributes: ['id', 'firstName', 'lastName'],
        include: [
          {
            model: db.Allcode,
            as: 'positionData',
            attributes: ['valueVi', 'valueEn'],
          },
        ],
      },
    ],
  });

  const result = doctorInfos.map((di) => {
    const d = di.toJSON();
    return {
      doctorId: d.doctorData?.id,
      name: `${d.doctorData?.lastName || ''} ${d.doctorData?.firstName || ''}`.trim(),
      position:
        language === 'vi'
          ? d.doctorData?.positionData?.valueVi
          : d.doctorData?.positionData?.valueEn,
      price: language === 'vi' ? d.priceData?.valueVi : d.priceData?.valueEn,
      clinic: d.clinicData?.name,
      address: d.clinicData?.address,
      description: d.description
        ? Array.from(d.description).slice(0, 200).join('')
        : '',
    };
  });

  return { specialty: specialty.name, doctors: result };
}

// ═══════════════════════════════════════════════════════════════════════
// Handler 2: getAvailableSchedules
// ═══════════════════════════════════════════════════════════════════════
async function handleGetAvailableSchedules(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const rawDate = String(args.date || '').trim();
  const safeRawDate = Array.from(rawDate).slice(0, 500).join('');
  if (!safeRawDate) return { error: 'Thiếu ngày khám' };

  const normalizeDateToTimestamp = (value) => {
    if (!value) return null;
    const str = String(value).trim();
    if (/^\d+$/.test(str)) return str; // đã là timestamp

    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return String(Date.UTC(year, month - 1, day));
    }

    const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]);
      const year = Number(dmyMatch[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return String(Date.UTC(year, month - 1, day));
    }

    const vnMatch = str.match(/ng\s*a\s*y\s*(\d{1,2})\s*th\s*a\s*ng\s*(\d{1,2})(?:\s*n\s*a\s*m\s*(\d{4}))?/i);
    if (vnMatch) {
      const day = Number(vnMatch[1]);
      const month = Number(vnMatch[2]);
      const year = Number(vnMatch[3] || new Date().getUTCFullYear());
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return String(Date.UTC(year, month - 1, day));
    }

    return null;
  };

  const date = normalizeDateToTimestamp(safeRawDate);
  if (!date) {
    return { error: 'Định dạng ngày không hợp lệ, vui lòng gọi lại với định dạng YYYY-MM-DD' };
  }

  let doctorId = parseInt(String(args.doctorId || ''), 10);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    doctorId = null;
  }

  let resolvedDoctorName =
    typeof args.doctorName === 'string' ? args.doctorName.trim() : '';

  // ═══ [BƯỚC 2] Resolve doctorName → doctorId nếu chưa có ID ═══
  if (!doctorId && resolvedDoctorName) {
    try {
      // Cắt bỏ các tiền tố danh xưng thường gặp
      const cleanName = resolvedDoctorName
        .replace(/^(Bác\s*sĩ|BS|Tiến\s*sĩ|TS|Thạc\s*sĩ|ThS|PGS|GS|Dr\.?|Giáo\s*sư|Phó\s*Giáo\s*sư)\s*/gi, '')
        .trim();

      const safeDoctorName = Array.from(sanitizeWildcard(cleanName))
        .slice(0, 500)
        .join('');

      // Tách từng từ trong tên để match linh hoạt hơn
      const nameParts = safeDoctorName.split(/\s+/).filter(Boolean);

      let doctor = null;

      // Chiến lược 1: Match CONCAT(lastName, ' ', firstName) chứa toàn bộ chuỗi tên
      doctor = await db.User.findOne({
        where: db.sequelize.where(
          db.sequelize.fn(
            'CONCAT',
            db.sequelize.col('lastName'),
            ' ',
            db.sequelize.col('firstName')
          ),
          { [Op.like]: `%${safeDoctorName}%` }
        ),
        attributes: ['id', 'firstName', 'lastName'],
        include: [{ model: db.Allcode, as: 'roleData', attributes: ['keyMap'] }],
        lock: false,
      });

      // Lọc chỉ lấy bác sĩ (R2)
      if (doctor) {
        const rawDoctor = doctor.toJSON();
        if (rawDoctor.roleData?.keyMap !== 'R2') doctor = null;
      }

      // Chiến lược 2: Nếu CONCAT không match, fallback sang OR trên từng từ
      if (!doctor && nameParts.length > 0) {
        const orConditions = nameParts.map((part) => ({
          [Op.or]: [
            { firstName: { [Op.like]: `%${part}%` } },
            { lastName: { [Op.like]: `%${part}%` } },
          ],
        }));

        doctor = await db.User.findOne({
          where: {
            roleId: 'R2',
            [Op.and]: orConditions,
          },
          attributes: ['id', 'firstName', 'lastName'],
          lock: false,
        });
      }

      if (doctor) {
        doctorId = doctor.id;
        resolvedDoctorName =
          `${doctor.lastName || ''} ${doctor.firstName || ''}`.trim();
      } else {
        return {
          status: 'not_found',
          message: 'Không tìm thấy bác sĩ có tên này trên hệ thống.',
        };
      }
    } catch (lookupErr) {
      console.error('[AI_FN] Doctor name lookup error:', lookupErr?.message || lookupErr);
      return {
        status: 'error',
        message: 'Lỗi khi tìm kiếm bác sĩ theo tên. Vui lòng thử lại.',
      };
    }
  }

  // Resolve tên nếu chỉ có ID mà chưa có tên
  if (doctorId && !resolvedDoctorName) {
    try {
      const doctor = await db.User.findOne({
        where: { id: doctorId, roleId: 'R2' },
        attributes: ['firstName', 'lastName'],
        lock: false,
      });
      if (doctor) {
        resolvedDoctorName =
          `${doctor.lastName || ''} ${doctor.firstName || ''}`.trim();
      }
    } catch (e) {
      // Non-critical — tiếp tục với doctorId
    }
  }

  if (!doctorId) {
    return { error: 'Thiếu thông tin bác sĩ. Vui lòng cho biết tên hoặc chọn bác sĩ từ danh sách.' };
  }

  if (signal?.aborted) return { error: 'Đã hủy' };

  const schedules = await db.Schedule.findAll({
    where: { doctorId, date },
    attributes: ['id', 'timeType', 'maxNumber', 'currentNumber', 'date'],
    limit: 5,
    order: [['timeType', 'ASC']],
    lock: false,
    include: [
      {
        model: db.Allcode,
        as: 'timeTypeData',
        attributes: ['valueVi', 'valueEn'],
      },
    ],
  });

  const available = schedules
    .filter((s) => s.currentNumber < s.maxNumber)
    .map((s) => ({
      scheduleId: s.id,
      timeType: s.timeType,
      timeLabel: s.timeTypeData?.valueVi,
      remaining: s.maxNumber - s.currentNumber,
    }));

  if (available.length === 0) {
    return {
      message: 'Bác sĩ này không có lịch trong ngày yêu cầu. Vui lòng gợi ý bệnh nhân tìm bác sĩ khác.',
      doctorName: resolvedDoctorName || undefined,
      date,
      schedules: [],
    };
  }

  return {
    doctorName: resolvedDoctorName || undefined,
    date,
    availableSlots: available,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Handler 3: getClinicInfo
// ═══════════════════════════════════════════════════════════════════════
async function handleGetClinicInfo(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  if (typeof args.clinicName !== 'string' || !args.clinicName.trim()) {
    return { error: 'Thiếu tên phòng khám' };
  }

  const safeName = Array.from(sanitizeWildcard(args.clinicName.trim()))
    .slice(0, 500)
    .join('');

  if (signal?.aborted) return { error: 'Đã hủy' };

  const clinics = await db.Clinic.findAll({
    where: { name: { [Op.like]: `%${safeName}%` } },
    attributes: ['id', 'name', 'address', 'descriptionMarkdown'],
    limit: 5,
    order: [['name', 'ASC']],
    lock: false,
  });

  return {
    clinics: clinics.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      description: c.descriptionMarkdown
        ? Array.from(c.descriptionMarkdown).slice(0, 500).join('')
        : '',
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Handler 4: getDoctorDetail
// ═══════════════════════════════════════════════════════════════════════
async function handleGetDoctorDetail(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const doctorId = parseInt(String(args.doctorId), 10);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return { error: 'doctorId không hợp lệ' };
  }

  if (signal?.aborted) return { error: 'Đã hủy' };

  const doctor = await db.User.findOne({
    where: { id: doctorId, roleId: 'R2' },
    attributes: ['id', 'firstName', 'lastName'],
    lock: false,
    include: [
      {
        model: db.Allcode,
        as: 'positionData',
        attributes: ['valueVi', 'valueEn'],
      },
      {
        model: db.Doctor_Info,
        as: 'doctorInfoData',
        attributes: ['description', 'note'],
        include: [
          {
            model: db.Allcode,
            as: 'priceData',
            attributes: ['valueVi', 'valueEn'],
          },
          {
            model: db.Specialty,
            as: 'specialtyData',
            attributes: ['name'],
          },
          {
            model: db.Clinic,
            as: 'clinicData',
            attributes: ['name', 'address'],
          },
        ],
      },
    ],
  });

  if (!doctor) return { error: 'Không tìm thấy bác sĩ' };

  const d = doctor.toJSON();
  const lang = args.language || 'vi';

  return maskPII({
    doctorId: d.id,
    name: `${d.lastName || ''} ${d.firstName || ''}`.trim(),
    position:
      lang === 'vi'
        ? d.positionData?.valueVi
        : d.positionData?.valueEn,
    specialty: d.doctorInfoData?.specialtyData?.name,
    clinic: d.doctorInfoData?.clinicData?.name,
    clinicAddress: d.doctorInfoData?.clinicData?.address,
    price:
      lang === 'vi'
        ? d.doctorInfoData?.priceData?.valueVi
        : d.doctorInfoData?.priceData?.valueEn,
    description: d.doctorInfoData?.description
      ? Array.from(d.doctorInfoData.description).slice(0, 500).join('')
      : '',
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Handler 5: getMyBookings (Authenticated)
// ═══════════════════════════════════════════════════════════════════════
async function handleGetMyBookings(args, userId, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { error: 'userId không hợp lệ' };
  }

  if (signal?.aborted) return { error: 'Đã hủy' };

  const whereClause = { patientId: safeUserId };
  if (args.status) {
    const safeStatus = Array.from(String(args.status)).slice(0, 500).join('');
    whereClause.statusId = { [Op.in]: safeStatus.split(',') };
  }

  const bookings = await db.Booking.findAll({
    where: whereClause,
    attributes: [
      'id', 'date', 'timeType', 'statusId', 'paymentStatus',
      'bookingPrice', 'reason', 'patientName', 'createdAt',
    ],
    limit: 5,
    order: [['createdAt', 'DESC']],
    lock: false,
    include: [
      {
        model: db.User,
        as: 'doctorBookingData',
        attributes: ['firstName', 'lastName'],
      },
      {
        model: db.Allcode,
        as: 'statusData',
        attributes: ['valueVi', 'valueEn'],
      },
      {
        model: db.Allcode,
        as: 'timeTypeBooking',
        attributes: ['valueVi', 'valueEn'],
      },
    ],
  });

  return {
    bookings: bookings.map((b) => {
      const j = b.toJSON();
      return maskPII({
        bookingId: j.id,
        doctor: `${j.doctorBookingData?.lastName || ''} ${j.doctorBookingData?.firstName || ''}`.trim(),
        date: j.date,
        time: j.timeTypeBooking?.valueVi,
        status: j.statusData?.valueVi,
        statusId: j.statusId,
        paymentStatus: j.paymentStatus,
        price: j.bookingPrice,
        reason: j.reason
          ? Array.from(j.reason).slice(0, 200).join('')
          : '',
      });
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Handler 6: getMyPaymentStatus (Authenticated)
// ═══════════════════════════════════════════════════════════════════════
async function handleGetMyPaymentStatus(args, userId, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { error: 'userId không hợp lệ' };
  }

  if (signal?.aborted) return { error: 'Đã hủy' };

  const booking = await db.Booking.findOne({
    where: { patientId: safeUserId },
    attributes: ['id', 'paymentStatus', 'bookingPrice', 'statusId', 'date'],
    order: [['createdAt', 'DESC']],
    lock: false,
    include: [
      {
        model: db.Allcode,
        as: 'statusData',
        attributes: ['valueVi'],
      },
    ],
  });

  if (!booking) return { message: 'Không tìm thấy lịch hẹn nào' };

  return {
    bookingId: booking.id,
    paymentStatus: booking.paymentStatus,
    price: booking.bookingPrice,
    bookingStatus: booking.statusData?.valueVi,
    date: booking.date,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════
async function executeFunctionCall(functionName, args, userId, signal) {
  // Parse args bằng safeJsonParse
  const safeArgs = typeof args === 'string' ? safeJsonParse(args) : args;
  if (!safeArgs && typeof args === 'string') {
    return { error: 'Invalid JSON arguments' };
  }

  const handlers = {
    searchDoctorsBySpecialty: () =>
      handleSearchDoctorsBySpecialty(safeArgs, signal),
    getAvailableSchedules: () =>
      handleGetAvailableSchedules(safeArgs, signal),
    getClinicInfo: () => handleGetClinicInfo(safeArgs, signal),
    getDoctorDetail: () => handleGetDoctorDetail(safeArgs, signal),
    getMyBookings: () => handleGetMyBookings(safeArgs, userId, signal),
    getMyPaymentStatus: () =>
      handleGetMyPaymentStatus(safeArgs, userId, signal),
  };

  const handler = handlers[functionName];
  if (!handler) return { error: `Unknown function: ${functionName}` };

  const emptyResults = {
    searchDoctorsBySpecialty: { doctors: [], message: 'No data found' },
    getAvailableSchedules: { schedules: [], message: 'No data found' },
    getClinicInfo: { clinics: [], message: 'No data found' },
    getDoctorDetail: { message: 'No data found' },
    getMyBookings: { bookings: [], message: 'No data found' },
    getMyPaymentStatus: { message: 'No data found' },
  };

  let result;
  try {
    result = await handler();
  } catch (err) {
    result = emptyResults[functionName] || { message: 'No data found' };
  }

  // Truncate 3000 chars + Bọc Delimiter DB
  const resultStr = JSON.stringify(result);
  const truncated = truncateResult(resultStr, 3000);

  return `---DB_RESULT---\n${truncated}\n---/DB_RESULT---`;
}

module.exports = { executeFunctionCall, aiFunctions, aiAuthFunctions };
