// src/services/patientManageService.js
// Enterprise Healthcare Patient Administration Service: Master-Detail Workspace & Financial Refund Flow
const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');

// Format patient code: BN-000128
const formatPatientCode = (id) => `BN-${String(id).padStart(6, '0')}`;

/**
 * 1. Lấy danh sách bệnh nhân Master (Phân trang, bộ lọc nghiệp vụ, KPI tóm tắt)
 */
const getAdminPatientsList = async (query = {}) => {
  try {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.max(1, parseInt(query.limit, 10) || 15);
    const offset = (page - 1) * limit;
    const search = (query.search || '').trim().toLowerCase();
    const filter = query.filter || 'all'; // 'all', 'upcoming', 'pending_refund', 'frequent'

    const nowMs = Date.now();

    // Query all patients (Role R3 or users with bookings)
    let searchCondition = `(u."roleId" = 'R3' OR b_exists.id IS NOT NULL)`;
    const replacements = { nowMs, limit, offset };

    if (search) {
      // Check if search matches code like BN-000128 or pure id
      const idMatch = search.match(/^bn-?0*(\d+)$/i) || search.match(/^(\d+)$/);
      if (idMatch) {
        replacements.searchId = parseInt(idMatch[1], 10);
        searchCondition += ` AND (u.id = :searchId OR LOWER(u."firstName") LIKE :searchPattern OR LOWER(u."lastName") LIKE :searchPattern OR LOWER(u."email") LIKE :searchPattern OR u."phoneNumber" LIKE :searchPattern)`;
      } else {
        searchCondition += ` AND (LOWER(u."firstName") LIKE :searchPattern OR LOWER(u."lastName") LIKE :searchPattern OR LOWER(u."email") LIKE :searchPattern OR u."phoneNumber" LIKE :searchPattern)`;
      }
      replacements.searchPattern = `%${search}%`;
    }

    // Filter conditions
    if (filter === 'upcoming') {
      searchCondition += ` AND stats."upcomingCount" > 0`;
    } else if (filter === 'pending_refund') {
      searchCondition += ` AND stats."pendingRefundCount" > 0`;
    } else if (filter === 'frequent') {
      searchCondition += ` AND stats."completedCount" >= 3`;
    }

    // CTE / Subquery for patient booking statistics
    const rawQuery = `
      WITH patient_stats AS (
        SELECT 
          b."patientId",
          COUNT(*) AS "totalBookings",
          COUNT(CASE WHEN b."statusId" = 'S3' THEN 1 END) AS "completedCount",
          COUNT(CASE WHEN b."statusId" = 'S4' THEN 1 END) AS "cancelledCount",
          COUNT(CASE WHEN b."statusId" = 'S4' AND (b."refundStatus" = 'pending' OR b."paymentStatus" = 'refund_pending') THEN 1 END) AS "pendingRefundCount",
          COUNT(CASE WHEN b."statusId" IN ('S1', 'S1.5', 'S2') AND CAST(b.date AS BIGINT) >= :nowMs THEN 1 END) AS "upcomingCount",
          MAX(CAST(b.date AS BIGINT)) AS "lastBookingDate",
          COALESCE(SUM(CASE WHEN b."statusId" = 'S3' THEN b."bookingPrice" ELSE 0 END), 0) AS "totalSpent"
        FROM "Bookings" b
        GROUP BY b."patientId"
      )
      SELECT 
        u.id,
        u."firstName",
        u."lastName",
        u.email,
        u."phoneNumber",
        u.address,
        u.gender,
        u.birthday,
        u."createdAt",
        COALESCE(stats."totalBookings", 0) AS "totalBookings",
        COALESCE(stats."completedCount", 0) AS "completedCount",
        COALESCE(stats."cancelledCount", 0) AS "cancelledCount",
        COALESCE(stats."pendingRefundCount", 0) AS "pendingRefundCount",
        COALESCE(stats."upcomingCount", 0) AS "upcomingCount",
        stats."lastBookingDate",
        COALESCE(stats."totalSpent", 0) AS "totalSpent",
        pba."bankName" AS "primaryBankName",
        pba."accountNumber" AS "primaryAccountNumber",
        pba."accountHolderName" AS "primaryAccountHolder"
      FROM "Users" u
      LEFT JOIN LATERAL (SELECT id FROM "Bookings" WHERE "patientId" = u.id LIMIT 1) b_exists ON true
      LEFT JOIN patient_stats stats ON stats."patientId" = u.id
      LEFT JOIN "Patient_Bank_Accounts" pba ON pba."patientId" = u.id AND pba."isPrimary" = true
      WHERE ${searchCondition}
      ORDER BY 
        CASE WHEN stats."pendingRefundCount" > 0 THEN 0 ELSE 1 END,
        CASE WHEN stats."upcomingCount" > 0 THEN 0 ELSE 1 END,
        stats."lastBookingDate" DESC NULLS LAST,
        u.id DESC
      LIMIT :limit OFFSET :offset;
    `;

    const countQuery = `
      WITH patient_stats AS (
        SELECT 
          b."patientId",
          COUNT(CASE WHEN b."statusId" = 'S4' AND (b."refundStatus" = 'pending' OR b."paymentStatus" = 'refund_pending') THEN 1 END) AS "pendingRefundCount",
          COUNT(CASE WHEN b."statusId" IN ('S1', 'S1.5', 'S2') AND CAST(b.date AS BIGINT) >= :nowMs THEN 1 END) AS "upcomingCount",
          COUNT(CASE WHEN b."statusId" = 'S3' THEN 1 END) AS "completedCount"
        FROM "Bookings" b
        GROUP BY b."patientId"
      )
      SELECT COUNT(*) AS total
      FROM "Users" u
      LEFT JOIN LATERAL (SELECT id FROM "Bookings" WHERE "patientId" = u.id LIMIT 1) b_exists ON true
      LEFT JOIN patient_stats stats ON stats."patientId" = u.id
      WHERE ${searchCondition};
    `;

    // Global Summary KPI Strip
    const kpiSummaryQuery = `
      SELECT 
        (SELECT COUNT(DISTINCT u.id) FROM "Users" u WHERE u."roleId" = 'R3') AS "totalPatients",
        (SELECT COUNT(DISTINCT b."patientId") FROM "Bookings" b WHERE b."statusId" IN ('S1', 'S1.5', 'S2') AND CAST(b.date AS BIGINT) >= :nowMs) AS "upcomingPatients",
        (SELECT COUNT(DISTINCT b."patientId") FROM "Bookings" b WHERE b."statusId" = 'S4' AND (b."refundStatus" = 'pending' OR b."paymentStatus" = 'refund_pending')) AS "pendingRefundPatients",
        (SELECT COUNT(*) FROM "Users" u WHERE u."roleId" = 'R3' AND u."createdAt" >= NOW() - INTERVAL '30 days') AS "newPatients30d";
    `;

    const [patients, [{ total }], [summaryKpis]] = await Promise.all([
      db.sequelize.query(rawQuery, { replacements, type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(countQuery, { replacements, type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(kpiSummaryQuery, { replacements: { nowMs }, type: db.sequelize.QueryTypes.SELECT }),
    ]);

    const totalCount = parseInt(total || 0, 10);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const formattedPatients = patients.map((p) => {
      const isUpcoming = parseInt(p.upcomingCount, 10) > 0;
      const isPendingRefund = parseInt(p.pendingRefundCount, 10) > 0;
      let statusTag = 'active';
      let statusLabelVi = 'Bình thường';
      if (isPendingRefund) {
        statusTag = 'refund_pending';
        statusLabelVi = 'Cần hoàn tiền';
      } else if (isUpcoming) {
        statusTag = 'upcoming';
        statusLabelVi = 'Có lịch sắp khám';
      }

      return {
        id: p.id,
        patientCode: formatPatientCode(p.id),
        fullName: `${p.lastName || ''} ${p.firstName || ''}`.trim() || 'Chưa đặt tên',
        email: p.email,
        phoneNumber: p.phoneNumber || '—',
        address: p.address || '—',
        gender: p.gender === 'M' ? 'Nam' : p.gender === 'F' ? 'Nữ' : 'Khác',
        birthday: p.birthday || null,
        createdAt: p.createdAt,
        totalBookings: parseInt(p.totalBookings, 10) || 0,
        completedCount: parseInt(p.completedCount, 10) || 0,
        cancelledCount: parseInt(p.cancelledCount, 10) || 0,
        pendingRefundCount: parseInt(p.pendingRefundCount, 10) || 0,
        upcomingCount: parseInt(p.upcomingCount, 10) || 0,
        lastBookingDate: p.lastBookingDate ? moment(Number(p.lastBookingDate)).format('DD/MM/YYYY') : '—',
        totalSpent: parseFloat(p.totalSpent) || 0,
        primaryBankAccount: p.primaryAccountNumber
          ? {
              bankName: p.primaryBankName,
              accountNumber: p.primaryAccountNumber,
              accountHolder: p.primaryAccountHolder,
            }
          : null,
        statusTag,
        statusLabelVi,
      };
    });

    return {
      errCode: 0,
      data: {
        patients: formattedPatients,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
        },
        summaryKpis: {
          totalPatients: parseInt(summaryKpis?.totalPatients || 0, 10),
          upcomingPatients: parseInt(summaryKpis?.upcomingPatients || 0, 10),
          pendingRefundPatients: parseInt(summaryKpis?.pendingRefundPatients || 0, 10),
          newPatients30d: parseInt(summaryKpis?.newPatients30d || 0, 10),
        },
      },
    };
  } catch (err) {
    console.error('>>> getAdminPatientsList error:', err);
    return { errCode: -1, errMessage: 'Lỗi khi tải danh sách bệnh nhân' };
  }
};

/**
 * 2. Lấy chi tiết Patient Workspace (Profile, KPIs, Lịch khám, Thanh toán/Hoàn tiền, Dòng hoạt động)
 */
const getAdminPatientWorkspace = async (patientId) => {
  try {
    if (!patientId) {
      return { errCode: 1, errMessage: 'Thiếu patientId' };
    }

    // 2.1 Thông tin cá nhân bệnh nhân
    const user = await db.User.findByPk(patientId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'address', 'phoneNumber', 'gender', 'birthday', 'createdAt', 'roleId'],
      raw: true,
    });

    if (!user) {
      return { errCode: 2, errMessage: 'Không tìm thấy hồ sơ bệnh nhân' };
    }

    // 2.2 Danh sách tài khoản ngân hàng của bệnh nhân
    const bankAccounts = await db.PatientBankAccount.findAll({
      where: { patientId },
      order: [['isPrimary', 'DESC'], ['id', 'ASC']],
      raw: true,
    });

    // 2.3 Toàn bộ lịch khám của bệnh nhân
    const bookings = await db.Booking.findAll({
      where: { patientId },
      include: [
        {
          model: db.User,
          as: 'doctorBookingData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
          include: [
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['specialtyId', 'clinicId'],
              include: [
                { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
                { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
              ],
            },
          ],
        },
        {
          model: db.Allcode,
          as: 'timeTypeBooking',
          attributes: ['valueVi', 'valueEn'],
        },
        {
          model: db.Allcode,
          as: 'statusData',
          attributes: ['valueVi', 'valueEn'],
        },
      ],
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
    });

    const now = Date.now();
    let completedCount = 0;
    let cancelledCount = 0;
    let upcomingCount = 0;
    let totalSpent = 0;
    let totalRefunded = 0;
    let pendingRefundCount = 0;

    const formattedAppointments = bookings.map((b) => {
      const bDateMs = Number(b.date) || 0;
      const isPast = bDateMs < now;
      const isCancelled = b.statusId === 'S4';
      const isCompleted = b.statusId === 'S3';
      const isUpcoming = ['S1', 'S1.5', 'S2'].includes(b.statusId) && bDateMs >= now;

      if (isCompleted) {
        completedCount++;
        totalSpent += (b.bookingPrice || 0);
      }
      if (isCancelled) {
        cancelledCount++;
        totalRefunded += (b.refundAmount || 0);
        if (b.refundStatus === 'pending' || b.paymentStatus === 'refund_pending') {
          pendingRefundCount++;
        }
      }
      if (isUpcoming) {
        upcomingCount++;
      }

      // Calculate policy estimate if cancelled and pending
      let policyEstimate = null;
      if (isCancelled) {
        const createdMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const cancelledMs = b.cancelledAt ? new Date(b.cancelledAt).getTime() : Date.now();
        const diffHours = Math.max(0, (cancelledMs - createdMs) / (1000 * 60 * 60));
        let suggestedRate = 100;
        if (diffHours <= 24) suggestedRate = 100;
        else if (diffHours <= 72) suggestedRate = 75;
        else suggestedRate = 50;

        const price = parseInt(b.bookingPrice, 10) || 0;
        const suggestedAmount = Math.round((price * suggestedRate) / 100);

        policyEstimate = {
          hoursSinceCreation: Math.round(diffHours * 10) / 10,
          suggestedRate,
          suggestedAmount,
          penaltyFee: Math.max(0, price - suggestedAmount),
        };
      }

      const doc = b.doctorBookingData;
      const docInfo = doc?.doctorInfoData;

      return {
        id: b.id,
        bookingCode: `#BK-${String(b.id).padStart(6, '0')}`,
        date: b.date,
        dateFormatted: b.date ? moment(Number(b.date)).format('DD/MM/YYYY') : '—',
        timeType: b.timeType,
        timeSlot: b.timeTypeBooking?.valueVi || b.timeType,
        statusId: b.statusId,
        statusLabelVi: b.statusData?.valueVi || b.statusId,
        bookingPrice: b.bookingPrice || 0,
        paymentStatus: b.paymentStatus || 'unpaid',
        refundStatus: b.refundStatus || 'none',
        refundRate: b.refundRate ? parseFloat(b.refundRate) : null,
        refundAmount: b.refundAmount || 0,
        cancelledAt: b.cancelledAt,
        createdAt: b.createdAt,
        reason: b.reason || '—',
        doctorId: b.doctorId,
        doctorName: doc ? `${doc.lastName || ''} ${doc.firstName || ''}`.trim() : 'Bác sĩ',
        specialtyName: docInfo?.specialtyData?.name || 'Đa khoa',
        clinicName: docInfo?.clinicData?.name || 'Phòng khám',
        clinicAddress: docInfo?.clinicData?.address || '',
        bankName: b.bankName || null,
        bankAccountNumber: b.bankAccountNumber || null,
        bankAccountName: b.bankAccountName || null,
        policyEstimate,
      };
    });

    // 2.4 Lịch sử Thanh toán & Hoàn tiền
    const paymentHistory = formattedAppointments
      .filter((a) => a.bookingPrice > 0 && ['paid', 'refund_pending', 'refunded'].includes(a.paymentStatus))
      .map((a) => ({
        id: a.id,
        bookingCode: a.bookingCode,
        dateFormatted: a.dateFormatted,
        doctorName: a.doctorName,
        specialtyName: a.specialtyName,
        amount: a.bookingPrice,
        paymentStatus: a.paymentStatus,
        createdAt: a.createdAt,
      }));

    const refundHistory = formattedAppointments
      .filter((a) => a.statusId === 'S4' && (a.refundAmount > 0 || ['pending', 'refunded', 'done'].includes(a.refundStatus) || a.paymentStatus === 'refund_pending'))
      .map((a) => ({
        id: a.id,
        bookingCode: a.bookingCode,
        doctorName: a.doctorName,
        cancelledAt: a.cancelledAt,
        originalPrice: a.bookingPrice,
        refundRate: a.refundRate || a.policyEstimate?.suggestedRate || 100,
        refundAmount: a.refundAmount || a.policyEstimate?.suggestedAmount || a.bookingPrice,
        refundStatus: a.refundStatus,
        paymentStatus: a.paymentStatus,
        bankName: a.bankName || bankAccounts.find((b) => b.isPrimary)?.bankName || 'Chưa chỉ định',
        accountNumber: a.bankAccountNumber || bankAccounts.find((b) => b.isPrimary)?.accountNumber || '—',
        accountHolder: a.bankAccountName || bankAccounts.find((b) => b.isPrimary)?.accountHolderName || `${user.lastName} ${user.firstName}`.trim(),
        policyEstimate: a.policyEstimate,
      }));

    // 2.5 Dòng thời gian hoạt động (Activity Timeline)
    const activities = [];

    // Account Created
    if (user.createdAt) {
      activities.push({
        type: 'ACCOUNT_CREATED',
        timestamp: new Date(user.createdAt).getTime(),
        dateStr: moment(user.createdAt).format('HH:mm DD/MM/YYYY'),
        title: 'Tài khoản bệnh nhân được khởi tạo',
        desc: `Đăng ký với email ${user.email}`,
      });
    }

    // Bookings, Payments, Cancellations, Refunds
    formattedAppointments.forEach((a) => {
      if (a.createdAt) {
        activities.push({
          type: 'BOOKING_CREATED',
          timestamp: new Date(a.createdAt).getTime(),
          dateStr: moment(a.createdAt).format('HH:mm DD/MM/YYYY'),
          title: `Đặt lịch khám ${a.bookingCode}`,
          desc: `Khám với ${a.doctorName} (${a.specialtyName}) vào ngày ${a.dateFormatted} [${a.timeSlot}].`,
        });
      }
      if (['paid', 'refund_pending', 'refunded'].includes(a.paymentStatus)) {
        activities.push({
          type: 'PAYMENT_SUCCESS',
          timestamp: new Date(a.createdAt).getTime() + 60000,
          dateStr: moment(a.createdAt).format('HH:mm DD/MM/YYYY'),
          title: `Thanh toán thành công ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(a.bookingPrice)}`,
          desc: `Giao dịch thanh toán phí khám cho ca hẹn ${a.bookingCode}`,
        });
      }
      if (a.statusId === 'S4' && a.cancelledAt) {
        activities.push({
          type: 'BOOKING_CANCELLED',
          timestamp: new Date(a.cancelledAt).getTime(),
          dateStr: moment(a.cancelledAt).format('HH:mm DD/MM/YYYY'),
          title: `Hủy lịch hẹn ${a.bookingCode}`,
          desc: `Lý do: ${a.reason}. Khởi tạo yêu cầu hoàn tiền.`,
        });
      }
      if (a.refundStatus === 'refunded' || a.refundStatus === 'done') {
        activities.push({
          type: 'REFUND_COMPLETED',
          timestamp: a.cancelledAt ? new Date(a.cancelledAt).getTime() + 120000 : Date.now(),
          dateStr: moment(a.cancelledAt || Date.now()).format('HH:mm DD/MM/YYYY'),
          title: `Đã hoàn tiền ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(a.refundAmount)}`,
          desc: `Chuyển khoản thành công tới tài khoản ${a.bankName || 'ngân hàng'} (${a.bankAccountNumber || ''}).`,
        });
      }
      if (a.statusId === 'S3') {
        activities.push({
          type: 'BOOKING_DONE',
          timestamp: Number(a.date) || Date.now(),
          dateStr: moment(Number(a.date)).format('HH:mm DD/MM/YYYY'),
          title: `Ca khám ${a.bookingCode} hoàn tất`,
          desc: `Bác sĩ ${a.doctorName} đã hoàn thành buổi khám bệnh.`,
        });
      }
    });

    activities.sort((a, b) => b.timestamp - a.timestamp);

    const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || null;

    return {
      errCode: 0,
      data: {
        profile: {
          id: user.id,
          patientCode: formatPatientCode(user.id),
          fullName: `${user.lastName || ''} ${user.firstName || ''}`.trim() || 'Chưa đặt tên',
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber || '—',
          address: user.address || '—',
          gender: user.gender === 'M' ? 'Nam' : user.gender === 'F' ? 'Nữ' : 'Khác',
          birthday: user.birthday || null,
          createdAt: user.createdAt,
          primaryBankAccount: primaryBank
            ? {
                id: primaryBank.id,
                bankName: primaryBank.bankName,
                accountNumber: primaryBank.accountNumber,
                accountHolder: primaryBank.accountHolderName,
              }
            : null,
          bankAccounts: bankAccounts.map((b) => ({
            id: b.id,
            bankName: b.bankName,
            accountNumber: b.accountNumber,
            accountHolder: b.accountHolderName,
            isPrimary: b.isPrimary,
          })),
        },
        kpis: {
          totalBookings: bookings.length,
          completedCount,
          cancelledCount,
          upcomingCount,
          pendingRefundCount,
          totalSpent,
          totalRefunded,
        },
        appointments: formattedAppointments,
        paymentHistory,
        refundHistory,
        activities,
      },
    };
  } catch (err) {
    console.error('>>> getAdminPatientWorkspace error:', err);
    return { errCode: -1, errMessage: 'Lỗi khi tải dữ liệu chi tiết bệnh nhân' };
  }
};

/**
 * 3. Xử lý Hoàn tiền Nghiệp vụ Y tế có Audit Log
 */
const processAdminRefund = async (data = {}) => {
  const t = await db.sequelize.transaction();
  try {
    const { bookingId, refundRate, refundAmount, bankName, accountNumber, accountHolder, notes, adminName } = data;

    if (!bookingId) {
      await t.rollback();
      return { errCode: 1, errMessage: 'Thiếu mã ca khám cần hoàn tiền' };
    }

    const booking = await db.Booking.findOne({
      where: { id: bookingId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!booking) {
      await t.rollback();
      return { errCode: 2, errMessage: 'Không tìm thấy ca khám' };
    }

    if (booking.statusId !== 'S4') {
      await t.rollback();
      return { errCode: 3, errMessage: 'Chỉ có thể hoàn tiền cho ca khám đã hủy (S4)' };
    }

    const finalAmount = refundAmount !== undefined ? parseInt(refundAmount, 10) : booking.refundAmount;
    const finalRate = refundRate !== undefined ? parseFloat(refundRate) : booking.refundRate;

    booking.refundAmount = finalAmount;
    booking.refundRate = finalRate;
    booking.refundStatus = 'refunded';
    booking.paymentStatus = 'refunded';
    if (bankName) booking.bankName = bankName;
    if (accountNumber) booking.bankAccountNumber = accountNumber;
    if (accountHolder) booking.bankAccountName = accountHolder;

    await booking.save({ transaction: t });
    await t.commit();

    const refundReceiptCode = `RF-${Date.now().toString().slice(-6)}`;

    return {
      errCode: 0,
      message: 'Xác nhận hoàn tiền thành công',
      data: {
        refundReceiptCode,
        bookingId: booking.id,
        refundAmount: finalAmount,
        refundRate: finalRate,
        bankName: booking.bankName,
        accountNumber: booking.bankAccountNumber,
        accountHolder: booking.bankAccountName,
        processedAt: new Date(),
        processedBy: adminName || 'Admin System',
        notes: notes || 'Hoàn tiền theo chính sách hủy ca khám',
      },
    };
  } catch (err) {
    await t.rollback();
    console.error('>>> processAdminRefund error:', err);
    return { errCode: -1, errMessage: 'Lỗi khi xử lý giao dịch hoàn tiền' };
  }
};

module.exports = {
  getAdminPatientsList,
  getAdminPatientWorkspace,
  processAdminRefund,
};
