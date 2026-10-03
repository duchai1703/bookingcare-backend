// src/services/refundGovernanceService.js
// Phân hệ Quản trị Hoàn tiền Bệnh nhân Độc lập (Enterprise Refund Governance)
const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const policyEngineService = require('./policyEngineService');

/**
 * Phân loại lý do hủy và xác định quyền lợi hoàn tiền tối đa:
 * - Lỗi từ phía Bác sĩ / Phòng khám / Hệ thống: Hoàn tiền 100% (bất kể thời điểm hủy)
 * - Lỗi từ phía Bệnh nhân: Áp dụng bậc hoàn tiền theo policySnapshot tại thời điểm đặt lịch
 */
const REASON_RULES = {
  // Nhóm Bác sĩ / Phòng khám / Hệ thống: Luôn hoàn 100%
  DOCTOR_UNAVAILABLE: { defaultRate: 100, label: 'Bác sĩ bận đột xuất / Không thể tiếp nhận', force100: true },
  CLINIC_FORCE_MAJEURE: { defaultRate: 100, label: 'Cơ sở y tế đóng cửa / Sự cố bất khả kháng', force100: true },
  SYSTEM_DUPLICATE_PAYMENT: { defaultRate: 100, label: 'Lỗi hệ thống / Thanh toán trùng lặp', force100: true },

  // Nhóm Bệnh nhân chủ động hủy: Tính theo thời gian thực tế
  PATIENT_ON_TIME: { defaultRate: 100, label: 'Bệnh nhân hủy đúng hạn (>= 24h)', force100: false },
  PATIENT_LATE: { defaultRate: null, label: 'Bệnh nhân hủy cận giờ (< 24h)', force100: false },
  PATIENT_NO_SHOW: { defaultRate: 0, label: 'Bệnh nhân không đến khám (No-show)', force100: false },

  // Nhóm Admin xử lý ngoại lệ
  ADMIN_DISPUTE_RESOLUTION: { defaultRate: null, label: 'Giải quyết tranh chấp khiếu nại (Admin)', force100: false },
  OTHER: { defaultRate: null, label: 'Lý do khác', force100: false },
};

/**
 * 1. Khởi tạo và ghi nhận Hồ sơ Hoàn tiền (Refund Case)
 */
async function createRefundCase({
  bookingId,
  cancelledByRole = 'PATIENT',
  cancelledById = null,
  cancellationReason = 'PATIENT_ON_TIME',
  cancellationNote = '',
  externalTransaction = null,
}) {
  const t = externalTransaction || (await db.sequelize.transaction());
  try {
    const booking = await db.Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!booking) {
      throw new Error(`Không tìm thấy lịch hẹn #${bookingId}`);
    }

    // Kiểm tra xem đã có refund case cho booking này chưa (Idempotency)
    const existingCase = await db.Refund_Case.findOne({
      where: { bookingId },
      transaction: t,
    });
    if (existingCase) {
      if (!externalTransaction) await t.commit();
      return { errCode: 0, message: 'Hồ sơ hoàn tiền đã tồn tại', data: existingCase };
    }

    const now = new Date();
    // Xác định thời điểm hẹn khám
    let appointmentTime = null;
    if (booking.date) {
      const rawDate = Number(booking.date);
      if (!isNaN(rawDate) && rawDate > 1000000000) {
        appointmentTime = new Date(rawDate);
      } else {
        appointmentTime = new Date(booking.date);
      }
    }

    // Tính số giờ trước giờ hẹn khám
    let hoursBefore = 999;
    if (appointmentTime && !isNaN(appointmentTime.getTime())) {
      hoursBefore = Math.max(0, (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60));
    }

    // Xác định số tiền thực tế bệnh nhân đã trả (paidAmount)
    const paidAmount = Number(booking.bookingPrice || booking.totalAmount || 0);

    // Tính tỷ lệ hoàn tiền
    let refundRate = 0;
    let refundAmount = 0;
    let nonRefundableAmount = 0;
    let policyInfo = null;

    const reasonConfig = REASON_RULES[cancellationReason] || REASON_RULES.OTHER;

    if (reasonConfig.force100) {
      // Hoàn 100% do lỗi từ bác sĩ / sàn / phòng khám
      refundRate = 100;
      refundAmount = paidAmount;
      nonRefundableAmount = 0;
    } else {
      // Tính theo policySnapshot lúc đặt lịch
      const calcResult = policyEngineService.calculateRefundFromBookingSnapshot(booking, now);
      refundRate = calcResult.appliedRefundPercent || 0;
      refundAmount = Math.round((paidAmount * refundRate) / 100);
      nonRefundableAmount = Math.max(0, paidAmount - refundAmount);
      policyInfo = calcResult.policyInfo;
    }

    // Đóng gói calculationSnapshot bất biến
    const calculationSnapshot = {
      evaluatedAt: now.toISOString(),
      cancellationReason,
      reasonLabel: reasonConfig.label,
      cancelledByRole,
      cancelledById,
      appointmentTime: appointmentTime ? appointmentTime.toISOString() : null,
      hoursBeforeAppointment: Math.round(hoursBefore * 10) / 10,
      paidAmount,
      refundRate,
      refundAmount,
      nonRefundableAmount,
      policySnapshotUsed: policyInfo || null,
      force100Applied: reasonConfig.force100,
    };

    // Tạo bản ghi Refund_Case
    const refundCase = await db.Refund_Case.create(
      {
        bookingId: booking.id,
        patientId: booking.patientId,
        doctorId: booking.doctorId,
        cancelledByRole,
        cancelledById,
        cancellationReason,
        cancellationNote,
        cancelledAt: now,
        appointmentTime,
        hoursBeforeAppointment: Math.round(hoursBefore * 10) / 10,
        policyId: policyInfo?.id || null,
        policyVersion: policyInfo?.version || 1,
        paidAmount,
        refundRate,
        refundAmount,
        nonRefundableAmount,
        calculationSnapshot: JSON.stringify(calculationSnapshot),
        status: (cancellationReason === 'ADMIN_DISPUTE_RESOLUTION' || booking.paymentMethod !== 'WALLET') ? 'PENDING' : 'APPROVED',
        refundMethod: booking.paymentMethod === 'WALLET' ? 'WALLET' : 'BANK_TRANSFER',
      },
      { transaction: t }
    );

    // Nếu được duyệt tự động (APPROVED) và refundAmount > 0, tiến hành hoàn tiền vào Ví bệnh nhân ngay
    if (refundCase.status === 'APPROVED' && refundAmount > 0) {
      // 1. Tìm hoặc khởi tạo Ví Bệnh nhân
      let wallet = await db.Wallet.findOne({
        where: { ownerId: booking.patientId, walletType: 'PATIENT' },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!wallet) {
        wallet = await db.Wallet.create(
          {
            ownerId: booking.patientId,
            walletType: 'PATIENT',
            availableBalance: 0,
            reservedBalance: 0,
            status: 'ACTIVE',
          },
          { transaction: t }
        );
      }

      // 2. Nhả khoản tiền giữ (Wallet_Hold) nếu trước đó đặt lịch bằng cọc
      const hold = await db.Wallet_Hold.findOne({
        where: { bookingId: booking.id, status: 'HELD' },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (hold) {
        hold.status = 'REFUNDED';
        hold.releasedAt = now;
        await hold.save({ transaction: t });

        // Giảm reservedBalance
        wallet.reservedBalance = Math.max(0, (Number(wallet.reservedBalance) || 0) - Number(hold.amount));
      }

      // 3. Cộng tiền vào availableBalance
      const oldAvailable = Number(wallet.availableBalance) || 0;
      const newAvailable = oldAvailable + refundAmount;
      wallet.availableBalance = newAvailable;
      await wallet.save({ transaction: t });

      // 4. Ghi bút toán Sổ cái kép bất biến (Wallet_Transaction)
      const idempotencyKey = `REFUND_CASE_${refundCase.id}_${booking.id}`;
      const ledgerTx = await db.Wallet_Transaction.create(
        {
          walletId: wallet.id,
          direction: 'CREDIT',
          amount: refundAmount,
          balanceAfter: newAvailable,
          transactionType: 'REFUND',
          type: 'REFUND',
          referenceType: 'REFUND_CASE',
          referenceId: refundCase.id,
          idempotencyKey,
          description: `Hoàn tiền ca khám #${booking.id} (${refundRate}% - ${reasonConfig.label})`,
        },
        { transaction: t }
      );

      // 5. Cập nhật Refund_Case hoàn tất
      refundCase.status = 'COMPLETED';
      refundCase.walletTransactionId = ledgerTx.id;
      refundCase.completedAt = now;
      await refundCase.save({ transaction: t });
    } else if (refundCase.status === 'APPROVED' && refundAmount === 0) {
      // Không được hoàn tiền (ví dụ No-show 0%)
      refundCase.status = 'COMPLETED';
      refundCase.completedAt = now;
      await refundCase.save({ transaction: t });
    }

    // Đồng bộ trạng thái trên bảng Bookings
    booking.refundAmount = refundAmount;
    booking.refundRate = refundRate;
    booking.refundStatus = refundCase.status === 'COMPLETED' ? 'refunded' : 'pending';
    await booking.save({ transaction: t });

    if (!externalTransaction) await t.commit();

    return {
      errCode: 0,
      message: 'Khởi tạo hồ sơ hoàn tiền thành công',
      data: refundCase,
    };
  } catch (error) {
    if (!externalTransaction) await t.rollback();
    console.error('Error in createRefundCase:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi tạo hồ sơ hoàn tiền',
    };
  }
}

/**
 * 2. Lấy danh sách Hồ sơ Hoàn tiền (Dành cho Admin Dashboard)
 */
async function getAdminRefundCases({
  page = 1,
  limit = 15,
  status = 'ALL',
  cancellationReason = 'ALL',
  search = '',
} = {}) {
  try {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
    const offset = (p - 1) * lim;

    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (cancellationReason && cancellationReason !== 'ALL') where.cancellationReason = cancellationReason;

    const bookingWhere = {};
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      bookingWhere[Op.or] = [
        { id: isNaN(Number(search)) ? -1 : Number(search) },
        { patientName: { [Op.iLike]: q } },
        { patientPhoneNumber: { [Op.iLike]: q } },
      ];
    }

    const { count, rows } = await db.Refund_Case.findAndCountAll({
      where,
      limit: lim,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: db.Booking,
          as: 'booking',
          where: Object.keys(bookingWhere).length > 0 ? bookingWhere : undefined,
          attributes: ['id', 'patientName', 'patientPhoneNumber', 'bookingPrice', 'date', 'timeType', 'statusId'],
        },
        {
          model: db.User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        },
        {
          model: db.User,
          as: 'doctor',
          attributes: ['id', 'firstName', 'lastName'],
        },
        {
          model: db.Wallet_Transaction,
          as: 'walletTransaction',
          attributes: ['id', 'amount', 'direction', 'balanceAfter', 'createdAt'],
        },
      ],
    });

    // Thống kê nhanh theo trạng thái
    const statsQuery = await db.Refund_Case.findAll({
      attributes: [
        'status',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('refundAmount')), 0), 'totalRefund'],
      ],
      group: ['status'],
      raw: true,
    });

    const stats = {
      totalCases: count,
      pendingCount: 0,
      completedCount: 0,
      disputedCount: 0,
      totalRefundedAmount: 0,
    };

    for (const s of statsQuery) {
      if (s.status === 'PENDING') stats.pendingCount = parseInt(s.count, 10) || 0;
      if (s.status === 'COMPLETED') {
        stats.completedCount = parseInt(s.count, 10) || 0;
        stats.totalRefundedAmount = Number(s.totalRefund) || 0;
      }
      if (s.status === 'DISPUTED') stats.disputedCount = parseInt(s.count, 10) || 0;
    }

    return {
      errCode: 0,
      errMessage: 'OK',
      data: rows,
      stats,
      pagination: {
        page: p,
        limit: lim,
        total: count,
        totalPages: Math.ceil(count / lim),
      },
    };
  } catch (error) {
    console.error('Error in getAdminRefundCases:', error);
    return { errCode: -1, errMessage: 'Lỗi khi tải danh sách hồ sơ hoàn tiền' };
  }
}

/**
 * 3. Chi tiết một Hồ sơ Hoàn tiền kèm Phiếu kiểm toán đối soát
 */
async function getRefundCaseDetail(caseId) {
  try {
    const refundCase = await db.Refund_Case.findByPk(caseId, {
      include: [
        {
          model: db.Booking,
          as: 'booking',
          include: [
            { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
            { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName'] },
          ],
        },
        {
          model: db.Wallet_Transaction,
          as: 'walletTransaction',
        },
      ],
    });

    if (!refundCase) {
      return { errCode: 1, errMessage: 'Không tìm thấy hồ sơ hoàn tiền' };
    }

    let parsedSnapshot = null;
    try {
      parsedSnapshot = refundCase.calculationSnapshot ? JSON.parse(refundCase.calculationSnapshot) : null;
    } catch (e) {
      parsedSnapshot = null;
    }

    return {
      errCode: 0,
      data: {
        ...refundCase.toJSON(),
        parsedSnapshot,
      },
    };
  } catch (error) {
    console.error('Error in getRefundCaseDetail:', error);
    return { errCode: -1, errMessage: 'Lỗi khi lấy chi tiết hồ sơ hoàn tiền' };
  }
}

/**
 * 4. Admin thẩm định & phê duyệt xử lý hoàn tiền thủ công (Review Disputed Case)
 */
async function processAdminReviewRefund(caseId, { action, overrideRefundAmount, reviewNote, adminId }) {
  const t = await db.sequelize.transaction();
  try {
    const refundCase = await db.Refund_Case.findByPk(caseId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!refundCase) {
      await t.rollback();
      return { errCode: 1, errMessage: 'Không tìm thấy hồ sơ hoàn tiền' };
    }

    if (refundCase.status === 'COMPLETED') {
      await t.rollback();
      return { errCode: 2, errMessage: 'Hồ sơ này đã được hoàn tất trước đó' };
    }

    const now = new Date();
    refundCase.reviewedById = adminId;
    refundCase.reviewedAt = now;
    refundCase.reviewNote = reviewNote || '';

    if (action === 'REJECT') {
      refundCase.status = 'REJECTED';
      await refundCase.save({ transaction: t });
      await t.commit();
      return { errCode: 0, message: 'Đã từ chối khiếu nại hoàn tiền', data: refundCase };
    }

    // Nếu APPROVE: Cho phép ghi đè số tiền nếu Admin thẩm định ngoại lệ
    let finalRefundAmount = refundCase.refundAmount;
    if (overrideRefundAmount !== undefined && !isNaN(Number(overrideRefundAmount))) {
      finalRefundAmount = Math.max(0, Math.min(Number(refundCase.paidAmount), Number(overrideRefundAmount)));
      refundCase.refundAmount = finalRefundAmount;
      refundCase.nonRefundableAmount = Math.max(0, Number(refundCase.paidAmount) - finalRefundAmount);
    }

    if (finalRefundAmount > 0) {
      // 1. Cộng vào ví Bệnh nhân
      let wallet = await db.Wallet.findOne({
        where: { ownerId: refundCase.patientId, walletType: 'PATIENT' },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!wallet) {
        wallet = await db.Wallet.create(
          {
            ownerId: refundCase.patientId,
            walletType: 'PATIENT',
            availableBalance: 0,
            reservedBalance: 0,
            status: 'ACTIVE',
          },
          { transaction: t }
        );
      }

      const oldBal = Number(wallet.availableBalance) || 0;
      const newBal = oldBal + finalRefundAmount;
      wallet.availableBalance = newBal;
      await wallet.save({ transaction: t });

      // 2. Ghi sổ cái bất biến
      const idempotencyKey = `ADMIN_REFUND_CASE_${refundCase.id}_${Date.now()}`;
      const ledgerTx = await db.Wallet_Transaction.create(
        {
          walletId: wallet.id,
          direction: 'CREDIT',
          amount: finalRefundAmount,
          balanceAfter: newBal,
          transactionType: 'REFUND',
          type: 'REFUND',
          referenceType: 'REFUND_CASE',
          referenceId: refundCase.id,
          idempotencyKey,
          description: `Admin duyệt hoàn tiền ca khám #${refundCase.bookingId}: ${reviewNote || 'Duyệt ngoại lệ'}`,
        },
        { transaction: t }
      );

      refundCase.walletTransactionId = ledgerTx.id;
    }

    refundCase.status = 'COMPLETED';
    refundCase.completedAt = now;
    await refundCase.save({ transaction: t });

    // Đồng bộ Booking
    await db.Booking.update(
      {
        refundAmount: finalRefundAmount,
        refundStatus: 'refunded',
      },
      { where: { id: refundCase.bookingId }, transaction: t }
    );

    await t.commit();
    return {
      errCode: 0,
      message: 'Thẩm định và hoàn tất hoàn tiền thành công',
      data: refundCase,
    };
  } catch (error) {
    await t.rollback();
    console.error('Error in processAdminReviewRefund:', error);
    return { errCode: -1, errMessage: error.message || 'Lỗi khi thẩm định hoàn tiền' };
  }
}

/**
 * 4. Tra cứu chi tiết hồ sơ hoàn tiền cho Bệnh nhân (Xem công thức & lý do hoàn)
 */
async function getPatientRefundCase(bookingId, patientId) {
  try {
    const refundCase = await db.Refund_Case.findOne({
      where: { bookingId, patientId },
      include: [
        {
          model: db.Booking,
          as: 'booking',
          attributes: ['id', 'date', 'timeType', 'bookingPrice', 'paymentMethod', 'paymentStatus'],
          include: [
            {
              model: db.User,
              as: 'doctorBookingData',
              attributes: ['id', 'firstName', 'lastName'],
            },
          ],
        },
      ],
    });

    if (!refundCase) {
      return { errCode: 1, errMessage: 'Không tìm thấy hồ sơ hoàn tiền cho ca khám này' };
    }

    let calculation = null;
    if (refundCase.calculationSnapshot) {
      try {
        calculation = typeof refundCase.calculationSnapshot === 'string'
          ? JSON.parse(refundCase.calculationSnapshot)
          : refundCase.calculationSnapshot;
      } catch (e) {
        calculation = refundCase.calculationSnapshot;
      }
    }

    return {
      errCode: 0,
      data: {
        ...refundCase.toJSON(),
        calculation,
      },
    };
  } catch (error) {
    console.error('Error in getPatientRefundCase:', error);
    return { errCode: -1, errMessage: 'Lỗi khi tra cứu hồ sơ hoàn tiền' };
  }
}

module.exports = {
  REASON_RULES,
  createRefundCase,
  getAdminRefundCases,
  getRefundCaseDetail,
  processAdminReviewRefund,
  getPatientRefundCase,
};
