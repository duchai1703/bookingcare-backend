// src/services/doctorManageService.js
// Healthcare Enterprise: Doctor Operations Center, Lifecycle Management, Commission & Settlement
const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');

// ─────────────────────────────────────────────────────────────────────────────
// 1. MASTER: Lấy danh sách bác sĩ kèm các chỉ số vận hành, tài chính & bộ lọc
// ─────────────────────────────────────────────────────────────────────────────
const getAdminDoctorsList = async ({
  page = 1,
  limit = 15,
  search = '',
  status = 'all',
  specialtyId = 'all',
  clinicId = 'all',
  paymentStatus = 'all',
}) => {
  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 15);

    // 1.1 Lấy toàn bộ bác sĩ (roleId: 'R2') kèm Doctor_Info, Specialty, Clinic, Position
    const doctorUsers = await db.User.findAll({
      where: { roleId: 'R2' },
      attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'address', 'gender', 'positionId', 'image'],
      include: [
        {
          model: db.Doctor_Info,
          as: 'doctorInfoData',
          include: [
            { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
            { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
          ],
        },
        {
          model: db.Allcode,
          as: 'positionData',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
      ],
      order: [['id', 'ASC']],
    });

    // 1.2 Lấy thông tin thống kê tài chính và lịch khám song song
    // a. Doanh thu theo bác sĩ từ Bookings (hoàn tất S3 hoặc đã thanh toán)
    const revenueStats = await db.sequelize.query(
      `SELECT 
         "doctorId",
         COUNT(*)::INT AS "totalBookings",
         COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END)::INT AS "completedBookings",
         COUNT(CASE WHEN "statusId" = 'S4' THEN 1 END)::INT AS "cancelledBookings",
         COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0)::FLOAT AS "grossRevenue"
       FROM "Bookings"
       GROUP BY "doctorId"`,
      { type: db.sequelize.QueryTypes.SELECT }
    );
    const revenueMap = new Map();
    revenueStats.forEach((r) => revenueMap.set(r.doctorId, r));

    // b. Tổng số tiền đã thanh toán (Doctor_Settlements)
    const payoutStats = await db.sequelize.query(
      `SELECT 
         "doctorId",
         COALESCE(SUM("netPayout"), 0)::FLOAT AS "totalPaid"
       FROM "Doctor_Settlements"
       WHERE "payoutStatus" = 'paid'
       GROUP BY "doctorId"`,
      { type: db.sequelize.QueryTypes.SELECT }
    );
    const payoutMap = new Map();
    payoutStats.forEach((p) => payoutMap.set(p.doctorId, p.totalPaid));

    // c. Thống kê lịch khám 7 ngày tới
    const nowTs = moment().startOf('day').valueOf();
    const next7dTs = moment().add(7, 'days').endOf('day').valueOf();
    const scheduleStats = await db.sequelize.query(
      `SELECT 
         "doctorId",
         COUNT(*)::INT AS "totalSlots",
         COALESCE(SUM("currentNumber"), 0)::INT AS "occupiedSlots",
         COALESCE(SUM("maxNumber"), 0)::INT AS "capacitySlots"
       FROM "Schedules"
       WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to
       GROUP BY "doctorId"`,
      { replacements: { from: String(nowTs), to: String(next7dTs) }, type: db.sequelize.QueryTypes.SELECT }
    );
    const scheduleMap = new Map();
    scheduleStats.forEach((s) => scheduleMap.set(s.doctorId, s));

    // 1.3 Tổng hợp dữ liệu cho từng bác sĩ
    let enrichedDoctors = doctorUsers.map((u) => {
      const docInfo = u.doctorInfoData || {};
      const rev = revenueMap.get(u.id) || { totalBookings: 0, completedBookings: 0, cancelledBookings: 0, grossRevenue: 0 };
      const paid = payoutMap.get(u.id) || 0;
      const sched = scheduleMap.get(u.id) || { totalSlots: 0, occupiedSlots: 0, capacitySlots: 0 };

      const commissionRate = parseFloat(docInfo.commissionRate) || 15.0;
      const workingStatus = docInfo.workingStatus || 'active';
      const grossRevenue = parseFloat(rev.grossRevenue) || 0;
      const platformFee = Math.round(grossRevenue * (commissionRate / 100));
      const netRevenue = Math.max(0, grossRevenue - platformFee);
      const pendingPayout = Math.max(0, netRevenue - paid);

      const utilizationRate = sched.capacitySlots > 0
        ? Math.min(100, Math.round((sched.occupiedSlots / sched.capacitySlots) * 100))
        : 0;

      const cancellationRate = rev.totalBookings > 0
        ? Math.round((rev.cancelledBookings / rev.totalBookings) * 100)
        : 0;

      // Base64 image
      let avatarBase64 = null;
      if (u.image) {
        const rawBase64 = convertBlobToBase64(u.image);
        if (rawBase64) {
          avatarBase64 = rawBase64.startsWith('data:image')
            ? rawBase64
            : `data:image/jpeg;base64,${rawBase64}`;
        }
      }

      return {
        id: u.id,
        doctorId: u.id,
        doctorCode: `DOC${String(u.id).padStart(4, '0')}`,
        doctorName: `${u.lastName} ${u.firstName}`.trim(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phoneNumber: u.phoneNumber || '—',
        positionId: u.positionId,
        positionVi: u.positionData?.valueVi || 'Bác sĩ',
        positionEn: u.positionData?.valueEn || 'Doctor',
        specialtyId: docInfo.specialtyId,
        specialtyName: docInfo.specialtyData?.name || 'Chuyên khoa chung',
        clinicId: docInfo.clinicId,
        clinicName: docInfo.clinicData?.name || 'Cơ sở BookingCare',
        avatar: avatarBase64,
        workingStatus,
        commissionRate,
        bankAccountNumber: docInfo.bankAccountNumber || '—',
        bankName: docInfo.bankName || '—',
        bankAccountName: docInfo.bankAccountName || '—',
        // Operational stats
        weeklySlots: sched.totalSlots,
        occupiedSlots: sched.occupiedSlots,
        utilizationRate,
        completedBookings: rev.completedBookings,
        cancelledBookings: rev.cancelledBookings,
        cancellationRate,
        // Financial stats
        grossRevenue,
        platformFee,
        netRevenue,
        totalPaid: paid,
        pendingPayout,
      };
    });

    // 1.4 Áp dụng các Bộ lọc (Filters)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      enrichedDoctors = enrichedDoctors.filter(
        (d) =>
          d.doctorName.toLowerCase().includes(q) ||
          d.email.toLowerCase().includes(q) ||
          d.phoneNumber.includes(q) ||
          d.doctorCode.toLowerCase().includes(q) ||
          d.specialtyName.toLowerCase().includes(q) ||
          d.clinicName.toLowerCase().includes(q)
      );
    }

    if (status !== 'all') {
      enrichedDoctors = enrichedDoctors.filter((d) => d.workingStatus === status);
    }

    if (specialtyId !== 'all') {
      const spId = parseInt(specialtyId, 10);
      enrichedDoctors = enrichedDoctors.filter((d) => d.specialtyId === spId);
    }

    if (clinicId !== 'all') {
      const clId = parseInt(clinicId, 10);
      enrichedDoctors = enrichedDoctors.filter((d) => d.clinicId === clId);
    }

    if (paymentStatus === 'pending') {
      enrichedDoctors = enrichedDoctors.filter((d) => d.pendingPayout > 0);
    } else if (paymentStatus === 'paid') {
      enrichedDoctors = enrichedDoctors.filter((d) => d.pendingPayout === 0 && d.grossRevenue > 0);
    } else if (paymentStatus === 'none') {
      enrichedDoctors = enrichedDoctors.filter((d) => d.grossRevenue === 0);
    }

    // 1.5 Tính toán Summary KPIs & Action Center Alerts (trên toàn bộ bác sĩ trước khi phân trang)
    const allDoctors = doctorUsers.map((u) => {
      const docInfo = u.doctorInfoData || {};
      const rev = revenueMap.get(u.id) || { grossRevenue: 0, totalBookings: 0, cancelledBookings: 0 };
      const paid = payoutMap.get(u.id) || 0;
      const sched = scheduleMap.get(u.id) || { totalSlots: 0 };
      const comm = parseFloat(docInfo.commissionRate) || 15.0;
      const gross = parseFloat(rev.grossRevenue) || 0;
      const net = Math.max(0, gross - Math.round(gross * (comm / 100)));
      const pending = Math.max(0, net - paid);
      const cancelRate = rev.totalBookings > 0 ? (rev.cancelledBookings / rev.totalBookings) * 100 : 0;
      return {
        id: u.id,
        workingStatus: docInfo.workingStatus || 'active',
        weeklySlots: sched.totalSlots,
        pendingPayout: pending,
        grossRevenue: gross,
        cancelRate,
      };
    });

    const summaryKpis = {
      totalDoctors: allDoctors.length,
      activeDoctors: allDoctors.filter((d) => d.workingStatus === 'active').length,
      pausedDoctors: allDoctors.filter((d) => d.workingStatus === 'paused').length,
      suspendedDoctors: allDoctors.filter((d) => d.workingStatus === 'suspended').length,
      pendingPayoutDoctors: allDoctors.filter((d) => d.pendingPayout > 0).length,
      totalPendingPayout: allDoctors.reduce((sum, d) => sum + d.pendingPayout, 0),
      totalGrossRevenue: allDoctors.reduce((sum, d) => sum + d.grossRevenue, 0),
    };

    const actionAlerts = {
      unpaidDoctorsCount: allDoctors.filter((d) => d.pendingPayout > 0).length,
      noScheduleDoctorsCount: allDoctors.filter((d) => d.workingStatus === 'active' && d.weeklySlots === 0).length,
      highCancelDoctorsCount: allDoctors.filter((d) => d.cancelRate >= 15).length,
    };

    // 1.6 Phân trang (Pagination)
    const totalCount = enrichedDoctors.length;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const paginatedDoctors = enrichedDoctors.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return {
      errCode: 0,
      data: {
        doctors: paginatedDoctors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages,
        },
        summaryKpis,
        actionAlerts,
      },
    };
  } catch (error) {
    console.error('Error in getAdminDoctorsList:', error);
    return { errCode: -1, errMessage: 'Lỗi máy chủ khi lấy danh sách bác sĩ: ' + error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. DETAIL: Doctor Operational Workspace (Hồ sơ, KPI, Lịch tuần, Bệnh nhân, Tài chính)
// ─────────────────────────────────────────────────────────────────────────────
const getAdminDoctorWorkspace = async (doctorId) => {
  try {
    const docId = parseInt(doctorId, 10);
    if (!docId) {
      return { errCode: 1, errMessage: 'Thiếu mã bác sĩ (doctorId)!' };
    }

    const doctor = await db.User.findOne({
      where: { id: docId, roleId: 'R2' },
      attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'address', 'gender', 'positionId', 'image', 'createdAt'],
      include: [
        {
          model: db.Doctor_Info,
          as: 'doctorInfoData',
          include: [
            { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
            { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
            { model: db.Allcode, as: 'priceData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'provinceData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'paymentData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
        },
        {
          model: db.Allcode,
          as: 'positionData',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
      ],
    });

    if (!doctor) {
      return { errCode: 2, errMessage: 'Không tìm thấy bác sĩ trong hệ thống!' };
    }

    const docInfo = doctor.doctorInfoData || {};
    const commissionRate = parseFloat(docInfo.commissionRate) || 15.0;
    const workingStatus = docInfo.workingStatus || 'active';

    // a. KPIs trọn đời
    const [stats] = await db.sequelize.query(
      `SELECT 
         COUNT(*)::INT AS "totalBookings",
         COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END)::INT AS "completedBookings",
         COUNT(CASE WHEN "statusId" = 'S4' THEN 1 END)::INT AS "cancelledBookings",
         COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0)::FLOAT AS "grossRevenue",
         COALESCE(SUM("refundAmount"), 0)::FLOAT AS "totalRefund"
       FROM "Bookings"
       WHERE "doctorId" = :doctorId`,
      { replacements: { doctorId: docId }, type: db.sequelize.QueryTypes.SELECT }
    );

    const grossRevenue = parseFloat(stats?.grossRevenue || 0);
    const platformFee = Math.round(grossRevenue * (commissionRate / 100));
    const netRevenue = Math.max(0, grossRevenue - platformFee);

    // b. Tổng đã thanh toán (Doctor_Settlements)
    const settlements = await db.Doctor_Settlement.findAll({
      where: { doctorId: docId },
      order: [['paidAt', 'DESC'], ['createdAt', 'DESC']],
    });
    const totalPaid = settlements
      .filter((s) => s.payoutStatus === 'paid')
      .reduce((sum, s) => sum + (parseFloat(s.netPayout) || 0), 0);
    const pendingPayout = Math.max(0, netRevenue - totalPaid);

    // c. Đánh giá từ bệnh nhân
    const [reviewStats] = await db.sequelize.query(
      `SELECT 
         COUNT(*)::INT AS "reviewCount",
         COALESCE(AVG(r.rating), 0)::FLOAT AS "avgRating"
       FROM "Reviews" r
       INNER JOIN "Bookings" b ON r."bookingId" = b.id
       WHERE b."doctorId" = :doctorId`,
      { replacements: { doctorId: docId }, type: db.sequelize.QueryTypes.SELECT }
    );

    // d. Lịch sử thay đổi hoa hồng
    const commissionLogs = await db.Doctor_Commission_Log.findAll({
      where: { doctorId: docId },
      order: [['createdAt', 'DESC']],
    });

    // e. Xu hướng doanh thu 6 tháng gần nhất
    const sixMonthsAgo = moment().subtract(5, 'months').startOf('month').valueOf();
    const monthlyRevenueRows = await db.sequelize.query(
      `SELECT 
         TO_CHAR(TO_TIMESTAMP(CAST(date AS BIGINT) / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS "month",
         COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0)::FLOAT AS "grossRevenue",
         COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END)::INT AS "completedBookings"
       FROM "Bookings"
       WHERE "doctorId" = :doctorId AND CAST(date AS BIGINT) >= :sixMonthsAgo
       GROUP BY "month"
       ORDER BY "month" ASC`,
      { replacements: { doctorId: docId, sixMonthsAgo: String(sixMonthsAgo) }, type: db.sequelize.QueryTypes.SELECT }
    );

    // f. Lịch khám tuần tới (7 ngày tới: hôm nay -> +6 ngày)
    const startWeek = moment().startOf('day').valueOf();
    const endWeek = moment().add(6, 'days').endOf('day').valueOf();

    const schedules = await db.Schedule.findAll({
      where: {
        doctorId: docId,
        date: { [Op.between]: [String(startWeek), String(endWeek)] },
      },
      order: [['date', 'ASC'], ['timeType', 'ASC']],
    });

    // Lấy các ca đặt khám trong 7 ngày tới của bác sĩ này
    const upcomingBookings = await db.Booking.findAll({
      where: {
        doctorId: docId,
        date: { [Op.between]: [String(startWeek), String(endWeek)] },
      },
      attributes: ['id', 'patientId', 'patientName', 'patientPhoneNumber', 'date', 'timeType', 'statusId', 'paymentStatus', 'bookingPrice', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    const scheduleWithBookings = schedules.map((sch) => {
      const slotBookings = upcomingBookings.filter(
        (b) => String(b.date) === String(sch.date) && b.timeType === sch.timeType
      );
      return {
        id: sch.id,
        date: sch.date,
        dateStr: moment(parseInt(sch.date, 10)).format('DD/MM/YYYY'),
        dayOfWeek: moment(parseInt(sch.date, 10)).format('dddd'),
        timeType: sch.timeType,
        maxNumber: sch.maxNumber || 10,
        currentNumber: sch.currentNumber || slotBookings.length,
        bookings: slotBookings,
      };
    });

    // g. Mạng lưới bệnh nhân đã từng khám với bác sĩ này
    const patientsRows = await db.sequelize.query(
      `SELECT 
         b."patientId",
         COALESCE(b."patientName", CONCAT(u."lastName", ' ', u."firstName"), 'Bệnh nhân') AS "patientName",
         u.email,
         COALESCE(u."phoneNumber", b."patientPhoneNumber", '—') AS "phoneNumber",
         MAX(CAST(b.date AS BIGINT)) AS "lastVisitDate",
         COUNT(*)::INT AS "totalVisits",
         COUNT(CASE WHEN b."statusId" = 'S3' THEN 1 END)::INT AS "completedVisits",
         COALESCE(SUM(b."bookingPrice"), 0)::FLOAT AS "totalSpent"
       FROM "Bookings" b
       LEFT JOIN "Users" u ON b."patientId" = u.id
       WHERE b."doctorId" = :doctorId
       GROUP BY b."patientId", b."patientName", u."lastName", u."firstName", u.email, u."phoneNumber", b."patientPhoneNumber"
       ORDER BY "lastVisitDate" DESC
       LIMIT 50`,
      { replacements: { doctorId: docId }, type: db.sequelize.QueryTypes.SELECT }
    );

    // h. Format avatar
    let avatarBase64 = null;
    if (doctor.image) {
      const rawBase64 = convertBlobToBase64(doctor.image);
      if (rawBase64) {
        avatarBase64 = rawBase64.startsWith('data:image')
          ? rawBase64
          : `data:image/jpeg;base64,${rawBase64}`;
      }
    }

    return {
      errCode: 0,
      data: {
        profile: {
          id: doctor.id,
          doctorId: doctor.id,
          doctorCode: `DOC${String(doctor.id).padStart(4, '0')}`,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          doctorName: `${doctor.lastName} ${doctor.firstName}`.trim(),
          email: doctor.email,
          phoneNumber: doctor.phoneNumber || '—',
          address: doctor.address || '—',
          gender: doctor.gender,
          avatar: avatarBase64,
          positionId: doctor.positionId,
          positionVi: doctor.positionData?.valueVi || 'Bác sĩ',
          positionEn: doctor.positionData?.valueEn || 'Doctor',
          specialtyId: docInfo.specialtyId,
          specialtyName: docInfo.specialtyData?.name || 'Chuyên khoa chung',
          clinicId: docInfo.clinicId,
          clinicName: docInfo.clinicData?.name || 'Cơ sở BookingCare',
          priceVi: docInfo.priceData?.valueVi || 'Chưa cấu hình',
          provinceVi: docInfo.provinceData?.valueVi || 'Hà Nội',
          paymentVi: docInfo.paymentData?.valueVi || 'Tất cả',
          contentMarkdown: docInfo.contentMarkdown || '',
          contentHTML: docInfo.contentHTML || '',
          description: docInfo.description || '',
          note: docInfo.note || '',
          workingStatus,
          commissionRate,
          bankAccountNumber: docInfo.bankAccountNumber || '',
          bankName: docInfo.bankName || '',
          bankAccountName: docInfo.bankAccountName || '',
          createdAt: doctor.createdAt,
        },
        kpis: {
          totalBookings: stats?.totalBookings || 0,
          completedBookings: stats?.completedBookings || 0,
          cancelledBookings: stats?.cancelledBookings || 0,
          cancellationRate: stats?.totalBookings > 0
            ? Math.round(((stats.cancelledBookings || 0) / stats.totalBookings) * 100)
            : 0,
          grossRevenue,
          commissionRate,
          platformFee,
          netRevenue,
          totalPaid,
          pendingPayout,
          avgRating: Number(parseFloat(reviewStats?.avgRating || 0).toFixed(1)),
          reviewCount: reviewStats?.reviewCount || 0,
        },
        monthlyRevenue: monthlyRevenueRows,
        weeklySchedule: scheduleWithBookings,
        patients: patientsRows.map((p) => ({
          ...p,
          lastVisitDateStr: p.lastVisitDate ? moment(parseInt(p.lastVisitDate, 10)).format('DD/MM/YYYY') : '—',
        })),
        settlements,
        commissionLogs,
      },
    };
  } catch (error) {
    console.error('Error in getAdminDoctorWorkspace:', error);
    return { errCode: -1, errMessage: 'Lỗi máy chủ khi tải Workspace Bác sĩ: ' + error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTIONS: Cập nhật Tỷ lệ Hoa hồng kèm Audit Log
// ─────────────────────────────────────────────────────────────────────────────
const updateDoctorCommission = async ({ doctorId, newRate, reason = '', adminId = null }) => {
  try {
    const docId = parseInt(doctorId, 10);
    const parsedRate = parseFloat(newRate);

    if (!docId || isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      return { errCode: 1, errMessage: 'Tỷ lệ hoa hồng phải từ 0% đến 100%!' };
    }

    const doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId: docId } });
    if (!doctorInfo) {
      return { errCode: 2, errMessage: 'Hồ sơ Doctor_Info của bác sĩ không tồn tại!' };
    }

    const oldRate = parseFloat(doctorInfo.commissionRate) || 15.0;

    // Lưu vết kiểm toán
    await db.Doctor_Commission_Log.create({
      doctorId: docId,
      oldRate,
      newRate: parsedRate,
      reason: reason || 'Admin điều chỉnh hoa hồng định kỳ',
      updatedByAdminId: adminId,
    });

    doctorInfo.commissionRate = parsedRate;
    await doctorInfo.save();

    return {
      errCode: 0,
      message: `Cập nhật hoa hồng thành công từ ${oldRate}% sang ${parsedRate}%!`,
      data: { doctorId: docId, oldRate, newRate: parsedRate },
    };
  } catch (error) {
    console.error('Error in updateDoctorCommission:', error);
    return { errCode: -1, errMessage: 'Lỗi máy chủ khi cập nhật hoa hồng: ' + error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACTIONS: Cập nhật Trạng thái hoạt động (Active / Paused / Suspended)
// ─────────────────────────────────────────────────────────────────────────────
const updateDoctorWorkingStatus = async ({ doctorId, status }) => {
  try {
    const docId = parseInt(doctorId, 10);
    const validStatuses = ['active', 'paused', 'suspended'];
    if (!docId || !validStatuses.includes(status)) {
      return { errCode: 1, errMessage: 'Trạng thái hoạt động không hợp lệ (active, paused, suspended)!' };
    }

    const doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId: docId } });
    if (!doctorInfo) {
      return { errCode: 2, errMessage: 'Hồ sơ Doctor_Info của bác sĩ không tồn tại!' };
    }

    doctorInfo.workingStatus = status;
    await doctorInfo.save();

    const statusNames = {
      active: 'Đang nhận lịch (Active)',
      paused: 'Tạm nghỉ nhận lịch (Paused)',
      suspended: 'Ngừng hợp tác (Suspended)',
    };

    return {
      errCode: 0,
      message: `Chuyển trạng thái bác sĩ sang "${statusNames[status]}" thành công!`,
      data: { doctorId: docId, workingStatus: status },
    };
  } catch (error) {
    console.error('Error in updateDoctorWorkingStatus:', error);
    return { errCode: -1, errMessage: 'Lỗi máy chủ khi cập nhật trạng thái: ' + error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACTIONS: Quyết toán & Thanh toán tiền cho Bác sĩ (Doctor Payout)
// ─────────────────────────────────────────────────────────────────────────────
const createDoctorPayout = async ({
  doctorId,
  amount,
  paymentMethod = 'bank_transfer',
  transactionRef = '',
  receiptImage = null,
  note = '',
  adminId = null,
  periodFrom = null,
  periodTo = null,
}) => {
  try {
    const docId = parseInt(doctorId, 10);
    const parsedAmount = parseFloat(amount);

    if (!docId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return { errCode: 1, errMessage: 'Số tiền thanh toán phải lớn hơn 0 VNĐ!' };
    }

    const doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId: docId } });
    if (!doctorInfo) {
      return { errCode: 2, errMessage: 'Không tìm thấy thông tin bác sĩ!' };
    }

    const settlement = await db.Doctor_Settlement.create({
      doctorId: docId,
      periodFrom: periodFrom ? new Date(periodFrom) : null,
      periodTo: periodTo ? new Date(periodTo) : null,
      grossRevenue: parsedAmount,
      commissionRate: parseFloat(doctorInfo.commissionRate) || 15.0,
      platformFee: 0,
      netPayout: parsedAmount,
      payoutStatus: 'paid',
      paymentMethod: paymentMethod || 'bank_transfer',
      transactionRef: transactionRef || `PAY-${Date.now()}`,
      receiptImage: receiptImage || null,
      note: note || 'Thanh toán đối soát kỳ khám',
      adminId,
      paidAt: new Date(),
    });

    return {
      errCode: 0,
      message: 'Ghi nhận thanh toán tiền cho bác sĩ thành công!',
      data: settlement,
    };
  } catch (error) {
    console.error('Error in createDoctorPayout:', error);
    return { errCode: -1, errMessage: 'Lỗi máy chủ khi tạo lệnh thanh toán: ' + error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. ACTIONS: Cập nhật Lịch khám nhanh trực tiếp từ Workspace
// ─────────────────────────────────────────────────────────────────────────────
const updateDoctorScheduleSlots = async ({ doctorId, date, timeTypes = [] }) => {
  try {
    const docId = parseInt(doctorId, 10);
    const dateStr = String(date);

    if (!docId || !dateStr || !Array.isArray(timeTypes)) {
      return { errCode: 1, errMessage: 'Tham số không hợp lệ (doctorId, date, timeTypes[]).' };
    }

    // Lấy các slot hiện tại trong ngày của bác sĩ
    const existingSchedules = await db.Schedule.findAll({
      where: { doctorId: docId, date: dateStr },
    });

    const existingMap = new Map();
    existingSchedules.forEach((s) => existingMap.set(s.timeType, s));

    // Thêm các slot mới chưa có
    const toCreate = [];
    for (const tType of timeTypes) {
      if (!existingMap.has(tType)) {
        toCreate.push({
          doctorId: docId,
          date: dateStr,
          timeType: tType,
          maxNumber: 10,
          currentNumber: 0,
        });
      }
    }

    if (toCreate.length > 0) {
      await db.Schedule.bulkCreate(toCreate);
    }

    // Xóa các slot không còn được chọn (nếu chưa có ai đặt khám: currentNumber === 0)
    const toDelete = [];
    for (const [tType, s] of existingMap.entries()) {
      if (!timeTypes.includes(tType) && s.currentNumber === 0) {
        toDelete.push(s.id);
      }
    }

    if (toDelete.length > 0) {
      await db.Schedule.destroy({ where: { id: { [Op.in]: toDelete } } });
    }

    return {
      errCode: 0,
      message: 'Cập nhật khung giờ làm việc của bác sĩ thành công!',
    };
  } catch (error) {
    console.error('Error in updateDoctorScheduleSlots:', error);
    return { errCode: -1, errMessage: 'Lỗi máy chủ khi cập nhật lịch khám: ' + error.message };
  }
};

module.exports = {
  getAdminDoctorsList,
  getAdminDoctorWorkspace,
  updateDoctorCommission,
  updateDoctorWorkingStatus,
  createDoctorPayout,
  updateDoctorScheduleSlots,
};
