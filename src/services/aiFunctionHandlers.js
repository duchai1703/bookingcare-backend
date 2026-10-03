'use strict';

// ═══════════════════════════════════════════════════════════════════════
// AI Function Handlers & Tool Registry (Phase 01 Stabilization)
// ═══════════════════════════════════════════════════════════════════════

const db = require('../models');
const { Op } = require('sequelize');
const {
  normalizeNaturalDateToTimestamp,
  formatTimestampToVNDate,
  extractPeriodFromText,
} = require('./aiTimezoneUtils');
const patientService = require('./patientService');
const aiBookingDraftStore = require('../utils/aiBookingDraftStore');
const idempotencyStore = require('../utils/idempotencyStore');

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

// --- Sanitize Wildcard ---
function sanitizeWildcard(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[%_]/g, '\\$&');
}

// --- PII Masker ---
function maskPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  let masked = Array.isArray(obj) ? [...obj] : { ...obj };

  if (Array.isArray(masked)) {
    return masked.map(item => maskPII(item));
  }

  // Mask email: abc***@domain.com
  if (masked.email && typeof masked.email === 'string') {
    const parts = masked.email.split('@');
    const local = parts[0] || '';
    const domain = parts[1] || '';
    masked.email = Array.from(local).slice(0, 3).join('') + '***@' + domain;
  }

  // Mask phone number: ****5678
  if (masked.phoneNumber && typeof masked.phoneNumber === 'string') {
    masked.phoneNumber = '****' + Array.from(masked.phoneNumber).slice(-4).join('');
  }

  // Strip critical secrets
  delete masked.password;
  delete masked.tokenVersion;
  delete masked.vnpayTransactionNo;
  delete masked.paymentToken;
  delete masked.token;

  return masked;
}

// --- Truncate 3000 chars ---
function truncateResult(str, max = 3000) {
  const arr = Array.from(str || '');
  if (arr.length <= max) return str;
  return arr.slice(0, max).join('') + '... [đã cắt bớt]';
}

// --- Safe JSON Parse ---
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
// READ-ONLY HANDLERS
// ═══════════════════════════════════════════════════════════════════════

// Handler 1: searchDoctorsBySpecialty (Phase 04 Canonical Discovery & Disambiguation)
async function handleSearchDoctorsBySpecialty(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const { specialtyName, language = 'vi' } = args;
  if (typeof specialtyName !== 'string' || !specialtyName.trim()) {
    return { error: 'Thiếu tên chuyên khoa' };
  }

  const safeName = Array.from(sanitizeWildcard(specialtyName.trim())).slice(0, 500).join('');
  if (signal?.aborted) return { error: 'Đã hủy' };

  // Tìm kiếm danh sách chuyên khoa khớp với từ khóa
  const matchedSpecialties = await db.Specialty.findAll({
    where: { name: { [Op.iLike || Op.like]: `%${safeName}%` } },
    attributes: ['id', 'name'],
    limit: 5,
    lock: false,
  });

  if (!matchedSpecialties || matchedSpecialties.length === 0) {
    return { status: 'empty', specialty: safeName, doctors: [], message: 'Không tìm thấy chuyên khoa phù hợp.' };
  }
  if (signal?.aborted) return { error: 'Đã hủy' };

  let specialty = matchedSpecialties[0];
  // Xử lý ambiguity nếu có nhiều hơn 1 chuyên khoa tương đồng (Section X)
  if (matchedSpecialties.length > 1) {
    const exactMatch = matchedSpecialties.find(
      (s) => s.name.toLowerCase() === safeName.toLowerCase()
    );
    if (exactMatch) {
      specialty = exactMatch;
    } else {
      return {
        status: 'ambiguous',
        specialties: matchedSpecialties.map((s) => ({ id: s.id, name: s.name })),
        message: `Hệ thống tìm thấy nhiều chuyên khoa tương đồng: ${matchedSpecialties.map((s) => s.name).join(', ')}. Bạn muốn tìm bác sĩ cho chuyên khoa nào cụ thể?`,
      };
    }
  }

  // Truy vấn danh sách bác sĩ thuộc chuyên khoa (chỉ lấy bác sĩ đang hoạt động isActive = true)
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
        attributes: ['id', 'name', 'address'],
      },
      {
        model: db.User,
        as: 'doctorData',
        where: { isActive: true },
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

  // Truy vấn đánh giá thực tế từ bảng Review (không fake rating / reviewCount)
  const doctorIds = doctorInfos.map((di) => di.doctorId).filter(Boolean);
  const reviewMap = {};
  if (doctorIds.length > 0) {
    try {
      const reviewStats = await db.Review.findAll({
        where: { doctorId: { [Op.in]: doctorIds } },
        attributes: [
          'doctorId',
          [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'avgRating'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'reviewCount'],
        ],
        group: ['doctorId'],
        raw: true,
      });
      reviewStats.forEach((r) => {
        reviewMap[r.doctorId] = {
          rating: Math.round(Number(r.avgRating) * 10) / 10,
          reviewCount: Number(r.reviewCount),
        };
      });
    } catch (_) {
      // Non-critical review lookup error
    }
  }

  const result = doctorInfos.map((di) => {
    const d = di.toJSON();
    const docId = d.doctorData?.id;
    const rev = docId ? reviewMap[docId] : null;
    return {
      doctorId: docId,
      name: `${d.doctorData?.lastName || ''} ${d.doctorData?.firstName || ''}`.trim(),
      position: language === 'vi' ? d.doctorData?.positionData?.valueVi : d.doctorData?.positionData?.valueEn,
      specialtyId: specialty.id,
      specialtyName: specialty.name,
      clinicId: d.clinicData?.id || null,
      clinicName: d.clinicData?.name || null,
      clinicAddress: d.clinicData?.address || null,
      avatarUrl: null, // User.image is stored as binary BLOB; frontend renders elegant fallback avatar
      price: language === 'vi' ? d.priceData?.valueVi : d.priceData?.valueEn,
      rating: rev ? rev.rating : null,
      reviewCount: rev ? rev.reviewCount : null,
      description: d.description ? Array.from(d.description).slice(0, 200).join('') : '',
    };
  });

  return {
    status: 'success',
    specialtyId: specialty.id,
    specialty: specialty.name,
    specialtyName: specialty.name,
    doctors: result,
  };
}

// Handler 2: getAvailableSchedules (With Asia/Ho_Chi_Minh timezone, period filter & context resolution)
async function handleGetAvailableSchedules(args, signal, context = null) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const rawDate = String(args.date || '').trim();
  const safeRawDate = Array.from(rawDate).slice(0, 500).join('');
  if (!safeRawDate) {
    return {
      status: 'date_required',
      message: 'Bạn muốn xem lịch khám của bác sĩ vào ngày nào? (Ví dụ: hôm nay, ngày mai, thứ Hai, hoặc một ngày cụ thể dạng DD/MM/YYYY).',
    };
  }

  // Chuẩn hóa ngày khám qua Timezone helper (Asia/Ho_Chi_Minh UTC+7)
  const date = normalizeNaturalDateToTimestamp(safeRawDate);
  if (!date) {
    return { error: 'Định dạng ngày không hợp lệ, vui lòng cung cấp ngày dạng DD/MM/YYYY hoặc YYYY-MM-DD.' };
  }

  const dateLabel = formatTimestampToVNDate(date);

  // Xác định khoảng thời gian khám trong ngày (morning / afternoon / all)
  let period = (args.period || '').toLowerCase();
  if (!['morning', 'afternoon'].includes(period)) {
    const extracted = extractPeriodFromText(safeRawDate);
    if (extracted !== 'all') {
      period = extracted;
    } else if (context?.userQuery) {
      period = extractPeriodFromText(context.userQuery);
    } else {
      period = 'all';
    }
  }

  let doctorId = parseInt(String(args.doctorId || ''), 10);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    doctorId = null;
  }

  let resolvedDoctorName = typeof args.doctorName === 'string' ? args.doctorName.trim() : '';

  // Xử lý từ chỉ định ("bác sĩ này", "bác sĩ đó") từ context lượt thoại trước (Section XXIV & XLII)
  const isRelativeDoctorRef = /^(bác\s*sĩ\s*)?(này|đó|ấy|vừa\s*(nêu|nhắc|chọn)|trên)$/i.test(resolvedDoctorName);
  if (isRelativeDoctorRef || (!doctorId && !resolvedDoctorName)) {
    if (context?.lastDoctorId) {
      doctorId = context.lastDoctorId;
    }
    if (context?.lastDoctorName) {
      resolvedDoctorName = context.lastDoctorName;
    }
  }

  // Resolve doctorName -> doctorId nếu chưa có ID
  if (!doctorId && resolvedDoctorName) {
    try {
      const cleanName = resolvedDoctorName
        .replace(/^(Bác\s*sĩ|BS|Tiến\s*sĩ|TS|Thạc\s*sĩ|ThS|PGS|GS|Dr\.?|Giáo\s*sư|Phó\s*Giáo\s*sư)\s*/gi, '')
        .trim();

      const safeDoctorName = Array.from(sanitizeWildcard(cleanName)).slice(0, 500).join('');
      const nameParts = safeDoctorName.split(/\s+/).filter(Boolean);

      let doctor = await db.User.findOne({
        where: {
          roleId: 'R2',
          isActive: true,
          [Op.and]: [
            db.sequelize.where(
              db.sequelize.fn('CONCAT', db.sequelize.col('lastName'), ' ', db.sequelize.col('firstName')),
              { [Op.iLike || Op.like]: `%${safeDoctorName}%` }
            ),
          ],
        },
        attributes: ['id', 'firstName', 'lastName'],
        lock: false,
      });

      if (!doctor && nameParts.length > 0) {
        const orConditions = nameParts.map((part) => ({
          [Op.or]: [
            { firstName: { [Op.iLike || Op.like]: `%${part}%` } },
            { lastName: { [Op.iLike || Op.like]: `%${part}%` } },
          ],
        }));

        doctor = await db.User.findOne({
          where: {
            roleId: 'R2',
            isActive: true,
            [Op.and]: orConditions,
          },
          attributes: ['id', 'firstName', 'lastName'],
          lock: false,
        });
      }

      if (doctor) {
        doctorId = doctor.id;
        resolvedDoctorName = `${doctor.lastName || ''} ${doctor.firstName || ''}`.trim();
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
        message: 'Lỗi khi tìm kiếm bác sĩ theo tên.',
      };
    }
  }

  // Resolve tên nếu chỉ có ID mà chưa có tên
  if (doctorId && !resolvedDoctorName) {
    try {
      const doctor = await db.User.findOne({
        where: { id: doctorId, roleId: 'R2', isActive: true },
        attributes: ['firstName', 'lastName'],
        lock: false,
      });
      if (doctor) {
        resolvedDoctorName = `${doctor.lastName || ''} ${doctor.firstName || ''}`.trim();
      }
    } catch (e) {
      // Non-critical
    }
  }

  if (!doctorId) {
    return { error: 'Thiếu thông tin bác sĩ. Vui lòng cho biết tên hoặc ID bác sĩ.' };
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

  let available = schedules
    .filter((s) => s.currentNumber < s.maxNumber)
    .map((s) => {
      const isMorning = ['T1', 'T2', 'T3', 'T4'].includes(s.timeType);
      return {
        scheduleId: s.id,
        timeType: s.timeType,
        timeLabel: s.timeTypeData?.valueVi,
        displayTime: s.timeTypeData?.valueVi || s.timeType,
        period: isMorning ? 'morning' : 'afternoon',
        remaining: s.maxNumber - s.currentNumber,
      };
    });

  // Lọc theo khoảng thời gian yêu cầu (sáng / chiều)
  if (period === 'morning') {
    available = available.filter((s) => s.period === 'morning');
  } else if (period === 'afternoon') {
    available = available.filter((s) => s.period === 'afternoon');
  }

  if (available.length === 0) {
    const periodLabel = period === 'morning' ? ' vào buổi sáng' : period === 'afternoon' ? ' vào buổi chiều' : '';
    return {
      status: 'no_schedule',
      message: `Bác sĩ ${resolvedDoctorName || 'này'} hiện không có lịch trống trong ngày ${dateLabel || safeRawDate}${periodLabel}. Bạn có muốn xem ngày khác hoặc buổi khác không?`,
      doctorId,
      doctorName: resolvedDoctorName || undefined,
      date,
      dateLabel,
      period,
      availableSlots: [],
      schedules: [],
    };
  }

  return {
    status: 'success',
    doctorId,
    doctorName: resolvedDoctorName || undefined,
    date,
    dateLabel,
    timezone: 'Asia/Ho_Chi_Minh',
    period,
    availableSlots: available,
  };
}

// Handler 3: getClinicInfo
async function handleGetClinicInfo(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  if (typeof args.clinicName !== 'string' || !args.clinicName.trim()) {
    return { error: 'Thiếu tên phòng khám' };
  }

  const safeName = Array.from(sanitizeWildcard(args.clinicName.trim())).slice(0, 500).join('');
  if (signal?.aborted) return { error: 'Đã hủy' };

  const clinics = await db.Clinic.findAll({
    where: { name: { [Op.like]: `%${safeName}%` } },
    attributes: ['id', 'name', 'address', 'descriptionMarkdown'],
    limit: 5,
    order: [['name', 'ASC']],
    lock: false,
  });

  return {
    status: 'success',
    clinics: clinics.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      description: c.descriptionMarkdown ? Array.from(c.descriptionMarkdown).slice(0, 500).join('') : '',
    })),
  };
}

// Handler 4: getDoctorDetail
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

  if (!doctor) return { status: 'not_found', error: 'Không tìm thấy bác sĩ' };

  const d = doctor.toJSON();
  const lang = args.language || 'vi';

  return maskPII({
    status: 'success',
    doctorId: d.id,
    name: `${d.lastName || ''} ${d.firstName || ''}`.trim(),
    position: lang === 'vi' ? d.positionData?.valueVi : d.positionData?.valueEn,
    specialty: d.doctorInfoData?.specialtyData?.name,
    clinic: d.doctorInfoData?.clinicData?.name,
    clinicAddress: d.doctorInfoData?.clinicData?.address,
    price: lang === 'vi' ? d.doctorInfoData?.priceData?.valueVi : d.doctorInfoData?.priceData?.valueEn,
    description: d.doctorInfoData?.description ? Array.from(d.doctorInfoData.description).slice(0, 500).join('') : '',
  });
}

// Handler 5: getMyBookings (Authenticated — Patient IDOR protected)
async function handleGetMyBookings(args, userId, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { error: 'Yêu cầu đăng nhập tài khoản bệnh nhân hợp lệ.' };
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
    status: 'success',
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
        reason: j.reason ? Array.from(j.reason).slice(0, 200).join('') : '',
      });
    }),
  };
}

// Handler 6: getMyPaymentStatus (Authenticated)
async function handleGetMyPaymentStatus(args, userId, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { error: 'Yêu cầu đăng nhập tài khoản bệnh nhân hợp lệ.' };
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

  if (!booking) return { status: 'empty', message: 'Bạn chưa có lịch hẹn nào trên hệ thống.' };

  return {
    status: 'success',
    bookingId: booking.id,
    paymentStatus: booking.paymentStatus,
    price: booking.bookingPrice,
    bookingStatus: booking.statusData?.valueVi,
    date: booking.date,
  };
}

// Handler 7: universalSystemSearch
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
      case 'doctor': {
        if (signal?.aborted) return { error: 'Đã hủy' };
        const where = { roleId: 'R2' };

        if (filters.doctorId) {
          const dId = parseInt(String(filters.doctorId), 10);
          if (Number.isFinite(dId) && dId > 0) where.id = dId;
        }

        if (safeKeyword) {
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

          where[Op.or] = [
            db.sequelize.where(
              db.sequelize.fn('CONCAT', db.sequelize.col('lastName'), ' ', db.sequelize.col('firstName')),
              { [Op.like]: `%${cleanName}%` }
            ),
            ...(nameParts.length > 0 ? [{ [Op.and]: orConditions }] : []),
          ];
        }

        const doctors = await db.User.findAll({
          where,
          attributes: ['id', 'firstName', 'lastName'],
          limit: 10,
          order: [['id', 'ASC']],
          lock: false,
          include: [
            { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['specialtyId', 'clinicId', 'description'],
              include: [
                { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
                { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
                { model: db.Allcode, as: 'priceData', attributes: ['valueVi', 'valueEn'] },
              ],
            },
          ],
        });

        if (doctors.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy bác sĩ phù hợp.' };
        }

        return {
          status: 'success',
          entityType: 'doctor',
          total: doctors.length,
          data: doctors.map((doc) => {
            const j = doc.toJSON();
            return {
              doctorId: j.id,
              name: `${j.lastName || ''} ${j.firstName || ''}`.trim(),
              position: j.positionData?.valueVi,
              specialty: j.doctorInfoData?.specialtyData?.name,
              clinic: j.doctorInfoData?.clinicData?.name,
              clinicAddress: j.doctorInfoData?.clinicData?.address,
              price: j.doctorInfoData?.priceData?.valueVi,
              description: j.doctorInfoData?.description
                ? Array.from(j.doctorInfoData.description).slice(0, 200).join('')
                : '',
            };
          }),
        };
      }

      case 'specialty': {
        if (signal?.aborted) return { error: 'Đã hủy' };
        const where = {};
        if (filters.specialtyId) {
          const sId = parseInt(String(filters.specialtyId), 10);
          if (Number.isFinite(sId) && sId > 0) where.id = sId;
        }
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

        return {
          status: 'success',
          entityType: 'specialty',
          total: specialties.length,
          data: specialties.map((s) => ({
            specialtyId: s.id,
            name: s.name,
            description: s.descriptionMarkdown ? Array.from(s.descriptionMarkdown).slice(0, 300).join('') : '',
          })),
        };
      }

      case 'clinic': {
        if (signal?.aborted) return { error: 'Đã hủy' };
        const where = {};
        if (filters.clinicId) {
          const cId = parseInt(String(filters.clinicId), 10);
          if (Number.isFinite(cId) && cId > 0) where.id = cId;
        }
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
          status: 'success',
          entityType: 'clinic',
          total: clinics.length,
          data: clinics.map((c) => ({
            clinicId: c.id,
            name: c.name,
            address: c.address,
            description: c.descriptionMarkdown ? Array.from(c.descriptionMarkdown).slice(0, 300).join('') : '',
          })),
        };
      }

      case 'review': {
        if (signal?.aborted) return { error: 'Đã hủy' };
        const where = {};
        if (filters.doctorId) {
          const dId = parseInt(String(filters.doctorId), 10);
          if (Number.isFinite(dId) && dId > 0) where.doctorId = dId;
        }
        if (filters.rating) {
          const r = parseInt(String(filters.rating), 10);
          if (Number.isFinite(r) && r >= 1 && r <= 5) where.rating = r;
        }
        if (safeKeyword) {
          where.comment = { [Op.like]: `%${safeKeyword}%` };
        }

        const reviews = await db.Review.findAll({
          where,
          attributes: ['id', 'doctorId', 'patientId', 'rating', 'comment', 'createdAt'],
          limit: 10,
          order: [['createdAt', 'DESC']],
          lock: false,
          include: [
            { model: db.User, as: 'reviewDoctorData', attributes: ['firstName', 'lastName'] },
            { model: db.User, as: 'reviewPatientData', attributes: ['firstName', 'lastName'] },
          ],
        });

        if (reviews.length === 0) {
          return { status: 'empty', message: 'Hệ thống không tìm thấy đánh giá phù hợp.' };
        }

        return {
          status: 'success',
          entityType: 'review',
          total: reviews.length,
          data: reviews.map((rv) => {
            const j = rv.toJSON();
            return {
              reviewId: j.id,
              doctor: `${j.reviewDoctorData?.lastName || ''} ${j.reviewDoctorData?.firstName || ''}`.trim(),
              patient: `${j.reviewPatientData?.lastName || ''} ${j.reviewPatientData?.firstName || ''}`.trim(),
              rating: j.rating,
              comment: j.comment ? Array.from(j.comment).slice(0, 300).join('') : '',
              date: j.createdAt,
            };
          }),
        };
      }

      case 'allcode': {
        if (signal?.aborted) return { error: 'Đã hủy' };
        const where = {};
        if (filters.type && typeof filters.type === 'string') {
          where.type = sanitizeWildcard(filters.type.trim());
        }
        if (filters.keyMap && typeof filters.keyMap === 'string') {
          where.keyMap = sanitizeWildcard(filters.keyMap.trim());
        }
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
          status: 'success',
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
    return { status: 'error', message: 'Lỗi khi truy vấn dữ liệu.' };
  }
}

// Handler 8: getWalletBalance (Authenticated — Patient IDOR protected)
async function handleGetWalletBalance(args, userId, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { error: 'Yêu cầu đăng nhập tài khoản bệnh nhân để xem số dư ví.' };
  }

  try {
    const walletService = require('./walletService');
    const res = await walletService.getWalletOverview(safeUserId);
    if (res.errCode !== 0 || !res.data) {
      return { status: 'empty', message: res.errMessage || 'Không thể tra cứu thông tin ví.' };
    }

    return {
      status: 'success',
      availableBalance: res.data.availableBalance,
      currency: res.data.currency || 'VND',
      reservedBalance: res.data.reservedBalance,
      walletStatus: res.data.status,
    };
  } catch (err) {
    console.error('[AI_FN] getWalletBalance error:', err?.message || err);
    return { status: 'error', message: 'Lỗi khi tra cứu số dư ví.' };
  }
}

// Handler 9: getFamilyMembers (Authenticated — Patient IDOR protected)
async function handleGetFamilyMembers(args, userId, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return { error: 'Yêu cầu đăng nhập tài khoản bệnh nhân để xem danh sách người thân.' };
  }

  try {
    const familyMemberService = require('./familyMemberService');
    const res = await familyMemberService.getFamilyMembers(safeUserId);
    if (res.errCode !== 0 || !Array.isArray(res.data)) {
      return { status: 'empty', message: res.message || 'Không thể tra cứu thông tin người thân.' };
    }

    if (res.data.length === 0) {
      return { status: 'empty', message: 'Bạn chưa có hồ sơ người thân nào được lưu trong sổ y bạ.' };
    }

    return {
      status: 'success',
      total: res.data.length,
      members: res.data.map((m) => {
        const j = typeof m.toJSON === 'function' ? m.toJSON() : m;
        return maskPII({
          id: j.id,
          name: j.name,
          relationship: j.relationship,
          gender: j.gender,
          isPrimary: j.isPrimary,
        });
      }),
    };
  } catch (err) {
    console.error('[AI_FN] getFamilyMembers error:', err?.message || err);
    return { status: 'error', message: 'Lỗi khi tra cứu danh sách người thân.' };
  }
}

// Handler 10: getDoctorReviewsSummary (Public)
async function handleGetDoctorReviewsSummary(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  const doctorId = parseInt(String(args.doctorId || ''), 10);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return { error: 'Thiếu hoặc sai mã định danh bác sĩ (doctorId).' };
  }

  try {
    const reviewService = require('./reviewService');
    const res = await reviewService.getDoctorReviews(doctorId, { page: 1, limit: 5 });
    if (res.errCode !== 0 || !res.data) {
      return { status: 'empty', message: 'Bác sĩ này hiện chưa có đánh giá nào từ bệnh nhân.' };
    }

    return {
      status: 'success',
      doctorId,
      averageRating: res.data.averageRating,
      totalReviews: res.data.totalReviews,
      topReviews: (res.data.reviews || []).slice(0, 3).map((r) => {
        const j = typeof r.toJSON === 'function' ? r.toJSON() : r;
        return {
          patient: `${j.reviewPatientData?.lastName || ''} ${j.reviewPatientData?.firstName || ''}`.trim() || 'Bệnh nhân',
          rating: j.rating,
          comment: j.comment ? Array.from(j.comment).slice(0, 200).join('') : '',
        };
      }),
    };
  } catch (err) {
    console.error('[AI_FN] getDoctorReviewsSummary error:', err?.message || err);
    return { status: 'error', message: 'Lỗi khi tra cứu đánh giá bác sĩ.' };
  }
}

// Handler 11: getSpecialtyDetails (Public)
async function handleGetSpecialtyDetails(args, signal) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  let specialtyId = parseInt(String(args.specialtyId || ''), 10);
  if (!Number.isFinite(specialtyId) || specialtyId <= 0) {
    if (args.specialtyName && typeof args.specialtyName === 'string') {
      const safeName = Array.from(sanitizeWildcard(args.specialtyName.trim())).slice(0, 200).join('');
      const spec = await db.Specialty.findOne({
        where: { name: { [Op.like]: `%${safeName}%` } },
        attributes: ['id'],
      });
      if (spec) specialtyId = spec.id;
    }
  }

  if (!specialtyId) {
    return { status: 'empty', message: 'Không tìm thấy thông tin chuyên khoa yêu cầu.' };
  }

  try {
    const specialtyService = require('./specialtyService');
    const res = await specialtyService.getDetailSpecialtyById(specialtyId);
    if (res.errCode !== 0 || !res.data) {
      return { status: 'empty', message: 'Không thể lấy thông tin chi tiết chuyên khoa.' };
    }

    const sp = res.data;
    return {
      status: 'success',
      id: sp.id,
      name: sp.name,
      description: sp.descriptionMarkdown ? Array.from(sp.descriptionMarkdown).slice(0, 300).join('') : '',
    };
  } catch (err) {
    console.error('[AI_FN] getSpecialtyDetails error:', err?.message || err);
    return { status: 'error', message: 'Lỗi khi tra cứu chi tiết chuyên khoa.' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// [Phase 05 — REAL IN-CHAT BOOKING] TRANSACTIONAL HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handler: prepareBookingDraft
 * Generates a validated BOOKING_DRAFT with cryptographic single-use confirmation token
 * DOES NOT perform real database booking creation
 */
async function handlePrepareBookingDraft(args, userId, signal, context) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  // 1. Strict Patient Authentication Check
  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return {
      status: 'unauthorized',
      error: 'unauthorized',
      message: 'Vui lòng đăng nhập tài khoản bệnh nhân để tạo bản nháp đặt lịch.',
    };
  }

  // 2. Fetch authenticated patient record
  const patient = await db.User.findByPk(safeUserId, {
    attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'gender', 'address', 'roleId'],
    lock: false,
  });
  if (!patient || patient.roleId !== 'R3') {
    return {
      status: 'error',
      error: 'patient_not_eligible',
      message: 'Tài khoản hiện tại không có quyền đặt lịch khám bệnh.',
    };
  }

  // 3. Resolve doctorId (from args or context.lastDoctorId or name lookup)
  let doctorId = parseInt(String(args.doctorId || ''), 10);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    if (args.doctorName && typeof args.doctorName === 'string') {
      const safeDoctorName = Array.from(sanitizeWildcard(args.doctorName.trim())).slice(0, 200).join('');
      const docUser = await db.User.findOne({
        where: {
          roleId: 'R2',
          isActive: true,
          [Op.or]: [
            db.sequelize.where(
              db.sequelize.fn('concat', db.sequelize.col('lastName'), ' ', db.sequelize.col('firstName')),
              { [Op.iLike || Op.like]: `%${safeDoctorName}%` }
            ),
            { firstName: { [Op.iLike || Op.like]: `%${safeDoctorName}%` } },
            { lastName: { [Op.iLike || Op.like]: `%${safeDoctorName}%` } },
          ],
        },
        attributes: ['id'],
      });
      if (docUser) doctorId = docUser.id;
    }
    if (!doctorId && context?.lastDoctorId) {
      doctorId = context.lastDoctorId;
    }
  }

  if (!doctorId) {
    return {
      status: 'error',
      error: 'doctor_not_found',
      message: 'Vui lòng chỉ định bác sĩ cần đặt lịch khám.',
    };
  }

  // 4. Verify Doctor in Database
  const doctor = await db.User.findOne({
    where: { id: doctorId, roleId: 'R2', isActive: true },
    attributes: ['id', 'firstName', 'lastName', 'gender'],
    include: [
      { model: db.Doctor_Info, as: 'doctorInfoData' },
      { model: db.Allcode, as: 'positionData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
    ],
    lock: false,
  });

  if (!doctor) {
    return {
      status: 'error',
      error: 'doctor_not_found',
      message: 'Không tìm thấy bác sĩ hoặc bác sĩ hiện không hoạt động trên hệ thống.',
    };
  }

  if (doctor.doctorInfoData?.workingStatus === 'paused') {
    return {
      status: 'error',
      error: 'doctor_paused',
      message: 'Bác sĩ hiện đang tạm nghỉ nhận lịch khám. Vui lòng chọn bác sĩ khác hoặc liên hệ hỗ trợ!',
    };
  }
  if (doctor.doctorInfoData?.workingStatus === 'suspended') {
    return {
      status: 'error',
      error: 'doctor_suspended',
      message: 'Bác sĩ hiện đã ngừng tiếp nhận lịch khám trên hệ thống!',
    };
  }

  // 5. Resolve Schedule
  let schedule = null;
  const scheduleId = parseInt(String(args.scheduleId || ''), 10);
  if (Number.isFinite(scheduleId) && scheduleId > 0) {
    schedule = await db.Schedule.findOne({
      where: { id: scheduleId, doctorId: doctor.id },
      include: [{ model: db.Allcode, as: 'timeTypeData', attributes: ['keyMap', 'valueVi', 'valueEn'] }],
      lock: false,
    });
  } else if (args.timeType && args.date) {
    let dateStr = String(args.date);
    if (!/^\d+$/.test(dateStr)) {
      const norm = normalizeNaturalDateToTimestamp(dateStr);
      if (norm) dateStr = String(norm.timestamp);
    }
    schedule = await db.Schedule.findOne({
      where: { doctorId: doctor.id, timeType: args.timeType, date: dateStr },
      include: [{ model: db.Allcode, as: 'timeTypeData', attributes: ['keyMap', 'valueVi', 'valueEn'] }],
      lock: false,
    });
  }

  if (!schedule) {
    return {
      status: 'error',
      error: 'schedule_not_found',
      message: 'Khung giờ khám không tồn tại hoặc không khớp với bác sĩ đã chọn.',
    };
  }

  if (schedule.status && schedule.status !== 'ACTIVE') {
    return {
      status: 'error',
      error: 'slot_no_longer_available',
      message: 'Khung giờ khám này bác sĩ đã báo bận hoặc ngừng tiếp nhận lịch hẹn.',
    };
  }

  if (schedule.currentNumber >= schedule.maxNumber) {
    return {
      status: 'error',
      error: 'slot_no_longer_available',
      message: 'Khung giờ này đã hết chỗ! Vui lòng chọn khung giờ khám khác.',
    };
  }

  // 6. Check Duplicate Booking for this Patient
  const existBooking = await db.Booking.findOne({
    where: {
      doctorId: doctor.id,
      patientId: safeUserId,
      date: schedule.date,
      timeType: schedule.timeType,
      statusId: { [Op.ne]: 'S4' },
    },
    lock: false,
  });
  if (existBooking) {
    return {
      status: 'error',
      error: 'duplicate_booking',
      message: 'Bạn đã đặt lịch hẹn với bác sĩ vào khung giờ này rồi!',
    };
  }

  // 7. Resolve Clinic, Specialty & Price
  let clinicName = null;
  let clinicAddress = null;
  if (doctor.doctorInfoData?.clinicId) {
    const clinic = await db.Clinic.findByPk(doctor.doctorInfoData.clinicId, {
      attributes: ['name', 'address'],
      lock: false,
    });
    if (clinic) {
      clinicName = clinic.name;
      clinicAddress = clinic.address;
    }
  }

  let specialtyName = null;
  if (doctor.doctorInfoData?.specialtyId) {
    const specialty = await db.Specialty.findByPk(doctor.doctorInfoData.specialtyId, {
      attributes: ['name'],
      lock: false,
    });
    if (specialty) specialtyName = specialty.name;
  }

  let priceStr = '0';
  if (doctor.doctorInfoData?.priceId) {
    const priceAllcode = await db.Allcode.findOne({
      where: { keyMap: doctor.doctorInfoData.priceId, type: 'PRICE' },
      attributes: ['valueVi', 'valueEn'],
      lock: false,
    });
    if (priceAllcode?.valueVi) priceStr = priceAllcode.valueVi;
  }
  const priceNumeric = parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;
  const priceFormatted = priceNumeric > 0 ? `${priceNumeric.toLocaleString('vi-VN')} VNĐ` : 'Miễn phí';

  // 8. Resolve Family Member if booking for family
  let resolvedFamilyMember = null;
  const bookingFor = args.bookingFor === 'FAMILY' ? 'FAMILY' : 'SELF';
  if (bookingFor === 'FAMILY' && args.familyMemberId) {
    const famId = parseInt(String(args.familyMemberId), 10);
    const fam = await db.Family_Member.findOne({
      where: { id: famId, userId: safeUserId },
      lock: false,
    });
    if (!fam) {
      return {
        status: 'error',
        error: 'family_member_not_found',
        message: 'Không tìm thấy hồ sơ người thân hoặc bạn không có quyền truy cập hồ sơ này.',
      };
    }
    resolvedFamilyMember = {
      id: fam.id,
      fullName: fam.fullName,
      relationship: fam.relationship,
      gender: fam.gender,
      phoneNumber: fam.phoneNumber,
    };
  }

  // 9. Format Date & Time
  const parsedDate = new Date(parseInt(schedule.date, 10));
  const dateFormatted = !isNaN(parsedDate.getTime())
    ? `${parsedDate.getDate().toString().padStart(2, '0')}/${(parsedDate.getMonth() + 1).toString().padStart(2, '0')}/${parsedDate.getFullYear()}`
    : schedule.date;

  const timeLabel = schedule.timeTypeData?.valueVi || schedule.timeType;

  // 10. Generate In-Memory Draft with Single-Use Confirmation Token
  const draftPayload = {
    doctor: {
      doctorId: doctor.id,
      name: `${doctor.lastName || ''} ${doctor.firstName || ''}`.trim(),
      position: doctor.positionData?.valueVi || null,
      specialtyId: doctor.doctorInfoData?.specialtyId || null,
      specialtyName,
      clinicId: doctor.doctorInfoData?.clinicId || null,
      clinicName,
      clinicAddress,
    },
    schedule: {
      scheduleId: schedule.id,
      date: schedule.date,
      dateFormatted,
      timeType: schedule.timeType,
      timeLabel,
      displayTime: timeLabel,
      timezone: 'Asia/Ho_Chi_Minh',
    },
    patient: {
      patientId: safeUserId,
      displayName: `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || patient.email,
      email: patient.email,
      phoneNumber: patient.phoneNumber || args.phoneNumber || '',
      gender: patient.gender,
      address: patient.address || '',
    },
    bookingFor,
    familyMember: resolvedFamilyMember,
    reason: args.reason || '',
    price: {
      amount: priceNumeric,
      currency: 'VND',
      formatted: priceFormatted,
    },
    bookingStatus: 'DRAFT',
    paymentStatus: 'unpaid',
    paymentMethod: 'VNPAY',
    disclaimer: 'Thông tin lịch được kiểm tra tại thời điểm tạo draft. Lịch hẹn chưa được lưu vào cơ sở dữ liệu cho đến khi bạn xác nhận.',
  };

  const draft = aiBookingDraftStore.createDraft(draftPayload);

  return {
    status: 'success',
    type: 'BOOKING_DRAFT',
    message: 'Bản nháp đặt lịch đã được chuẩn bị thành công. Vui lòng kiểm tra và bấm "Xác nhận đặt lịch" để hoàn tất.',
    draft,
  };
}

/**
 * Handler: confirmCreateBooking
 * Revalidates draft, doctor, and slot, executes real database transaction via patientService
 */
async function handleConfirmCreateBooking(args, userId, signal, context) {
  if (signal?.aborted) return { error: 'Đã hủy' };

  // 1. Strict Patient Authentication Check
  const safeUserId = parseInt(String(userId), 10);
  if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
    return {
      status: 'unauthorized',
      error: 'unauthorized',
      message: 'Vui lòng đăng nhập tài khoản bệnh nhân để xác nhận đặt lịch.',
    };
  }

  // 2. Draft ID and Confirmation Token Validation
  const draftId = args.draftId;
  const confirmationToken = args.confirmationToken;
  if (!draftId && !confirmationToken) {
    return {
      status: 'error',
      error: 'confirmation_required',
      message: 'Yêu cầu mã xác thực đặt lịch từ bản nháp. Vui lòng nhấn nút Xác nhận đặt lịch trên phiếu thông tin.',
    };
  }

  // 3. Atomically consume token (Single-Use & IDOR Prevention)
  const consumeResult = aiBookingDraftStore.consumeToken(draftId, confirmationToken, safeUserId);
  if (!consumeResult.valid) {
    if (consumeResult.reason === 'IDOR_MISMATCH') {
      return {
        status: 'error',
        error: 'unauthorized_draft_access',
        message: 'Bạn không có quyền xác nhận bản nháp đặt lịch của bệnh nhân khác.',
      };
    }
    return {
      status: 'error',
      error: 'draft_invalid_or_expired',
      message: consumeResult.message || 'Bản nháp đặt lịch không hợp lệ, đã hết hạn hoặc đã được sử dụng.',
    };
  }
  const draft = consumeResult.draft;

  // 4. Idempotency Lock
  const lockKey = `ai_booking_confirm_${draft.draftId}`;
  const lockAcquired = await idempotencyStore.setInProgress(lockKey);
  if (!lockAcquired) {
    return {
      status: 'error',
      error: 'duplicate_request',
      message: 'Yêu cầu đặt lịch đang được xử lý hoặc đã được xác nhận. Vui lòng không nhấn lại.',
    };
  }

  try {
    // 5. Backend Revalidation (Doctor & Schedule SSOT)
    const doctor = await db.User.findOne({
      where: { id: draft.doctor.doctorId, roleId: 'R2', isActive: true },
      include: [{ model: db.Doctor_Info, as: 'doctorInfoData' }],
      lock: false,
    });
    if (!doctor || doctor.doctorInfoData?.workingStatus === 'paused' || doctor.doctorInfoData?.workingStatus === 'suspended') {
      await idempotencyStore.delete(lockKey);
      return {
        status: 'error',
        error: 'doctor_unavailable',
        message: 'Bác sĩ hiện không thể tiếp nhận lịch khám. Vui lòng chọn bác sĩ khác.',
      };
    }

    const schedule = await db.Schedule.findOne({
      where: {
        id: draft.schedule.scheduleId,
        doctorId: draft.doctor.doctorId,
      },
      lock: false,
    });
    if (!schedule) {
      await idempotencyStore.delete(lockKey);
      return {
        status: 'error',
        error: 'schedule_not_found',
        message: 'Khung giờ khám không tồn tại hoặc đã bị thay đổi.',
      };
    }
    if (schedule.status && schedule.status !== 'ACTIVE') {
      await idempotencyStore.delete(lockKey);
      return {
        status: 'error',
        error: 'slot_no_longer_available',
        message: 'Khung giờ khám này bác sĩ đã báo bận hoặc ngừng tiếp nhận.',
      };
    }
    if (schedule.currentNumber >= schedule.maxNumber) {
      await idempotencyStore.delete(lockKey);
      return {
        status: 'error',
        error: 'slot_no_longer_available',
        message: 'Khung giờ khám này vừa hết chỗ! Vui lòng chọn khung giờ khám khác.',
      };
    }

    // 6. Execute Existing Domain Service (patientService.postBookAppointment)
    const bookingData = {
      email: draft.patient.email,
      fullName: draft.patient.displayName,
      doctorId: draft.doctor.doctorId,
      date: draft.schedule.date,
      timeType: draft.schedule.timeType,
      phoneNumber: draft.patient.phoneNumber || args.phoneNumber || '0900000000',
      gender: draft.patient.gender || 'G1',
      address: draft.patient.address || '',
      reason: args.reason || args.notes || draft.reason || 'Đặt khám qua AI Chatbot BookingCare',
      bookingFor: draft.bookingFor,
      familyMemberId: draft.familyMember?.id,
      clinicId: draft.doctor.clinicId,
      language: args.language || 'vi',
    };

    const domainResult = await patientService.postBookAppointment(bookingData, safeUserId);

    if (domainResult.errCode !== 0) {
      await idempotencyStore.delete(lockKey);
      let mappedCode = 'booking_failed';
      if (domainResult.errCode === 1) mappedCode = 'validation_error';
      else if (domainResult.errCode === 2) mappedCode = 'duplicate_booking';
      else if (domainResult.errCode === 3) mappedCode = 'schedule_not_found';
      else if (domainResult.errCode === 4) mappedCode = 'slot_no_longer_available';
      else if (domainResult.errCode === 5) mappedCode = 'unauthorized';
      else if (domainResult.errCode === 6 || domainResult.errCode === 7) mappedCode = 'doctor_unavailable';

      return {
        status: 'error',
        error: mappedCode,
        message: domainResult.message || 'Không thể tạo lịch hẹn.',
      };
    }

    // 7. Build Canonical BOOKING_SUCCESS Result
    const successPayload = {
      bookingId: domainResult.data?.bookingId,
      bookingStatus: domainResult.data?.statusId || 'S1',
      paymentMethod: domainResult.data?.paymentMethod || 'VNPAY',
      paymentStatus: 'unpaid',
      doctor: draft.doctor,
      schedule: draft.schedule,
      patient: draft.patient,
      price: draft.price,
      createdAt: new Date().toISOString(),
      message: domainResult.message || 'Đặt lịch thành công! Vui lòng kiểm tra email để xác nhận lịch hẹn.',
      nextStep: 'Kiểm tra hộp thư email và bấm vào liên kết xác nhận để hoàn tất thủ tục.',
    };

    await idempotencyStore.setDone(lockKey, successPayload);

    return {
      status: 'success',
      type: 'BOOKING_SUCCESS',
      data: successPayload,
    };
  } catch (err) {
    await idempotencyStore.delete(lockKey);
    console.error('[CONFIRM_BOOKING_ERR]', err);
    return {
      status: 'error',
      error: 'transaction_error',
      message: 'Lỗi trong quá trình xử lý giao dịch đặt lịch khám.',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL REGISTRY METADATA
// ═══════════════════════════════════════════════════════════════════════

const aiToolRegistry = {
  // --- Public Read-Only Tools ---
  searchDoctorsBySpecialty: {
    description: 'Tìm danh sách bác sĩ theo tên chuyên khoa. Trả về tên, vị trí, phòng khám, giá khám.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        specialtyName: { type: 'string', description: 'Tên chuyên khoa (VD: "Cơ xương khớp", "Tim mạch")' },
        language: { type: 'string', enum: ['vi', 'en'], description: 'Ngôn ngữ hiển thị giá' },
      },
      required: ['specialtyName'],
    },
    handler: (args, _userId, signal) => handleSearchDoctorsBySpecialty(args, signal),
  },

  getAvailableSchedules: {
    description: 'Xem các khung giờ còn trống của bác sĩ theo ngày (hôm nay, ngày mai, thứ hai, YYYY-MM-DD...). Truyền doctorName hoặc doctorId và date. Có thể chọn period: morning (buổi sáng) hoặc afternoon (buổi chiều).',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        doctorId: { type: 'number', description: 'ID bác sĩ (optional)' },
        doctorName: { type: 'string', description: 'Tên đầy đủ của bác sĩ (VD: "Tuấn Phan Công", hoặc "bác sĩ này" nếu vừa đề cập)' },
        date: { type: 'string', description: 'Ngày khám: "hôm nay", "ngày mai", "thứ hai", YYYY-MM-DD hoặc DD/MM/YYYY' },
        period: { type: 'string', enum: ['all', 'morning', 'afternoon'], description: 'Lọc khung giờ: morning (buổi sáng) hoặc afternoon (buổi chiều)' },
      },
      required: ['date'],
    },
    handler: (args, _userId, signal, context) => handleGetAvailableSchedules(args, signal, context),
  },

  getClinicInfo: {
    description: 'Lấy thông tin phòng khám hoặc bệnh viện theo tên.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        clinicName: { type: 'string', description: 'Tên phòng khám' },
      },
      required: ['clinicName'],
    },
    handler: (args, _userId, signal) => handleGetClinicInfo(args, signal),
  },

  getDoctorDetail: {
    description: 'Lấy thông tin chi tiết một bác sĩ theo ID (giá khám, phòng khám, chức danh).',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        doctorId: { type: 'number', description: 'ID bác sĩ' },
        language: { type: 'string', enum: ['vi', 'en'] },
      },
      required: ['doctorId'],
    },
    handler: (args, _userId, signal) => handleGetDoctorDetail(args, signal),
  },

  universalSystemSearch: {
    description: 'Siêu công cụ tra cứu tổng hợp dữ liệu hệ thống (bác sĩ, chuyên khoa, phòng khám, đánh giá review, giá khám).',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          enum: ['doctor', 'specialty', 'clinic', 'review', 'allcode'],
          description: 'Loại thực thể cần tra cứu',
        },
        keyword: { type: 'string', description: 'Từ khóa tìm kiếm' },
        filters: { type: 'object', description: 'Bộ lọc chính xác (VD: {"doctorId": 32})' },
      },
      required: ['entityType'],
    },
    handler: (args, _userId, signal) => handleUniversalSystemSearch(args, signal),
  },

  getDoctorReviewsSummary: {
    description: 'Xem điểm đánh giá trung bình và các nhận xét gần đây của bác sĩ theo doctorId.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        doctorId: { type: 'number', description: 'ID của bác sĩ cần xem đánh giá' },
      },
      required: ['doctorId'],
    },
    handler: (args, _userId, signal) => handleGetDoctorReviewsSummary(args, signal),
  },

  getSpecialtyDetails: {
    description: 'Xem thông tin chi tiết và mô tả chuyên khoa theo specialtyId hoặc specialtyName.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: false,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        specialtyId: { type: 'number', description: 'ID chuyên khoa' },
        specialtyName: { type: 'string', description: 'Tên chuyên khoa' },
      },
    },
    handler: (args, _userId, signal) => handleGetSpecialtyDetails(args, signal),
  },

  // --- Authenticated Read-Only Tools (Enforces JWT User Identity) ---
  getMyBookings: {
    description: 'Xem danh sách lịch hẹn của bệnh nhân đang đăng nhập.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['S1,S2', 'S3', 'S4'],
          description: 'Lọc trạng thái: S1,S2 (sắp tới) | S3 (đã khám) | S4 (đã hủy)',
        },
      },
    },
    handler: (args, userId, signal) => handleGetMyBookings(args, userId, signal),
  },

  getMyPaymentStatus: {
    description: 'Xem trạng thái thanh toán của lịch hẹn gần nhất của bệnh nhân đang đăng nhập.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: (args, userId, signal) => handleGetMyPaymentStatus(args, userId, signal),
  },

  getWalletBalance: {
    description: 'Xem số dư khả dụng và trạng thái ví tiền của bệnh nhân đang đăng nhập.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: (args, userId, signal) => handleGetWalletBalance(args, userId, signal),
  },

  getFamilyMembers: {
    description: 'Xem danh sách hồ sơ người thân trong sổ y bạ của bệnh nhân đang đăng nhập.',
    type: 'read_only',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: (args, userId, signal) => handleGetFamilyMembers(args, userId, signal),
  },

  // --- Transactional Tools (Phase 05: Enabled for Real In-Chat Booking) ---
  prepareBookingDraft: {
    description: 'Chuẩn bị bản nháp đặt lịch khám bệnh với bác sĩ tại một khung giờ cụ thể. Trả về thông tin chi tiết và phiếu xác nhận (BOOKING_DRAFT).',
    type: 'transactional',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        doctorId: {
          type: 'integer',
          description: 'ID của bác sĩ cần đặt lịch khám',
        },
        doctorName: {
          type: 'string',
          description: 'Tên bác sĩ nếu chưa có ID',
        },
        scheduleId: {
          type: 'integer',
          description: 'ID của khung giờ khám (scheduleId) lấy từ getAvailableSchedules',
        },
        timeType: {
          type: 'string',
          description: 'Mã khung giờ (T1-T8) nếu không có scheduleId',
        },
        date: {
          type: 'string',
          description: 'Ngày khám dạng timestamp hoặc YYYY-MM-DD',
        },
        reason: {
          type: 'string',
          description: 'Lý do khám hoặc triệu chứng của bệnh nhân',
        },
        bookingFor: {
          type: 'string',
          enum: ['SELF', 'FAMILY'],
          description: 'Đặt lịch cho bản thân (SELF) hoặc người thân (FAMILY)',
        },
        familyMemberId: {
          type: 'integer',
          description: 'ID hồ sơ người thân nếu đặt cho người thân',
        },
      },
      required: [],
    },
    handler: (args, userId, signal, context) => handlePrepareBookingDraft(args, userId, signal, context),
  },

  confirmCreateBooking: {
    description: 'Xác nhận tạo lịch hẹn khám bệnh chính thức sau khi người dùng đã xem và đồng ý với bản nháp (yêu cầu draftId và confirmationToken).',
    type: 'transactional',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'Mã bản nháp đặt lịch (draftId) được tạo từ prepareBookingDraft',
        },
        confirmationToken: {
          type: 'string',
          description: 'Mã xác thực duy nhất (confirmationToken) từ bản nháp',
        },
        notes: {
          type: 'string',
          description: 'Ghi chú thêm của bệnh nhân',
        },
      },
      required: ['draftId', 'confirmationToken'],
    },
    handler: (args, userId, signal, context) => handleConfirmCreateBooking(args, userId, signal, context),
  },

  cancelMyBooking: {
    description: 'Hủy lịch hẹn của bệnh nhân (Chưa kích hoạt trong Phase 01).',
    type: 'transactional',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: false,
    parameters: { type: 'object', properties: {} },
    handler: async () => ({
      status: 'unsupported',
      message: 'Tính năng hủy lịch hẹn qua chat chưa được kích hoạt. Vui lòng hủy tại trang Lịch sử khám bệnh (/patient/history).',
    }),
  },

  requestSmartReschedule: {
    description: 'Yêu cầu dời lịch hẹn thông minh (Chưa kích hoạt trong Phase 01).',
    type: 'transactional',
    allowedRoles: ['R3'],
    requiresAuth: true,
    enabled: false,
    parameters: { type: 'object', properties: {} },
    handler: async () => ({
      status: 'unsupported',
      message: 'Tính năng dời lịch thông minh chưa được kích hoạt trong phiên bản này.',
    }),
  },
};

// ═══════════════════════════════════════════════════════════════════════
// COMPATIBILITY EXPORTS FOR GEMINI FUNCTION DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════

const aiFunctions = {};
const aiAuthFunctions = {};

for (const [name, meta] of Object.entries(aiToolRegistry)) {
  if (meta.enabled) {
    const declaration = {
      description: meta.description,
      parameters: meta.parameters,
    };
    if (meta.requiresAuth) {
      aiAuthFunctions[name] = declaration;
    } else {
      aiFunctions[name] = declaration;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════

async function executeFunctionCall(functionName, args, userId, signal, context = null) {
  const tool = aiToolRegistry[functionName];
  if (!tool) {
    return { status: 'error', error: `Unknown function: ${functionName}` };
  }

  // 1. Transactional / Enabled Guard
  if (!tool.enabled) {
    return {
      status: 'unsupported',
      message: 'Tính năng này đang trong lộ trình phát triển và chưa được kích hoạt.',
    };
  }

  // 2. Auth & IDOR Guard
  if (tool.requiresAuth) {
    const safeUserId = parseInt(String(userId), 10);
    if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
      return { status: 'unauthorized', error: 'Chức năng này yêu cầu đăng nhập tài khoản bệnh nhân hợp lệ.' };
    }
  }

  // 3. Parse JSON arguments safely
  const safeArgs = typeof args === 'string' ? safeJsonParse(args) : args;
  if (!safeArgs && typeof args === 'string') {
    return { status: 'error', error: 'Invalid JSON arguments' };
  }

  try {
    const result = await tool.handler(safeArgs || {}, userId, signal, context);
    const masked = maskPII(result);
    return masked;
  } catch (err) {
    console.error(`[AI_TOOL_EXEC_ERR] Tool: ${functionName}`, err?.message || err);
    return { status: 'error', message: 'Lỗi trong quá trình truy vấn hệ thống.' };
  }
}

module.exports = {
  executeFunctionCall,
  aiToolRegistry,
  aiFunctions,
  aiAuthFunctions,
  handlePrepareBookingDraft,
  handleConfirmCreateBooking,
  maskPII,
  truncateResult,
};
