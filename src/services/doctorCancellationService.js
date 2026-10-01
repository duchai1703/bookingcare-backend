// src/services/doctorCancellationService.js
// Doctor Schedule Cancellation & Compensation Engine (Phân cấp: Ngày/Slot/Bệnh nhân, 100% Hoàn tiền Ví tức thì)
'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { getOrCreateWallet } = require('./walletService');

/**
 * Phân tích & Trả về Impact Preview trước khi thực hiện hủy lịch
 */
const previewCancellation = async ({
  doctorId,
  clinicId = null,
  scope = 'DAY', // 'BOOKING' | 'SLOT' | 'DAY' | 'DATE_RANGE'
  date = null,
  timeType = null,
  bookingId = null,
  fromDate = null,
  toDate = null,
}) => {
  try {
    if (!doctorId) {
      return { errCode: 1, message: 'Thiếu thông tin bác sĩ (doctorId)!' };
    }

    const docId = Number(doctorId);
    let scheduleWhere = { doctorId: docId };
    let bookingWhere = {
      doctorId: docId,
      statusId: { [Op.ne]: 'S4' }, // Bỏ qua các ca đã hủy trước đó
    };

    if (clinicId) {
      scheduleWhere.clinicId = Number(clinicId);
      bookingWhere.clinicId = Number(clinicId);
    }

    // Xử lý điều kiện theo Scope
    if (scope === 'BOOKING') {
      if (!bookingId) {
        return { errCode: 2, message: 'Thiếu mã ca khám (bookingId) cần hủy!' };
      }
      bookingWhere.id = Number(bookingId);
      // Không cần lấy schedule cho 1 booking, hoặc chỉ lấy schedule liên quan
    } else if (scope === 'SLOT') {
      if (!date || !timeType) {
        return { errCode: 2, message: 'Thiếu thông tin ngày (date) và khung giờ (timeType)!' };
      }
      scheduleWhere.date = String(date);
      scheduleWhere.timeType = timeType;

      bookingWhere.date = String(date);
      bookingWhere.timeType = timeType;
    } else if (scope === 'DAY') {
      if (!date) {
        return { errCode: 2, message: 'Thiếu thông tin ngày (date) cần hủy!' };
      }
      scheduleWhere.date = String(date);
      bookingWhere.date = String(date);
    } else if (scope === 'DATE_RANGE') {
      if (!fromDate || !toDate) {
        return { errCode: 2, message: 'Thiếu khoảng ngày (fromDate, toDate)!' };
      }
      scheduleWhere.date = { [Op.between]: [String(fromDate), String(toDate)] };
      bookingWhere.date = { [Op.between]: [String(fromDate), String(toDate)] };
    } else {
      return { errCode: 3, message: 'Phạm vi hủy lịch (scope) không hợp lệ!' };
    }

    // 1. Tìm các Schedules bị ảnh hưởng
    let affectedSchedules = [];
    if (scope !== 'BOOKING') {
      affectedSchedules = await db.Schedule.findAll({
        where: scheduleWhere,
        include: [
          { model: db.Allcode, as: 'timeTypeData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
        ],
        order: [['date', 'ASC'], ['timeType', 'ASC']],
      });
    }

    // 2. Tìm các Bookings bị ảnh hưởng
    const affectedBookings = await db.Booking.findAll({
      where: bookingWhere,
      include: [
        {
          model: db.User,
          as: 'patientData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['keyMap', 'valueVi', 'valueEn'] },
        { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
      ],
      order: [['date', 'ASC'], ['timeType', 'ASC']],
    });

    // 3. Tính toán tổng tiền hoàn
    const totalRefundAmount = affectedBookings.reduce((sum, b) => {
      return sum + (Number(b.bookingPrice) || 0);
    }, 0);

    return {
      errCode: 0,
      message: 'OK',
      data: {
        doctorId: docId,
        clinicId: clinicId ? Number(clinicId) : null,
        scope,
        date,
        timeType,
        bookingId,
        fromDate,
        toDate,
        affectedSlotsCount: affectedSchedules.length,
        affectedBookingsCount: affectedBookings.length,
        totalRefundAmount,
        affectedSchedules: affectedSchedules.map((s) => ({
          id: s.id,
          date: s.date,
          timeType: s.timeType,
          timeLabel: s.timeTypeData?.valueVi || s.timeType,
          currentNumber: s.currentNumber,
          maxNumber: s.maxNumber,
          status: s.status,
          clinicName: s.clinicData?.name || '',
        })),
        affectedBookings: affectedBookings.map((b) => ({
          id: b.id,
          patientId: b.patientId,
          patientName: b.patientName || `${b.patientData?.lastName || ''} ${b.patientData?.firstName || ''}`.trim(),
          phoneNumber: b.patientPhoneNumber || b.patientData?.phoneNumber,
          email: b.patientData?.email,
          date: b.date,
          timeType: b.timeType,
          timeLabel: b.timeTypeBooking?.valueVi || b.timeType,
          bookingPrice: Number(b.bookingPrice) || 0,
          paymentMethod: b.paymentMethod || 'VNPAY',
          paymentStatus: b.paymentStatus,
          statusId: b.statusId,
          clinicName: b.clinicData?.name || '',
        })),
      },
    };
  } catch (error) {
    console.error('Error in previewCancellation:', error);
    return { errCode: -1, message: error.message || 'Lỗi server khi xem trước ảnh hưởng hủy lịch' };
  }
};

/**
 * Thực thi Hủy lịch khám & Hoàn tiền 100% tự động về Ví Bệnh nhân trong Transaction nguyên tử
 */
const executeCancellation = async ({
  doctorId,
  clinicId = null,
  scope = 'DAY',
  date = null,
  timeType = null,
  bookingId = null,
  fromDate = null,
  toDate = null,
  reason,
  cancelledBy,
  cancelledByRole = 'DOCTOR', // 'DOCTOR' | 'ADMIN'
}) => {
  if (!doctorId) {
    return { errCode: 1, message: 'Thiếu thông tin bác sĩ (doctorId)!' };
  }
  if (!reason || reason.trim().length < 5) {
    return { errCode: 2, message: 'Vui lòng cung cấp lý do hủy lịch rõ ràng (tối thiểu 5 ký tự)!' };
  }
  if (!cancelledBy) {
    return { errCode: 3, message: 'Thiếu thông tin người thực hiện hủy lịch!' };
  }

  const cleanReason = reason.trim();
  const docId = Number(doctorId);
  const now = new Date();

  const t = await db.sequelize.transaction();
  try {
    // 1. Tái phân tích điều kiện tìm target trong Transaction
    let scheduleWhere = { doctorId: docId };
    let bookingWhere = {
      doctorId: docId,
      statusId: { [Op.ne]: 'S4' },
    };

    if (clinicId) {
      scheduleWhere.clinicId = Number(clinicId);
      bookingWhere.clinicId = Number(clinicId);
    }

    if (scope === 'BOOKING') {
      if (!bookingId) {
        await t.rollback();
        return { errCode: 4, message: 'Thiếu mã ca khám (bookingId)!' };
      }
      bookingWhere.id = Number(bookingId);
    } else if (scope === 'SLOT') {
      if (!date || !timeType) {
        await t.rollback();
        return { errCode: 4, message: 'Thiếu ngày và khung giờ khám!' };
      }
      scheduleWhere.date = String(date);
      scheduleWhere.timeType = timeType;
      bookingWhere.date = String(date);
      bookingWhere.timeType = timeType;
    } else if (scope === 'DAY') {
      if (!date) {
        await t.rollback();
        return { errCode: 4, message: 'Thiếu ngày cần hủy!' };
      }
      scheduleWhere.date = String(date);
      bookingWhere.date = String(date);
    } else if (scope === 'DATE_RANGE') {
      if (!fromDate || !toDate) {
        await t.rollback();
        return { errCode: 4, message: 'Thiếu khoảng ngày cần hủy!' };
      }
      scheduleWhere.date = { [Op.between]: [String(fromDate), String(toDate)] };
      bookingWhere.date = { [Op.between]: [String(fromDate), String(toDate)] };
    } else {
      await t.rollback();
      return { errCode: 5, message: 'Phạm vi hủy không hợp lệ!' };
    }

    // 2. Lock & Retrieve Schedules
    let schedules = [];
    if (scope !== 'BOOKING') {
      schedules = await db.Schedule.findAll({
        where: scheduleWhere,
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
    }

    // 3. Lock & Retrieve Bookings
    const bookings = await db.Booking.findAll({
      where: bookingWhere,
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    // 4. Tạo bản ghi Sự kiện Hủy cha (Doctor_Schedule_Cancellation)
    const cancellationRecord = await db.Doctor_Schedule_Cancellation.create(
      {
        doctorId: docId,
        clinicId: clinicId ? Number(clinicId) : null,
        scope,
        cancellationDate: date ? String(date) : null,
        fromDate: fromDate ? String(fromDate) : null,
        toDate: toDate ? String(toDate) : null,
        reason: cleanReason,
        cancelledBy: Number(cancelledBy),
        cancelledByRole,
        status: 'COMPLETED',
        affectedSlotsCount: schedules.length,
        affectedBookingsCount: bookings.length,
        totalRefundAmount: 0, // Sẽ tính dồn ở dưới
      },
      { transaction: t }
    );

    // 5. Cập nhật và khóa các Schedule slots
    for (const sch of schedules) {
      await sch.update(
        {
          status: 'CLOSED_BY_DOCTOR',
        },
        { transaction: t }
      );

      // Lưu target Schedule
      await db.Doctor_Schedule_Cancellation_Target.create(
        {
          cancellationId: cancellationRecord.id,
          targetType: 'SCHEDULE',
          scheduleId: sch.id,
          timeType: sch.timeType,
          bookingPrice: 0,
          refundAmount: 0,
          refundStatus: 'SKIPPED',
          note: `Đóng khung giờ ${sch.timeType} ngày ${sch.date}`,
        },
        { transaction: t }
      );
    }

    // 6. Xử lý trạng thái và hoàn tiền 100% về Ví cho từng Booking
    let accumulatedRefund = 0;
    const targetResults = [];

    for (const b of bookings) {
      const bPrice = Number(b.bookingPrice) || 0;
      let walletTx = null;

      // 6.1. Giải phóng cọc Escrow Hold nếu có
      const walletHold = await db.Wallet_Hold.findOne({
        where: { bookingId: b.id, status: 'HELD' },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (walletHold) {
        await walletHold.update({ status: 'RELEASED' }, { transaction: t });
      }

      // 6.2. Hoàn tiền 100% về Ví người dùng nếu ca khám có giá trị
      if (bPrice > 0 && b.patientId) {
        const patientWallet = await getOrCreateWallet(b.patientId, 'PATIENT', t);
        const currentAvail = Number(patientWallet.availableBalance) || 0;
        const currentReserved = Number(patientWallet.reservedBalance) || 0;
        const holdAmt = walletHold ? Number(walletHold.amount) : bPrice;

        const newReserved = Math.max(0, currentReserved - holdAmt);
        const newAvail = currentAvail + bPrice;

        // Cập nhật số dư ví
        await patientWallet.update(
          {
            reservedBalance: newReserved,
            availableBalance: newAvail,
          },
          { transaction: t }
        );

        // Ghi bút toán sổ cái bất biến (Double-entry Ledger)
        walletTx = await db.Wallet_Transaction.create(
          {
            walletId: patientWallet.id,
            direction: 'CREDIT',
            amount: bPrice,
            balanceAfter: newAvail,
            transactionType: 'REFUND',
            referenceType: 'BOOKING',
            referenceId: String(b.id),
            idempotencyKey: `REFUND_DOC_CANCEL_${cancellationRecord.id}_${b.id}`,
            description: `Hoàn tiền 100% tự động (${bPrice.toLocaleString('vi-VN')} ₫) cho ca khám #${b.id} do Bác sĩ bận đột xuất: "${cleanReason}"`,
            status: 'COMPLETED',
          },
          { transaction: t }
        );

        accumulatedRefund += bPrice;
      }

      // 6.3. Cập nhật Booking trạng thái S4 (Cancelled by Doctor)
      await b.update(
        {
          statusId: 'S4',
          cancellationType: cancelledByRole === 'ADMIN' ? 'ADMIN' : 'DOCTOR',
          cancellationReason: cleanReason,
          cancellationId: cancellationRecord.id,
          refundRate: 100.0,
          refundAmount: bPrice,
          refundStatus: bPrice > 0 ? 'completed' : 'none',
          refundMethod: 'WALLET',
          paymentStatus: bPrice > 0 ? 'refunded' : 'cancelled',
          refundedAt: now,
          cancelledAt: now,
          // Triệt tiêu doanh thu & công nợ bác sĩ
          doctorShare: 0,
          platformFee: 0,
          clinicShare: 0,
        },
        { transaction: t }
      );

      // 6.4. Lưu target Booking
      const targetRecord = await db.Doctor_Schedule_Cancellation_Target.create(
        {
          cancellationId: cancellationRecord.id,
          targetType: 'BOOKING',
          bookingId: b.id,
          patientId: b.patientId,
          timeType: b.timeType,
          bookingPrice: bPrice,
          refundAmount: bPrice,
          walletTxId: walletTx ? walletTx.id : null,
          refundStatus: 'SUCCESS',
          note: `Đã hủy và hoàn 100% vào Ví BookingCare`,
        },
        { transaction: t }
      );

      targetResults.push(targetRecord);
    }

    // 7. Cập nhật tổng tiền hoàn vào bản ghi sự kiện cha
    await cancellationRecord.update(
      {
        totalRefundAmount: accumulatedRefund,
      },
      { transaction: t }
    );

    await t.commit();

    console.log(
      `[DOCTOR CANCELLATION SUCCESS] ID: ${cancellationRecord.id} | Doctor #${docId} | Scope: ${scope} | Slots: ${schedules.length} | Bookings: ${bookings.length} | Refunded: ${accumulatedRefund.toLocaleString('vi-VN')} VND`
    );

    return {
      errCode: 0,
      message: `Hủy lịch thành công! Đã đóng ${schedules.length} slot, hủy ${bookings.length} lịch khám và hoàn ${accumulatedRefund.toLocaleString('vi-VN')} ₫ vào Ví Bệnh nhân.`,
      data: {
        cancellationId: cancellationRecord.id,
        doctorId: docId,
        scope,
        affectedSlotsCount: schedules.length,
        affectedBookingsCount: bookings.length,
        totalRefundAmount: accumulatedRefund,
        status: 'COMPLETED',
      },
    };
  } catch (error) {
    await t.rollback();
    console.error('Error in executeCancellation:', error);
    return {
      errCode: -1,
      message: error.message || 'Lỗi server khi thực hiện hủy lịch khám',
    };
  }
};

/**
 * Lấy lịch sử các đợt hủy lịch (Admin & Doctor Console)
 */
const getCancellationHistory = async ({
  doctorId = null,
  clinicId = null,
  scope = null,
  page = 1,
  limit = 10,
}) => {
  try {
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const where = {};

    if (doctorId) {
      where.doctorId = Number(doctorId);
    }
    if (clinicId) {
      where.clinicId = Number(clinicId);
    }
    if (scope && scope !== 'ALL') {
      where.scope = scope;
    }

    const { count, rows } = await db.Doctor_Schedule_Cancellation.findAndCountAll({
      where,
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        },
        {
          model: db.User,
          as: 'cancelledByUserData',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: db.Clinic,
          as: 'clinicData',
          attributes: ['id', 'name'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    return {
      errCode: 0,
      message: 'OK',
      data: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
        cancellations: rows,
      },
    };
  } catch (error) {
    console.error('Error in getCancellationHistory:', error);
    return { errCode: -1, message: error.message || 'Lỗi khi lấy lịch sử hủy lịch' };
  }
};

/**
 * Xem chi tiết 1 đợt hủy lịch (Master-Detail Breakdown)
 */
const getCancellationDetail = async (cancellationId) => {
  try {
    if (!cancellationId) {
      return { errCode: 1, message: 'Thiếu mã đợt hủy (cancellationId)!' };
    }

    const cancellation = await db.Doctor_Schedule_Cancellation.findOne({
      where: { id: cancellationId },
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        },
        {
          model: db.User,
          as: 'cancelledByUserData',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: db.Clinic,
          as: 'clinicData',
          attributes: ['id', 'name', 'address'],
        },
        {
          model: db.Doctor_Schedule_Cancellation_Target,
          as: 'targets',
          include: [
            {
              model: db.Booking,
              as: 'bookingData',
              attributes: ['id', 'patientName', 'patientPhoneNumber', 'bookingPrice', 'statusId'],
            },
            {
              model: db.User,
              as: 'patientData',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
            },
            {
              model: db.Schedule,
              as: 'scheduleData',
              attributes: ['id', 'date', 'timeType', 'status'],
            },
          ],
        },
      ],
    });

    if (!cancellation) {
      return { errCode: 2, message: 'Không tìm thấy đợt hủy lịch này!' };
    }

    return {
      errCode: 0,
      message: 'OK',
      data: cancellation,
    };
  } catch (error) {
    console.error('Error in getCancellationDetail:', error);
    return { errCode: -1, message: error.message || 'Lỗi khi lấy chi tiết đợt hủy lịch' };
  }
};

module.exports = {
  previewCancellation,
  executeCancellation,
  getCancellationHistory,
  getCancellationDetail,
};
