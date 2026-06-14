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

  // ═══════════════════════════════════════════════════════════════════════
  // [Phase 13] SIÊU CÔNG CỤ — universalSystemSearch
  // Gộp khả năng tra cứu MỌI bảng trong hệ thống vào 1 tool duy nhất
  // ═══════════════════════════════════════════════════════════════════════
  universalSystemSearch: {
    description:
      'Siêu công cụ tra cứu MỌI dữ liệu trong hệ thống BookingCare. Dùng khi người dùng hỏi về Bác sĩ, Chuyên khoa, Phòng khám, Đánh giá (Review) của bệnh nhân, hoặc Từ điển hệ thống (giá khám, tỉnh thành, phương thức thanh toán). Ưu tiên gọi hàm này trước các hàm chuyên biệt khác khi câu hỏi mang tính tổng quát.',
    parameters: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          enum: ['doctor', 'specialty', 'clinic', 'review', 'allcode'],
          description:
            'Loại thực thể cần tra cứu: doctor (bác sĩ), specialty (chuyên khoa), clinic (phòng khám), review (đánh giá bệnh nhân), allcode (từ điển hệ thống: giá, tỉnh, thanh toán)',
        },
        keyword: {
          type: 'string',
          description:
            'Từ khóa tìm kiếm tự do (VD: "Tim mạch", "Chợ Rẫy", "Tốt", "23 năm kinh nghiệm", "PROVINCE")',
        },
        filters: {
          type: 'object',
          description:
            'Bộ lọc chính xác. VD: {"doctorId": 32}, {"type": "PROVINCE"}, {"specialtyName": "Tiêu hóa"}, {"rating": 5}',
        },
      },
      required: ['entityType'],
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
    limit: 20,
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
      status: 'no_schedule',
      message: `Bác sĩ ${resolvedDoctorName || 'này'} hiện không có lịch trống trong ngày được yêu cầu.`,
      doctorId,
      doctorName: resolvedDoctorName || undefined,
      date,
      schedules: [],
    };
  }

  return {
    doctorId,
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
// Handler 7: universalSystemSearch — SIÊU CÔNG CỤ TRA CỨU TOÀN HỆ THỐNG
// ═══════════════════════════════════════════════════════════════════════
async function handleUniversalSystemSearch(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const { entityType, keyword, filters = {} } = args;

  if (!entityType) {
    return { status: 'error', message: 'Thiếu entityType.' };
  }

  const safeKeyword = typeof keyword === 'string'
    ? Array.from(sanitizeWildcard(keyword.trim())).slice(0, 500).join('')
    : '';

  try {
    switch (entityType) {

      // ══════════════════════════════════════════════════
      // CASE 1: DOCTOR — Quét bảng User (roleId: R2)
      // ══════════════════════════════════════════════════
      case 'doctor': {
        if (signal?.aborted) return { error: 'Đã hủy' };

        const where = { roleId: 'R2' };

        // Lọc theo doctorId cụ thể
        if (filters.doctorId) {
          const dId = parseInt(String(filters.doctorId), 10);
          if (Number.isFinite(dId) && dId > 0) where.id = dId;
        }

        // Lọc theo từ khóa tên
        if (safeKeyword) {
          // Bỏ các danh xưng để tìm chính xác tên
          const cleanName = safeKeyword
            .replace(/^(Bác\s*sĩ|BS|Tiến\s*sĩ|TS|Thạc\s*sĩ|ThS|PGS|GS|Dr\.?|Giáo\s*sư|Phó\s*Giáo\s*sư)\s*/gi, '')
            .trim();
            
          const nameParts = cleanName.split(/\s+/).filter(Boolean);
          const orConditions = nameParts.map((part) => ({
            [Op.or]: [
              { firstName: { [Op.like]: `%${part}%` } },
              { lastName: { [Op.like]: `%${part}%` } },
            ],
          }));

          // Hỗ trợ tìm theo chuỗi ghép Tên đầy đủ HOẶC tìm các phần tử của tên
          where[Op.or] = [
            db.sequelize.where(
              db.sequelize.fn('CONCAT', db.sequelize.col('lastName'), ' ', db.sequelize.col('firstName')),
              { [Op.like]: `%${cleanName}%` }
            ),
            ...(orConditions.length > 0 ? [{ [Op.and]: orConditions }] : [])
          ];
        }

        const doctors = await db.User.findAll({
          where,
          attributes: ['id', 'firstName', 'lastName'],
          limit: 10,
          order: [['id', 'ASC']],
          lock: false,
          include: [
            { model: db.Allcode, as: 'positionData', attributes: ['valueVi'] },
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['description', 'specialtyId'],
              include: [
                { model: db.Allcode, as: 'priceData', attributes: ['valueVi'] },
                { model: db.Specialty, as: 'specialtyData', attributes: ['name'] },
                { model: db.Clinic, as: 'clinicData', attributes: ['name', 'address'] },
              ],
            },
          ],
        });

        // Lọc thêm theo keyword trong description (chéo bảng)
        let result = doctors.map((d) => {
          const j = d.toJSON();
          return {
            doctorId: j.id,
            name: `${j.lastName || ''} ${j.firstName || ''}`.trim(),
            position: j.positionData?.valueVi || '',
            specialty: j.doctorInfoData?.specialtyData?.name || '',
            clinic: j.doctorInfoData?.clinicData?.name || '',
            clinicAddress: j.doctorInfoData?.clinicData?.address || '',
            price: j.doctorInfoData?.priceData?.valueVi || '',
            description: j.doctorInfoData?.description
              ? Array.from(j.doctorInfoData.description).slice(0, 200).join('')
              : '',
          };
        });

        // Nếu có keyword, ưu tiên bác sĩ có keyword xuất hiện trong description
        if (safeKeyword && result.length > 0) {
          const kwLower = safeKeyword.toLowerCase();
          const prioritized = result.filter(
            (r) => r.description.toLowerCase().includes(kwLower)
              || r.specialty.toLowerCase().includes(kwLower)
              || r.name.toLowerCase().includes(kwLower)
          );
          if (prioritized.length > 0) result = prioritized;
        }

        // Lọc theo specialtyName trong filters
        if (filters.specialtyName && typeof filters.specialtyName === 'string') {
          const specLower = filters.specialtyName.toLowerCase();
          result = result.filter((r) => r.specialty.toLowerCase().includes(specLower));
        }

        if (result.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy bác sĩ phù hợp.' };
        }
        return { entityType: 'doctor', total: result.length, data: result.slice(0, 10) };
      }

      // ══════════════════════════════════════════════════
      // CASE 2: SPECIALTY — Quét bảng Specialty
      // ══════════════════════════════════════════════════
      case 'specialty': {
        if (signal?.aborted) return { error: 'Đã hủy' };

        const where = {};
        if (safeKeyword) {
          where.name = { [Op.like]: `%${safeKeyword}%` };
        }

        const specialties = await db.Specialty.findAll({
          where,
          attributes: ['id', 'name', 'descriptionMarkdown'],
          limit: 10,
          order: [['name', 'ASC']],
          lock: false,
        });

        if (specialties.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy chuyên khoa phù hợp.' };
        }

        const data = [];
        for (const s of specialties) {
          if (signal?.aborted) return { error: 'Đã hủy' };
          const doctorInfos = await db.Doctor_Info.findAll({
            where: { specialtyId: s.id },
            attributes: ['doctorId', 'description'],
            limit: 4,
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

          const docs = doctorInfos.map((di) => {
            const d = di.toJSON();
            return {
              doctorId: d.doctorData?.id,
              name: `${d.doctorData?.lastName || ''} ${d.doctorData?.firstName || ''}`.trim(),
              position: d.doctorData?.positionData?.valueVi || '',
              price: d.priceData?.valueVi || '',
              clinic: d.clinicData?.name || '',
              address: d.clinicData?.address || '',
              description: d.description
                ? Array.from(d.description).slice(0, 150).join('')
                : '',
            };
          });

          data.push({
            id: s.id,
            name: s.name,
            description: s.descriptionMarkdown
              ? Array.from(s.descriptionMarkdown).slice(0, 200).join('')
              : '',
            doctors: docs,
          });
        }

        return {
          entityType: 'specialty',
          total: specialties.length,
          data,
        };
      }

      // ══════════════════════════════════════════════════
      // CASE 3: CLINIC — Quét bảng Clinic
      // ══════════════════════════════════════════════════
      case 'clinic': {
        if (signal?.aborted) return { error: 'Đã hủy' };

        const where = {};
        if (safeKeyword) {
          where[Op.or] = [
            { name: { [Op.like]: `%${safeKeyword}%` } },
            { address: { [Op.like]: `%${safeKeyword}%` } },
          ];
        }

        const clinics = await db.Clinic.findAll({
          where,
          attributes: ['id', 'name', 'address', 'descriptionMarkdown'],
          limit: 10,
          order: [['name', 'ASC']],
          lock: false,
        });

        if (clinics.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy phòng khám phù hợp.' };
        }
        return {
          entityType: 'clinic',
          total: clinics.length,
          data: clinics.map((c) => ({
            id: c.id,
            name: c.name,
            address: c.address || '',
            description: c.descriptionMarkdown
              ? Array.from(c.descriptionMarkdown).slice(0, 300).join('')
              : '',
          })),
        };
      }

      // ══════════════════════════════════════════════════
      // CASE 4: REVIEW — Quét bảng Review + JOIN Doctor & Patient
      // ══════════════════════════════════════════════════
      case 'review': {
        if (signal?.aborted) return { error: 'Đã hủy' };

        const where = {};

        // Lọc theo doctorId cụ thể
        if (filters.doctorId) {
          const dId = parseInt(String(filters.doctorId), 10);
          if (Number.isFinite(dId) && dId > 0) where.doctorId = dId;
        }

        // Lọc theo rating
        if (filters.rating) {
          const r = parseInt(String(filters.rating), 10);
          if (Number.isFinite(r) && r >= 1 && r <= 5) where.rating = r;
        }

        // Lọc theo keyword trong comment
        if (safeKeyword) {
          where.comment = { [Op.like]: `%${safeKeyword}%` };
        }

        // Nếu có filters.specialtyName → tìm doctorIds thuộc chuyên khoa đó
        if (filters.specialtyName && typeof filters.specialtyName === 'string') {
          const safeSpecName = Array.from(sanitizeWildcard(filters.specialtyName.trim()))
            .slice(0, 500)
            .join('');

          const specialty = await db.Specialty.findOne({
            where: { name: { [Op.like]: `%${safeSpecName}%` } },
            attributes: ['id'],
            lock: false,
          });

          if (specialty) {
            const doctorInfos = await db.Doctor_Info.findAll({
              where: { specialtyId: specialty.id },
              attributes: ['doctorId'],
              lock: false,
            });
            const doctorIds = doctorInfos.map((di) => di.doctorId);
            if (doctorIds.length > 0) {
              where.doctorId = { [Op.in]: doctorIds };
            } else {
              return { status: 'empty', message: `Không tìm thấy bác sĩ chuyên khoa ${filters.specialtyName} để lấy đánh giá.` };
            }
          } else {
            return { status: 'empty', message: `Không tìm thấy chuyên khoa "${filters.specialtyName}" trong hệ thống.` };
          }
        }

        const reviews = await db.Review.findAll({
          where,
          attributes: ['id', 'doctorId', 'patientId', 'rating', 'comment', 'createdAt'],
          limit: 10,
          order: [['createdAt', 'DESC']],
          lock: false,
          include: [
            {
              model: db.User,
              as: 'reviewDoctorData',
              attributes: ['firstName', 'lastName'],
            },
            {
              model: db.User,
              as: 'reviewPatientData',
              attributes: ['firstName', 'lastName'],
            },
          ],
        });

        if (reviews.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy đánh giá phù hợp.' };
        }
        return {
          entityType: 'review',
          total: reviews.length,
          data: reviews.map((rv) => {
            const j = rv.toJSON();
            return {
              reviewId: j.id,
              doctor: `${j.reviewDoctorData?.lastName || ''} ${j.reviewDoctorData?.firstName || ''}`.trim(),
              patient: `${j.reviewPatientData?.lastName || ''} ${j.reviewPatientData?.firstName || ''}`.trim(),
              rating: j.rating,
              comment: j.comment
                ? Array.from(j.comment).slice(0, 300).join('')
                : '',
              date: j.createdAt,
            };
          }),
        };
      }

      // ══════════════════════════════════════════════════
      // CASE 5: ALLCODE — Từ điển hệ thống
      // ══════════════════════════════════════════════════
      case 'allcode': {
        if (signal?.aborted) return { error: 'Đã hủy' };

        const where = {};

        // Lọc theo type (PROVINCE, PRICE, PAYMENT, POSITION...)
        if (filters.type && typeof filters.type === 'string') {
          where.type = sanitizeWildcard(filters.type.trim());
        }

        // Lọc theo keyMap
        if (filters.keyMap && typeof filters.keyMap === 'string') {
          where.keyMap = sanitizeWildcard(filters.keyMap.trim());
        }

        // Tìm theo keyword trong valueVi hoặc valueEn
        if (safeKeyword) {
          where[Op.or] = [
            { valueVi: { [Op.like]: `%${safeKeyword}%` } },
            { valueEn: { [Op.like]: `%${safeKeyword}%` } },
          ];
        }

        const allcodes = await db.Allcode.findAll({
          where,
          attributes: ['id', 'keyMap', 'type', 'valueVi', 'valueEn'],
          limit: 10,
          order: [['type', 'ASC'], ['keyMap', 'ASC']],
          lock: false,
        });

        if (allcodes.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy dữ liệu từ điển phù hợp.' };
        }
        return {
          entityType: 'allcode',
          total: allcodes.length,
          data: allcodes.map((a) => ({
            keyMap: a.keyMap,
            type: a.type,
            valueVi: a.valueVi,
            valueEn: a.valueEn,
          })),
        };
      }

      default:
        return { status: 'error', message: `entityType "${entityType}" không hợp lệ. Chấp nhận: doctor, specialty, clinic, review, allcode.` };
    }
  } catch (err) {
    console.error('[AI_FN] universalSystemSearch error:', err?.message || err);
    return { status: 'error', message: 'Lỗi khi truy vấn dữ liệu. Vui lòng thử lại.' };
  }
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
    universalSystemSearch: () =>
      handleUniversalSystemSearch(safeArgs, signal),
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
    universalSystemSearch: { status: 'empty', message: 'Hệ thống không tìm thấy dữ liệu phù hợp.' },
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
