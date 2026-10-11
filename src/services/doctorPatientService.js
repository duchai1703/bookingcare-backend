// src/services/doctorPatientService.js
// [Doctor Patient Relationship & Clinical Dossier Hub]
// Quản lý quan hệ và hồ sơ bệnh nhân dành riêng cho Bác sĩ (Doctor Portal)
// Bảo mật Zero-Trust: Bác sĩ chỉ truy cập hồ sơ bệnh nhân trong phạm vi hành nghề của mình
const db = require('../models');
const { Op } = require('sequelize');

/**
 * Format mã bệnh nhân chuyên nghiệp dạng BN-XXXX
 */
const formatPatientCode = (prefix, id) => {
  return `${prefix}-${String(id).padStart(4, '0')}`;
};

/**
 * Chuyển đổi an toàn chuỗi date thành timestamp (milliseconds)
 */
const parseDateToMs = (dateValue) => {
  if (!dateValue) return null;
  if (typeof dateValue === 'number' && dateValue > 0) return dateValue;
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (!isNaN(trimmed)) {
      const num = Number(trimmed);
      if (num > 0) return num;
    }
    const parsed = new Date(trimmed).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  if (dateValue instanceof Date) {
    const t = dateValue.getTime();
    return isNaN(t) ? null : t;
  }
  return null;
};

/**
 * Tính tuổi từ ngày sinh (YYYY-MM-DD hoặc YYYY)
 */
const calculateAge = (birthday) => {
  if (!birthday) return null;
  const birthYear = parseInt(String(birthday).substring(0, 4), 10);
  if (isNaN(birthYear) || birthYear < 1900) return null;
  const currentYear = new Date().getFullYear();
  return Math.max(0, currentYear - birthYear);
};

/**
 * Phân tích trạng thái tái khám
 */
const evaluateFollowUpStatus = (followUpDate) => {
  if (!followUpDate) return { status: 'none', label: 'Không có hẹn' };
  
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  const targetMs = parseDateToMs(followUpDate);
  if (!targetMs) return { status: 'none', label: 'Không có hẹn' };

  const targetDate = new Date(targetMs);
  const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  
  const diffDays = Math.round((startOfTarget - startOfToday) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { status: 'overdue', label: 'Quá hạn', days: Math.abs(diffDays) };
  } else if (diffDays <= 7) {
    return { status: 'due', label: 'Đến hạn (trong 7 ngày)', days: diffDays };
  } else {
    return { status: 'upcoming', label: 'Sắp tới', days: diffDays };
  }
};

/**
 * Lấy danh sách bệnh nhân duy nhất của bác sĩ kèm KPI và bộ lọc
 */
const getDoctorPatients = async (doctorId, query = {}) => {
  try {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.max(1, parseInt(query.limit, 10) || 10);
    const keyword = (query.keyword || '').trim().toLowerCase();
    const clinicId = query.clinicId ? parseInt(query.clinicId, 10) : null;
    const patientStatus = query.patientStatus || 'all'; // 'all' | 'new' | 'monitoring' | 'need_followup'
    const followUpFilter = query.followUpStatus || 'all'; // 'all' | 'due' | 'overdue' | 'upcoming'
    const timeRange = query.timeRange || 'all'; // 'all' | 'today' | 'this_week' | 'this_month' | 'past_3_months'

    // 1. Lấy tất cả bookings của bác sĩ này
    const bookings = await db.Booking.findAll({
      where: {
        doctorId: Number(doctorId),
      },
      include: [
        {
          model: db.User,
          as: 'patientData',
          attributes: ['id', 'email', 'firstName', 'lastName', 'address', 'gender', 'phoneNumber', 'image'],
          include: [
            { model: db.Allcode, as: 'genderData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
        },
        {
          model: db.Family_Member,
          as: 'familyMemberData',
          attributes: ['id', 'userId', 'fullName', 'relationship', 'gender', 'birthday', 'phoneNumber', 'address', 'nationalId', 'medicalHistory', 'avatar'],
        },
        {
          model: db.Clinic,
          as: 'clinicData',
          attributes: ['id', 'name', 'address'],
        },
        {
          model: db.Allcode,
          as: 'statusData',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
        {
          model: db.Conversation,
          as: 'conversationData',
          attributes: ['id', 'status', 'lastMessageAt'],
          required: false,
        },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      raw: false,
      nest: true,
    });

    // 2. Lấy danh sách conversations của bác sĩ để đếm tin nhắn chưa đọc
    let unreadCountMap = {};
    try {
      if (db.Conversation && db.ChatMessage) {
        const doctorConversations = await db.Conversation.findAll({
          where: { doctorId: Number(doctorId) },
          attributes: ['id', 'bookingId', 'patientId', 'familyMemberId'],
          include: [
            {
              model: db.ChatMessage,
              as: 'messages',
              where: {
                senderId: { [Op.ne]: Number(doctorId) },
                readAt: null,
              },
              attributes: ['id', 'conversationId'],
              required: false,
            },
          ],
        });

        doctorConversations.forEach((conv) => {
          const unreadCount = conv.messages ? conv.messages.length : 0;
          if (unreadCount > 0) {
            const key = conv.familyMemberId ? `family_${conv.familyMemberId}` : `user_${conv.patientId}`;
            unreadCountMap[key] = (unreadCountMap[key] || 0) + unreadCount;
          }
        });
      }
    } catch (chatErr) {
      console.warn('Doctor patient unread chat count warning:', chatErr.message);
    }

    // 3. Gom nhóm theo Unique Patient Identity
    const patientMap = new Map();
    const clinicsMap = new Map();

    for (const b of bookings) {
      // Thu thập cơ sở y tế mà bác sĩ từng khám
      if (b.clinicData && b.clinicData.id) {
        clinicsMap.set(b.clinicData.id, {
          id: b.clinicData.id,
          name: b.clinicData.name,
          address: b.clinicData.address,
        });
      }

      // Xác định khóa nhận dạng cá nhân duy nhất
      const isFamily = Boolean(b.familyMemberId && b.familyMemberData);
      const patientKey = isFamily ? `family_${b.familyMemberId}` : `user_${b.patientId}`;

      let patientRecord = patientMap.get(patientKey);

      // Trích xuất thông tin lâm sàng ca khám
      const encounterItem = {
        bookingId: b.id,
        date: b.date,
        timeType: b.timeType,
        statusId: b.statusId,
        statusText: b.statusData ? b.statusData.valueVi : b.statusId,
        encounterStatus: b.encounterStatus || 'not_started',
        chiefComplaint: b.chiefComplaint || b.reason,
        diagnosis: b.diagnosis || '',
        treatmentPlan: b.treatmentPlan || '',
        followUpDate: b.followUpDate || null,
        followUpExpiresAt: b.followUpExpiresAt || null,
        clinicId: b.clinicId,
        clinicName: b.clinicData ? b.clinicData.name : '',
        hasConversation: Boolean(b.conversationData),
        conversationId: b.conversationData ? b.conversationData.id : null,
      };

      if (!patientRecord) {
        // Tên hiển thị
        let displayName = '';
        let gender = 'O';
        let genderVi = 'Khác';
        let birthday = null;
        let phoneNumber = '';
        let address = '';
        let avatar = null;
        let patientCode = '';
        let accountOwner = null;

        if (isFamily) {
          const fm = b.familyMemberData;
          displayName = fm.fullName || b.patientName || 'Bệnh nhân';
          gender = fm.gender || 'O';
          genderVi = fm.gender === 'G1' ? 'Nam' : fm.gender === 'G2' ? 'Nữ' : 'Khác';
          birthday = fm.birthday || b.patientBirthday;
          phoneNumber = fm.phoneNumber || (b.patientData ? b.patientData.phoneNumber : b.patientPhoneNumber);
          address = fm.address || (b.patientData ? b.patientData.address : b.patientAddress);
          avatar = fm.avatar || null;
          patientCode = formatPatientCode('BN-F', fm.id);
          
          if (b.patientData) {
            accountOwner = {
              id: b.patientData.id,
              name: `${b.patientData.lastName || ''} ${b.patientData.firstName || ''}`.trim() || 'Người đặt',
              phoneNumber: b.patientData.phoneNumber,
              relationship: fm.relationship || b.relationship || 'Người thân',
            };
          }
        } else {
          const u = b.patientData;
          const uName = u ? `${u.lastName || ''} ${u.firstName || ''}`.trim() : '';
          displayName = uName || b.patientName || 'Bệnh nhân';
          gender = u && u.gender ? u.gender : (b.patientGender || 'O');
          genderVi = u && u.genderData ? u.genderData.valueVi : (gender === 'G1' || gender === 'M' ? 'Nam' : gender === 'G2' || gender === 'F' ? 'Nữ' : 'Khác');
          birthday = b.patientBirthday || null;
          phoneNumber = (u && u.phoneNumber) || b.patientPhoneNumber || '';
          address = (u && u.address) || b.patientAddress || '';
          avatar = u && u.image ? u.image : null;
          patientCode = formatPatientCode('BN', b.patientId);
        }

        patientRecord = {
          patientKey,
          patientId: b.patientId,
          familyMemberId: b.familyMemberId || null,
          isFamilyMember: isFamily,
          accountOwner,
          name: displayName,
          patientCode,
          gender,
          genderVi,
          birthday,
          age: calculateAge(birthday),
          phoneNumber,
          address,
          avatar,
          totalVisits: 0,
          latestVisitDate: b.date,
          latestDiagnosis: b.diagnosis || '',
          latestChiefComplaint: b.chiefComplaint || b.reason || '',
          latestEncounterStatus: b.encounterStatus || 'not_started',
          latestClinicName: b.clinicData ? b.clinicData.name : '',
          clinicIds: new Set(),
          followUpDate: b.followUpDate || null,
          followUpExpiresAt: b.followUpExpiresAt || null,
          conversationId: b.conversationData ? b.conversationData.id : null,
          unreadCount: unreadCountMap[patientKey] || 0,
          visits: [],
        };
        patientMap.set(patientKey, patientRecord);
      }

      // Cập nhật thống kê
      patientRecord.totalVisits += 1;
      if (b.clinicId) {
        patientRecord.clinicIds.add(b.clinicId);
      }
      patientRecord.visits.push(encounterItem);

      // Cập nhật followUpDate mới nhất nếu có
      const bTime = parseDateToMs(b.date) || 0;
      const latestTime = parseDateToMs(patientRecord.latestVisitDate) || 0;
      if (b.followUpDate && (!patientRecord.followUpDate || bTime >= latestTime)) {
        patientRecord.followUpDate = b.followUpDate;
      }
      if (b.followUpExpiresAt && (!patientRecord.followUpExpiresAt || bTime >= latestTime)) {
        patientRecord.followUpExpiresAt = b.followUpExpiresAt;
      }
      if (b.conversationData && !patientRecord.conversationId) {
        patientRecord.conversationId = b.conversationData.id;
      }
    }

    // 4. Chuẩn hóa dữ liệu bệnh nhân & Đánh giá trạng thái
    const allPatients = Array.from(patientMap.values()).map((p) => {
      // Sắp xếp các lần khám từ mới nhất đến cũ nhất theo timestamp thực
      p.visits.sort((a, b) => {
        const timeA = parseDateToMs(a.date) || 0;
        const timeB = parseDateToMs(b.date) || 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.bookingId || 0) - (a.bookingId || 0);
      });
      
      const latestVisit = p.visits[0] || {};
      p.latestVisitDate = latestVisit.date || p.latestVisitDate;
      p.latestDiagnosis = latestVisit.diagnosis || p.latestDiagnosis;
      p.latestChiefComplaint = latestVisit.chiefComplaint || p.latestChiefComplaint;
      p.latestClinicName = latestVisit.clinicName || p.latestClinicName;
      p.latestEncounterStatus = latestVisit.encounterStatus || p.latestEncounterStatus;

      // Đánh giá followUp
      const followUpEval = evaluateFollowUpStatus(p.followUpDate);
      p.followUpStatus = followUpEval.status; // 'none' | 'due' | 'overdue' | 'upcoming'
      p.followUpLabel = followUpEval.label;
      p.followUpDays = followUpEval.days;

      // Đánh giá thẻ trạng thái tổng quan (statusTag)
      if (p.followUpStatus === 'due' || p.followUpStatus === 'overdue') {
        p.statusTag = 'need_followup';
        p.statusTagLabel = 'Cần tái khám';
      } else if (p.totalVisits >= 2 || p.latestEncounterStatus === 'in_progress' || p.followUpDate) {
        p.statusTag = 'monitoring';
        p.statusTagLabel = 'Đang theo dõi';
      } else {
        p.statusTag = 'new';
        p.statusTagLabel = 'Bệnh nhân mới';
      }

      // Điều kiện tư vấn sau khám (Chat & Video)
      const now = new Date();
      const isSupportActive = p.followUpExpiresAt ? new Date(p.followUpExpiresAt) > now : true;
      p.canChat = Boolean(p.conversationId || p.totalVisits > 0);
      p.canVideo = isSupportActive && p.totalVisits > 0;
      p.isSupportExpired = !isSupportActive;

      return p;
    });

    // 5. Tính 4 Chỉ số KPI thực tế
    const kpis = {
      totalPatients: allPatients.length,
      monitoringCount: allPatients.filter((p) => p.statusTag === 'monitoring').length,
      needFollowupCount: allPatients.filter((p) => p.statusTag === 'need_followup').length,
      unreadMessagesCount: allPatients.filter((p) => p.unreadCount > 0).length,
    };

    // 6. Áp dụng bộ lọc đa tầng
    let filtered = allPatients;

    // A. Lọc theo từ khóa (Tên, SĐT, Mã BN, Chẩn đoán)
    if (keyword) {
      filtered = filtered.filter((p) => {
        const nameMatch = (p.name || '').toLowerCase().includes(keyword);
        const codeMatch = (p.patientCode || '').toLowerCase().includes(keyword);
        const phoneMatch = (p.phoneNumber || '').toLowerCase().includes(keyword);
        const diagMatch = (p.latestDiagnosis || '').toLowerCase().includes(keyword);
        const reasonMatch = (p.latestChiefComplaint || '').toLowerCase().includes(keyword);
        const ownerMatch = p.accountOwner && (p.accountOwner.name || '').toLowerCase().includes(keyword);
        return nameMatch || codeMatch || phoneMatch || diagMatch || reasonMatch || ownerMatch;
      });
    }

    // B. Lọc theo cơ sở y tế
    if (clinicId) {
      filtered = filtered.filter((p) => p.clinicIds.has(clinicId));
    }

    // C. Lọc theo trạng thái bệnh nhân
    if (patientStatus !== 'all') {
      filtered = filtered.filter((p) => p.statusTag === patientStatus);
    }

    // D. Lọc theo trạng thái tái khám
    if (followUpFilter !== 'all') {
      filtered = filtered.filter((p) => p.followUpStatus === followUpFilter);
    }

    // E. Lọc theo thời gian khám gần nhất
    if (timeRange !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

      filtered = filtered.filter((p) => {
        if (!p.latestVisitDate) return false;
        const vMs = parseDateToMs(p.latestVisitDate);
        if (!vMs) return false;

        const vDate = new Date(vMs);
        const startOfVDate = new Date(vDate.getFullYear(), vDate.getMonth(), vDate.getDate()).getTime();

        if (timeRange === 'today') {
          return startOfVDate === startOfToday;
        }

        // Chênh lệch theo ngày
        const diffDays = Math.round((startOfToday - startOfVDate) / (1000 * 60 * 60 * 24));

        if (timeRange === 'this_week') {
          // Trong vòng 7 ngày qua (hoặc 7 ngày tới)
          return diffDays >= -7 && diffDays <= 7;
        }
        if (timeRange === 'this_month') {
          // Trong vòng 30 ngày qua (hoặc 30 ngày tới)
          return diffDays >= -30 && diffDays <= 30;
        }
        if (timeRange === 'past_3_months') {
          // Trong vòng 90 ngày
          return diffDays >= -90 && diffDays <= 90;
        }
        return true;
      });
    }

    // 7. Sắp xếp danh sách (Mặc định: Ưu tiên bệnh nhân có tin nhắn chưa đọc hoặc khám gần nhất)
    filtered.sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }
      const timeA = parseDateToMs(a.latestVisitDate) || 0;
      const timeB = parseDateToMs(b.latestVisitDate) || 0;
      return timeB - timeA;
    });

    // 8. Phân trang
    const totalRows = filtered.length;
    const totalPages = Math.ceil(totalRows / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedPatients = filtered.slice(startIndex, startIndex + limit).map((p) => {
      // Loại bỏ tập Set clinicIds để JSON serialization sạch sẽ
      const { clinicIds, ...rest } = p;
      return rest;
    });

    return {
      errCode: 0,
      data: {
        kpis,
        patients: paginatedPatients,
        pagination: {
          page,
          limit,
          totalRows,
          totalPages,
        },
        clinics: Array.from(clinicsMap.values()),
      },
    };
  } catch (err) {
    console.error('>>> getDoctorPatients error:', err);
    return { errCode: -1, message: `Lỗi server: ${err.message}` };
  }
};

/**
 * Lấy hồ sơ chi tiết và dòng thời gian lâm sàng (Clinical Dossier) của bệnh nhân
 */
const getDoctorPatientSummary = async (doctorId, patientKey) => {
  try {
    if (!patientKey) {
      return { errCode: 1, message: 'Thiếu mã định danh bệnh nhân!' };
    }

    const isFamily = patientKey.startsWith('family_');
    const targetId = parseInt(patientKey.replace(isFamily ? 'family_' : 'user_', ''), 10);

    const whereClause = {
      doctorId: Number(doctorId),
    };
    if (isFamily) {
      whereClause.familyMemberId = targetId;
    } else {
      whereClause.patientId = targetId;
      whereClause.familyMemberId = null;
    }

    const bookings = await db.Booking.findAll({
      where: whereClause,
      include: [
        {
          model: db.User,
          as: 'patientData',
          attributes: ['id', 'email', 'firstName', 'lastName', 'address', 'gender', 'phoneNumber', 'image'],
          include: [
            { model: db.Allcode, as: 'genderData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
        },
        {
          model: db.Family_Member,
          as: 'familyMemberData',
        },
        {
          model: db.Clinic,
          as: 'clinicData',
          attributes: ['id', 'name', 'address'],
        },
        {
          model: db.Allcode,
          as: 'statusData',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
        {
          model: db.Allcode,
          as: 'timeTypeBooking',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
        {
          model: db.Conversation,
          as: 'conversationData',
          attributes: ['id', 'status', 'lastMessageAt'],
          required: false,
        },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    if (!bookings || bookings.length === 0) {
      return { errCode: 2, message: 'Không tìm thấy hồ sơ bệnh nhân trong phạm vi hành nghề của bác sĩ!' };
    }

    const firstBooking = bookings[0];
    let profile = {};

    if (isFamily && firstBooking.familyMemberData) {
      const fm = firstBooking.familyMemberData;
      profile = {
        patientKey,
        patientCode: formatPatientCode('BN-F', fm.id),
        name: fm.fullName,
        isFamilyMember: true,
        gender: fm.gender,
        genderVi: fm.gender === 'G1' ? 'Nam' : fm.gender === 'G2' ? 'Nữ' : 'Khác',
        birthday: fm.birthday,
        age: calculateAge(fm.birthday),
        phoneNumber: fm.phoneNumber || (firstBooking.patientData ? firstBooking.patientData.phoneNumber : ''),
        address: fm.address || (firstBooking.patientData ? firstBooking.patientData.address : ''),
        nationalId: fm.nationalId,
        medicalHistory: fm.medicalHistory,
        avatar: fm.avatar,
        accountOwner: firstBooking.patientData ? {
          id: firstBooking.patientData.id,
          name: `${firstBooking.patientData.lastName || ''} ${firstBooking.patientData.firstName || ''}`.trim(),
          phoneNumber: firstBooking.patientData.phoneNumber,
          email: firstBooking.patientData.email,
          relationship: fm.relationship || 'Người thân',
        } : null,
      };
    } else {
      const u = firstBooking.patientData;
      profile = {
        patientKey,
        patientCode: formatPatientCode('BN', firstBooking.patientId),
        name: u ? `${u.lastName || ''} ${u.firstName || ''}`.trim() : firstBooking.patientName,
        isFamilyMember: false,
        gender: u ? u.gender : firstBooking.patientGender,
        genderVi: u && u.genderData ? u.genderData.valueVi : 'Khác',
        birthday: firstBooking.patientBirthday,
        age: calculateAge(firstBooking.patientBirthday),
        phoneNumber: (u && u.phoneNumber) || firstBooking.patientPhoneNumber,
        email: u ? u.email : '',
        address: (u && u.address) || firstBooking.patientAddress,
        avatar: u ? u.image : null,
        accountOwner: null,
      };
    }

    // Sắp xếp timeline theo timestamp thực
    const sortedBookings = [...bookings].sort((a, b) => {
      const timeA = parseDateToMs(a.date) || 0;
      const timeB = parseDateToMs(b.date) || 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.id || 0) - (a.id || 0);
    });

    // Danh sách dòng thời gian ca khám
    const timeline = sortedBookings.map((b) => ({
      bookingId: b.id,
      date: b.date,
      timeType: b.timeType,
      timeSlotLabel: b.timeTypeBooking ? b.timeTypeBooking.valueVi : b.timeType,
      statusId: b.statusId,
      statusLabel: b.statusData ? b.statusData.valueVi : b.statusId,
      encounterStatus: b.encounterStatus || 'not_started',
      chiefComplaint: b.chiefComplaint || b.reason,
      symptoms: b.symptoms || '',
      clinicalNotes: b.clinicalNotes || '',
      diagnosis: b.diagnosis || '',
      treatmentPlan: b.treatmentPlan || '',
      followUpDate: b.followUpDate || null,
      careInstructions: b.careInstructions || '',
      clinicName: b.clinicData ? b.clinicData.name : '',
      clinicAddress: b.clinicData ? b.clinicData.address : '',
      conversationId: b.conversationData ? b.conversationData.id : null,
      followUpExpiresAt: b.followUpExpiresAt || null,
      lastSavedAt: b.lastSavedAt,
    }));

    return {
      errCode: 0,
      data: {
        profile,
        totalVisits: bookings.length,
        latestVisit: timeline[0] || null,
        timeline,
      },
    };
  } catch (err) {
    console.error('>>> getDoctorPatientSummary error:', err);
    return { errCode: -1, message: `Lỗi server: ${err.message}` };
  }
};

module.exports = {
  getDoctorPatients,
  getDoctorPatientSummary,
};
