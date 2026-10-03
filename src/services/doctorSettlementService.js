// src/services/doctorSettlementService.js
// Phân hệ Quản trị Thù lao Bác sĩ theo Ca khám & Tách 3 Trạng thái Tiền (Doctor Settlement Governance)
const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const walletService = require('./walletService');

/**
 * 1. Ghi nhận thù lao khi ca khám Hoàn thành (S3) -> Trạng thái EARNED
 * Khoản tiền này chưa được rút ngay, được giữ T+24h để đảm bảo không có khiếu nại bệnh nhân
 */
async function recordCompletedBookingSettlement(bookingId, externalTransaction = null) {
  const t = externalTransaction || (await db.sequelize.transaction());
  try {
    const booking = await db.Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!booking) {
      throw new Error(`Không tìm thấy ca khám #${bookingId}`);
    }

    const doctorInfo = booking.doctorId
      ? await db.Doctor_Info.findOne({ where: { doctorId: booking.doctorId }, transaction: t })
      : null;

    // Kiểm tra ràng buộc duy nhất (Chống tạo 2 khoản thù lao cho 1 ca khám)
    const existingItem = await db.Doctor_Settlement_Item.findOne({
      where: { bookingId },
      transaction: t,
    });
    if (existingItem) {
      if (!externalTransaction) await t.commit();
      return { errCode: 0, message: 'Khoản quyết toán ca khám đã tồn tại', data: existingItem };
    }

    const grossAmount = Number(booking.bookingPrice || 0);

    // Đọc chính sách từ policySnapshot đã đóng băng lúc đặt lịch
    let platformFeeRate = 15.0; // Mặc định 15%
    let clinicShareRate = 0;
    let policySnapshotStr = booking.policySnapshot;

    if (booking.policySnapshot) {
      try {
        const snap = typeof booking.policySnapshot === 'string' ? JSON.parse(booking.policySnapshot) : booking.policySnapshot;
        if (snap.revenuePolicy?.rules) {
          platformFeeRate = Number(snap.revenuePolicy.rules.platformFeePercent) || 15.0;
          clinicShareRate = Number(snap.revenuePolicy.rules.clinicSharePercent) || 0;
        } else if (snap.calculation) {
          // Tính ngược lại tỷ lệ nếu snapshot có calculation
          if (grossAmount > 0) {
            platformFeeRate = (Number(snap.calculation.platformFee) / grossAmount) * 100;
          }
        }
      } catch (e) {
        console.error('Lỗi parse policySnapshot ca khám:', e);
      }
    } else if (doctorInfo?.commissionRate) {
      platformFeeRate = Number(doctorInfo.commissionRate);
    }

    const platformFee = Math.round((grossAmount * platformFeeRate) / 100);
    const clinicShare = Math.round((grossAmount * clinicShareRate) / 100);
    const netAmount = Math.max(0, grossAmount - platformFee - clinicShare);

    const now = new Date();
    // Giữ an toàn T+24h (24 giờ sau khi khám xong)
    const availableAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const settlementItem = await db.Doctor_Settlement_Item.create(
      {
        bookingId: booking.id,
        doctorId: booking.doctorId,
        clinicId: booking.clinicId || booking.doctorInfoData?.clinicId || null,
        appointmentDate: booking.date ? new Date(Number(booking.date) || booking.date) : now,
        grossAmount,
        platformFeeRate,
        platformFee,
        clinicShareRate,
        clinicShare,
        adjustmentAmount: 0,
        netAmount,
        policySnapshot: policySnapshotStr,
        status: 'EARNED', // Trạng thái 1: Đã phát sinh quyền hưởng
        earnedAt: now,
        availableAt,
      },
      { transaction: t }
    );

    if (!externalTransaction) await t.commit();

    return {
      errCode: 0,
      message: 'Ghi nhận thù lao ca khám thành công (Trạng thái: EARNED - T+24h)',
      data: settlementItem,
    };
  } catch (error) {
    if (!externalTransaction) await t.rollback();
    console.error('Error in recordCompletedBookingSettlement:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi ghi nhận thù lao ca khám',
    };
  }
}

/**
 * 2. Tự động kiểm tra và giải phóng thù lao đã qua thời hạn T+24h: EARNED -> AVAILABLE
 */
async function releaseEligibleSettlements(doctorId = null, { itemId, force = false } = {}) {
  try {
    const now = new Date();
    const where = {
      status: 'EARNED',
    };
    if (itemId) {
      where.id = itemId;
      if (!force) {
        where.availableAt = { [Op.lte]: now };
      }
    } else {
      where.availableAt = { [Op.lte]: now };
      if (doctorId) where.doctorId = doctorId;
    }

    const [updatedCount] = await db.Doctor_Settlement_Item.update(
      { status: 'AVAILABLE' },
      { where }
    );

    return {
      errCode: 0,
      message: itemId
        ? `Đã mở khóa thù lao cho ca khám #${itemId} sang trạng thái AVAILABLE (Sẵn sàng chi trả)`
        : `Đã kích hoạt chuyển ${updatedCount} ca khám sang trạng thái AVAILABLE (Sẵn sàng chi trả)`,
      updatedCount,
    };
  } catch (error) {
    console.error('Error in releaseEligibleSettlements:', error);
    return { errCode: -1, errMessage: 'Lỗi khi giải phóng thù lao bác sĩ' };
  }
}

/**
 * 3. Bảng kê Chi tiết Thù lao Bác sĩ (Itemized Statement) có phân trang & lọc
 */
async function getDoctorSettlementItems({
  doctorId,
  settlementId,
  status = 'ALL',
  page = 1,
  limit = 15,
  startDate,
  endDate,
} = {}) {
  try {
    // Tự động giải phóng các ca đã đủ điều kiện T+24h trước khi truy vấn
    await releaseEligibleSettlements(doctorId || null);

    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
    const offset = (p - 1) * lim;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (settlementId) where.settlementId = settlementId;
    if (status && status !== 'ALL') where.status = status;

    if (startDate && endDate) {
      where.earnedAt = {
        [Op.between]: [moment(startDate).startOf('day').toDate(), moment(endDate).endOf('day').toDate()],
      };
    } else if (startDate) {
      where.earnedAt = { [Op.gte]: moment(startDate).startOf('day').toDate() };
    } else if (endDate) {
      where.earnedAt = { [Op.lte]: moment(endDate).endOf('day').toDate() };
    }

    const { count, rows } = await db.Doctor_Settlement_Item.findAndCountAll({
      where,
      limit: lim,
      offset,
      order: [['earnedAt', 'DESC']],
      include: [
        {
          model: db.Booking,
          as: 'booking',
          attributes: ['id', 'patientName', 'patientPhoneNumber', 'bookingPrice', 'date', 'timeType'],
        },
        {
          model: db.User,
          as: 'doctor',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: db.Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
      ],
    });

    // Tính tổng hợp 3 trạng thái tiền
    const doctorWhere = doctorId ? { doctorId } : {};
    const aggs = await db.Doctor_Settlement_Item.findAll({
      where: doctorWhere,
      attributes: [
        'status',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('netAmount')), 0), 'totalNet'],
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('grossAmount')), 0), 'totalGross'],
        [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('platformFee')), 0), 'totalFee'],
      ],
      group: ['status'],
      raw: true,
    });

    const summary = {
      earnedAmount: 0,    // Đang giữ T+24h
      availableAmount: 0, // Sẵn sàng payout
      paidAmount: 0,      // Đã chi trả
      heldAmount: 0,      // Tạm giữ khiếu nại
      totalGross: 0,      // Tổng doanh thu khám
      totalPlatformFee: 0,// Tổng phí sàn
    };

    for (const a of aggs) {
      const net = Number(a.totalNet) || 0;
      summary.totalGross += Number(a.totalGross) || 0;
      summary.totalPlatformFee += Number(a.totalFee) || 0;

      if (a.status === 'EARNED') summary.earnedAmount = net;
      if (a.status === 'AVAILABLE') summary.availableAmount = net;
      if (a.status === 'PAID') summary.paidAmount = net;
      if (a.status === 'HELD') summary.heldAmount = net;
    }

    return {
      errCode: 0,
      errMessage: 'OK',
      data: rows,
      summary,
      pagination: {
        page: p,
        limit: lim,
        total: count,
        totalPages: Math.ceil(count / lim),
      },
    };
  } catch (error) {
    console.error('Error in getDoctorSettlementItems:', error);
    return { errCode: -1, errMessage: 'Lỗi khi tải bảng kê quyết toán thù lao' };
  }
}

/**
 * 4. Thực hiện chi trả thù lao cho các ca khám đã AVAILABLE -> Chuyển sang PAID
 * Hỗ trợ chi vào Ví Bác sĩ (nội bộ kèm sổ cái kép) hoặc Chuyển khoản ngân hàng
 */
async function payoutDoctorSettlementItems({
  doctorId,
  itemIds = [],
  payoutMethod = 'WALLET',
  adminId = null,
  note = '',
}) {
  const t = await db.sequelize.transaction();
  try {
    const where = {
      doctorId,
      status: 'AVAILABLE',
    };
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      where.id = { [Op.in]: itemIds };
    }

    const itemsToPay = await db.Doctor_Settlement_Item.findAll({
      where,
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!itemsToPay || itemsToPay.length === 0) {
      await t.rollback();
      return { errCode: 1, errMessage: 'Không có ca khám nào đủ điều kiện thanh toán (AVAILABLE)' };
    }

    const totalPayout = itemsToPay.reduce((acc, it) => acc + Number(it.netAmount || 0), 0);
    const now = new Date();

    let walletTxId = null;

    if (payoutMethod === 'WALLET') {
      // 1. Tìm hoặc khởi tạo Ví Bác sĩ
      let doctorWallet = await db.Wallet.findOne({
        where: { ownerId: doctorId, walletType: 'DOCTOR' },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!doctorWallet) {
        doctorWallet = await db.Wallet.create(
          {
            ownerId: doctorId,
            walletType: 'DOCTOR',
            availableBalance: 0,
            reservedBalance: 0,
            status: 'ACTIVE',
          },
          { transaction: t }
        );
      }

      const oldBal = Number(doctorWallet.availableBalance) || 0;
      const newBal = oldBal + totalPayout;
      doctorWallet.availableBalance = newBal;
      await doctorWallet.save({ transaction: t });

      // 2. Ghi bút toán Sổ cái kép bất biến
      const idempotencyKey = `DOC_PAYOUT_${doctorId}_${Date.now()}`;
      const ledgerTx = await db.Wallet_Transaction.create(
        {
          walletId: doctorWallet.id,
          direction: 'CREDIT',
          amount: totalPayout,
          balanceAfter: newBal,
          type: 'DOCTOR_SETTLEMENT',
          referenceType: 'DOCTOR_SETTLEMENT_BATCH',
          idempotencyKey,
          description: `Quyết toán thù lao ${itemsToPay.length} ca khám: ${note || 'Thanh toán đối soát'}`,
        },
        { transaction: t }
      );

      walletTxId = ledgerTx.id;
    }

    // 3. Cập nhật các items sang PAID
    for (const item of itemsToPay) {
      item.status = 'PAID';
      item.paidAt = now;
      item.payoutMethod = payoutMethod;
      item.walletTransactionId = walletTxId;
      await item.save({ transaction: t });
    }

    await t.commit();

    return {
      errCode: 0,
      message: `Đã chi trả thành công ${totalPayout.toLocaleString('vi-VN')} ₫ cho ${itemsToPay.length} ca khám!`,
      data: {
        totalPayout,
        paidItemCount: itemsToPay.length,
        payoutMethod,
      },
    };
  } catch (error) {
    await t.rollback();
    console.error('Error in payoutDoctorSettlementItems:', error);
    return { errCode: -1, errMessage: error.message || 'Lỗi khi chi trả thù lao bác sĩ' };
  }
}

module.exports = {
  recordCompletedBookingSettlement,
  releaseEligibleSettlements,
  getDoctorSettlementItems,
  payoutDoctorSettlementItems,
};
