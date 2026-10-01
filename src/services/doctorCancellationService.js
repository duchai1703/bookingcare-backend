// src/services/doctorCancellationService.js
// Doctor Schedule Cancellation & Compensation Engine (Phân cấp: Ngày/Slot/Bệnh nhân, 100% Hoàn tiền Ví tức thì)
'use strict';

const { Op } = require('sequelize');
const moment = require('moment');
const db = require('../models');
const { getOrCreateWallet } = require('./walletService');
const { sendDoctorCancellationApologyEmail } = require('./emailService');

/**
 * Phân tích & Trả về Impact Preview trước khi thực hiện hủy lịch
 */
const previewCancellation = async ({
  doctorId,
  clinicId = null,
  scope = 'DAY', // 'BOOKING' | 'SLOT' | 'DAY' | 'DATE_RANGE' | 'BATCH'
  date = null,
  timeType = null,
  bookingId = null,
  fromDate = null,
  toDate = null,
  scheduleIds = [],
  bookingIds = [],
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
    } else if (scope === 'BATCH') {
      const sIds = Array.isArray(scheduleIds) ? scheduleIds.map(Number).filter(Boolean) : [];
      const bIds = Array.isArray(bookingIds) ? bookingIds.map(Number).filter(Boolean) : [];

      if (sIds.length === 0 && bIds.length === 0) {
        return { errCode: 2, message: 'Vui lòng chọn ít nhất một ca khám hoặc khung giờ cần hủy!' };
      }

      if (sIds.length > 0) {
        scheduleWhere.id = { [Op.in]: sIds };
      } else {
        scheduleWhere.id = -1;
      }

      if (sIds.length > 0 && bIds.length > 0) {
        const targetSchedules = await db.Schedule.findAll({
          where: { id: { [Op.in]: sIds }, doctorId: docId },
          attributes: ['date', 'timeType'],
        });
        const slotConditions = targetSchedules.map((s) => ({ date: s.date, timeType: s.timeType }));
        bookingWhere[Op.or] = [
          { id: { [Op.in]: bIds } },
          ...slotConditions,
        ];
      } else if (sIds.length > 0) {
        const targetSchedules = await db.Schedule.findAll({
          where: { id: { [Op.in]: sIds }, doctorId: docId },
          attributes: ['date', 'timeType'],
        });
        if (targetSchedules.length > 0) {
          bookingWhere[Op.or] = targetSchedules.map((s) => ({ date: s.date, timeType: s.timeType }));
        } else {
          bookingWhere.id = -1;
        }
      } else {
        bookingWhere.id = { [Op.in]: bIds };
      }
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
  scheduleIds = [],
  bookingIds = [],
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
    } else if (scope === 'BATCH') {
      const sIds = Array.isArray(scheduleIds) ? scheduleIds.map(Number).filter(Boolean) : [];
      const bIds = Array.isArray(bookingIds) ? bookingIds.map(Number).filter(Boolean) : [];

      if (sIds.length === 0 && bIds.length === 0) {
        await t.rollback();
        return { errCode: 4, message: 'Vui lòng chọn ít nhất một ca khám hoặc khung giờ cần hủy!' };
      }

      if (sIds.length > 0) {
        scheduleWhere.id = { [Op.in]: sIds };
      } else {
        scheduleWhere.id = -1;
      }

      if (sIds.length > 0 && bIds.length > 0) {
        const targetSchedules = await db.Schedule.findAll({
          where: { id: { [Op.in]: sIds }, doctorId: docId },
          attributes: ['date', 'timeType'],
          transaction: t,
        });
        const slotConditions = targetSchedules.map((s) => ({ date: s.date, timeType: s.timeType }));
        bookingWhere[Op.or] = [
          { id: { [Op.in]: bIds } },
          ...slotConditions,
        ];
      } else if (sIds.length > 0) {
        const targetSchedules = await db.Schedule.findAll({
          where: { id: { [Op.in]: sIds }, doctorId: docId },
          attributes: ['date', 'timeType'],
          transaction: t,
        });
        if (targetSchedules.length > 0) {
          bookingWhere[Op.or] = targetSchedules.map((s) => ({ date: s.date, timeType: s.timeType }));
        } else {
          bookingWhere.id = -1;
        }
      } else {
        bookingWhere.id = { [Op.in]: bIds };
      }
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

    // 3. Lock & Retrieve Bookings (No outer joins with FOR UPDATE in Postgres)
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

    // [Phase 2] Bắn email xin lỗi & xác nhận hoàn tiền ví cho các bệnh nhân bị ảnh hưởng (asynchronous non-blocking)
    setImmediate(async () => {
      for (const b of bookings) {
        try {
          const detailB = await db.Booking.findByPk(b.id, {
            include: [
              { model: db.User, as: 'patientData', attributes: ['id', 'email', 'firstName', 'lastName'] },
              { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName'] },
              { model: db.Allcode, as: 'timeTypeBooking', attributes: ['valueVi', 'valueEn'] },
            ],
          });
          if (!detailB) continue;

          const patientEmail = detailB.patientData?.email;
          if (!patientEmail) continue;
          const patientName = `${detailB.patientData?.lastName || ''} ${detailB.patientData?.firstName || ''}`.trim() || detailB.patientName || 'Quý khách';
          const docName = detailB.doctorBookingData ? `${detailB.doctorBookingData.lastName || ''} ${detailB.doctorBookingData.firstName || ''}`.trim() : 'Bác sĩ chuyên khoa';
          const timeSlot = detailB.timeTypeBooking?.valueVi || detailB.timeType;
          const apptDate = detailB.date ? (isNaN(detailB.date) ? detailB.date : new Date(Number(detailB.date)).toLocaleDateString('vi-VN')) : '';

          await sendDoctorCancellationApologyEmail({
            email: patientEmail,
            patientName,
            doctorName: docName,
            appointmentTime: timeSlot,
            appointmentDate: apptDate,
            reason: cleanReason,
            refundAmount: Number(detailB.bookingPrice) || 0,
            bookingId: detailB.id,
            rescheduleUrl: `${process.env.URL_REACT || 'http://localhost:3000'}/patient/appointments`,
          });
        } catch (mailErr) {
          console.error(`[BACKGROUND APOLOGY EMAIL FAILED] Booking #${b.id}:`, mailErr.message);
        }
      }
    });

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

const TIME_TYPE_END_HOURS = {
  T1: '09:00',
  T2: '10:00',
  T3: '11:00',
  T4: '12:00',
  T5: '14:00',
  T6: '15:00',
  T7: '16:00',
  T8: '17:00',
};

const isSlotInPast = (dateStr, timeType) => {
  try {
    let dateMoment;
    const str = String(dateStr).trim();
    if (/^\d{8}$/.test(str)) {
      dateMoment = moment(str, 'YYYYMMDD');
    } else if (/^\d{11,14}$/.test(str)) {
      dateMoment = moment(Number(str));
    } else if (/^\d+$/.test(str)) {
      dateMoment = moment(Number(str));
    } else {
      dateMoment = moment(str, ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMMDD', moment.ISO_8601]);
    }
    if (!dateMoment.isValid()) return false;

    const endHourStr = TIME_TYPE_END_HOURS[timeType] || '23:59';
    const [hh, mm] = endHourStr.split(':');
    dateMoment.hour(Number(hh)).minute(Number(mm)).second(0).millisecond(0);
    return dateMoment.isBefore(moment());
  } catch (err) {
    return false;
  }
};

/**
 * [PHASE 3] Mở lại khung giờ khám (Reopen Schedule Slot)
 */
const reopenSchedule = async ({
  scheduleId,
  doctorId = null,
  userRole = 'DOCTOR',
  userId = null,
  reason = '',
}) => {
  try {
    if (!scheduleId) {
      return { errCode: 1, message: 'Thiếu mã khung giờ (scheduleId) cần mở lại!' };
    }

    const schedule = await db.Schedule.findByPk(scheduleId);
    if (!schedule) {
      return { errCode: 2, message: 'Không tìm thấy khung giờ khám này trong hệ thống!' };
    }

    // Role check: Bác sĩ chỉ mở lại lịch của chính mình
    if (userRole === 'R2' || userRole === 'DOCTOR') {
      if (doctorId && Number(schedule.doctorId) !== Number(doctorId)) {
        return { errCode: 403, message: 'Bạn không có quyền mở lại lịch của bác sĩ khác!' };
      }
    }

    if (schedule.status === 'ACTIVE') {
      return { errCode: 3, message: 'Khung giờ này đã ở trạng thái mở tiếp nhận bệnh nhân!' };
    }

    // Kiểm tra giờ khám đã qua trong quá khứ chưa
    if (isSlotInPast(schedule.date, schedule.timeType)) {
      return { errCode: 4, message: 'Không thể mở lại khung giờ đã trôi qua trong quá khứ!' };
    }

    // Khôi phục trạng thái ACTIVE
    schedule.status = 'ACTIVE';
    if (Number(schedule.maxNumber) === 0) {
      schedule.maxNumber = 10;
    }
    schedule.currentNumber = 0;
    await schedule.save();

    // Cập nhật audit trail trong Doctor_Schedule_Cancellation_Target
    await db.Doctor_Schedule_Cancellation_Target.update(
      {
        reopenedAt: new Date(),
        reopenedBy: userId,
        note: reason ? `Mở lại slot: ${reason}` : 'Bác sĩ đã khôi phục mở lại slot khám',
      },
      {
        where: {
          scheduleId: schedule.id,
          targetType: 'SCHEDULE',
          reopenedAt: null,
        },
      }
    );

    return {
      errCode: 0,
      message: 'Mở lại khung giờ khám thành công! Bệnh nhân có thể tiếp tục đặt lịch.',
      data: schedule,
    };
  } catch (error) {
    console.error('Error in reopenSchedule:', error);
    return { errCode: -1, message: error.message || 'Lỗi khi mở lại khung giờ khám' };
  }
};

/**
 * [PHASE 3] Tính điểm độ tin cậy của Bác sĩ (Doctor Reliability Score)
 */
const getDoctorReliabilityScore = async (doctorId, { days = 30 } = {}) => {
  try {
    if (!doctorId) {
      return { errCode: 1, message: 'Thiếu thông tin bác sĩ (doctorId)!' };
    }

    const docId = Number(doctorId);
    const doctorUser = await db.User.findByPk(docId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'image'],
      include: [
        {
          model: db.Doctor_Info,
          as: 'doctorInfoData',
          attributes: ['specialtyId', 'clinicId'],
          include: [
            { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
            { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
          ],
        },
      ],
    });

    if (!doctorUser) {
      return { errCode: 2, message: 'Không tìm thấy bác sĩ trong hệ thống!' };
    }

    const bookingWhere = { doctorId: docId };
    if (days && days > 0) {
      const fromTime = moment().subtract(days, 'days').startOf('day').toDate();
      bookingWhere.createdAt = { [Op.gte]: fromTime };
    }

    const allBookings = await db.Booking.findAll({
      where: bookingWhere,
      attributes: ['id', 'statusId', 'date', 'timeType', 'cancellationType', 'cancellationReason', 'createdAt', 'updatedAt'],
    });

    const totalBookings = allBookings.length;
    const doctorCancelled = allBookings.filter(b => b.cancellationType === 'DOCTOR' || b.cancellationType === 'ADMIN');
    const doctorCancelledCount = doctorCancelled.length;

    // Tính số ca hủy sát giờ (< 24h)
    let lateCancelledCount = 0;
    doctorCancelled.forEach(b => {
      let apptMoment;
      if (/^\d+$/.test(String(b.date))) {
        apptMoment = moment(Number(b.date));
      } else {
        apptMoment = moment(b.date, ['YYYY-MM-DD', 'YYYY/MM/DD', moment.ISO_8601]);
      }
      if (apptMoment.isValid()) {
        const slotEnd = TIME_TYPE_END_HOURS[b.timeType] || '08:00';
        const [hh, mm] = slotEnd.split(':');
        apptMoment.hour(Number(hh)).minute(Number(mm));

        const cancelTime = moment(b.updatedAt);
        const hoursNotice = apptMoment.diff(cancelTime, 'hours', true);
        if (hoursNotice < 24) {
          lateCancelledCount++;
        }
      }
    });

    let cancellationRate = 0;
    let lateRatio = 0;
    let reliabilityScore = 100;

    if (totalBookings > 0) {
      cancellationRate = Math.round((doctorCancelledCount / totalBookings) * 1000) / 10;
      lateRatio = doctorCancelledCount > 0 ? Math.round((lateCancelledCount / doctorCancelledCount) * 1000) / 10 : 0;
      const penalty = (cancellationRate * 1.5) + (lateRatio * 0.5);
      reliabilityScore = Math.max(0, Math.min(100, Math.round((100 - penalty) * 10) / 10));
    }

    let tier = 'EXCELLENT';
    let tierLabel = 'Xuất sắc';
    let warningLevel = 'NONE';

    if (reliabilityScore < 70) {
      tier = 'CRITICAL';
      tierLabel = 'Nguy cấp (Cần can thiệp)';
      warningLevel = 'HIGH';
    } else if (reliabilityScore < 85) {
      tier = 'WARNING';
      tierLabel = 'Cần lưu ý';
      warningLevel = 'MEDIUM';
    } else if (reliabilityScore < 95) {
      tier = 'GOOD';
      tierLabel = 'Tốt';
      warningLevel = 'LOW';
    }

    return {
      errCode: 0,
      message: 'OK',
      data: {
        doctor: {
          id: doctorUser.id,
          fullName: `${doctorUser.lastName || ''} ${doctorUser.firstName || ''}`.trim(),
          email: doctorUser.email,
          phoneNumber: doctorUser.phoneNumber,
          avatar: doctorUser.image,
          specialty: doctorUser.doctorInfoData?.specialtyData?.name || '--',
          clinic: doctorUser.doctorInfoData?.clinicData?.name || '--',
        },
        timeFrameDays: days,
        totalBookings,
        cancelledByDoctor: doctorCancelledCount,
        lateCancelledCount,
        cancellationRate,
        lateRatio,
        reliabilityScore,
        tier,
        tierLabel,
        warningLevel,
      },
    };
  } catch (error) {
    console.error('Error in getDoctorReliabilityScore:', error);
    return { errCode: -1, message: error.message || 'Lỗi khi tính điểm tin cậy của bác sĩ' };
  }
};

/**
 * [PHASE 3] Thống kê Báo cáo Hủy lịch & Quản trị Độ tin cậy toàn diện
 */
const getCancellationAnalytics = async ({
  startDate = null,
  endDate = null,
  clinicId = null,
  doctorId = null,
} = {}) => {
  try {
    const cancelWhere = {};
    if (doctorId) cancelWhere.doctorId = Number(doctorId);
    if (clinicId) cancelWhere.clinicId = Number(clinicId);

    if (startDate && endDate) {
      cancelWhere.createdAt = {
        [Op.between]: [
          moment(startDate).startOf('day').toDate(),
          moment(endDate).endOf('day').toDate(),
        ],
      };
    } else if (startDate) {
      cancelWhere.createdAt = { [Op.gte]: moment(startDate).startOf('day').toDate() };
    } else {
      // Mặc định 30 ngày gần nhất
      cancelWhere.createdAt = { [Op.gte]: moment().subtract(30, 'days').startOf('day').toDate() };
    }

    const cancellations = await db.Doctor_Schedule_Cancellation.findAll({
      where: cancelWhere,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'image'],
          include: [
            {
              model: db.Doctor_Info,
              as: 'doctorInfoData',
              attributes: ['specialtyId', 'clinicId'],
              include: [
                { model: db.Specialty, as: 'specialtyData', attributes: ['id', 'name'] },
                { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name'] },
              ],
            },
          ],
        },
      ],
    });

    const totalEvents = cancellations.length;
    let totalAffectedBookings = 0;
    let totalRefundAmount = 0;
    const byScope = { BOOKING: 0, SLOT: 0, DAY: 0, DATE_RANGE: 0 };
    const cancellationIds = cancellations.map(c => c.id);

    cancellations.forEach(c => {
      totalAffectedBookings += Number(c.affectedBookingsCount || 0);
      totalRefundAmount += Number(c.totalRefundAmount || 0);
      if (byScope[c.scope] !== undefined) {
        byScope[c.scope]++;
      }
    });

    let totalClosedSlots = 0;
    let totalReopenedSlots = 0;
    let rescheduledCount = 0;
    let lateCancellationsCount = 0;

    if (cancellationIds.length > 0) {
      const scheduleTargets = await db.Doctor_Schedule_Cancellation_Target.findAll({
        where: {
          cancellationId: { [Op.in]: cancellationIds },
          targetType: 'SCHEDULE',
        },
        attributes: ['id', 'scheduleId', 'reopenedAt'],
      });
      totalClosedSlots = scheduleTargets.length;
      totalReopenedSlots = scheduleTargets.filter(t => t.reopenedAt !== null).length;

      const bookingTargets = await db.Doctor_Schedule_Cancellation_Target.findAll({
        where: {
          cancellationId: { [Op.in]: cancellationIds },
          targetType: 'BOOKING',
        },
        attributes: ['bookingId'],
        include: [
          {
            model: db.Booking,
            as: 'bookingData',
            attributes: ['id', 'rescheduledToBookingId', 'date', 'timeType', 'updatedAt'],
          },
        ],
      });

      bookingTargets.forEach(t => {
        const bk = t.bookingData;
        if (bk) {
          if (bk.rescheduledToBookingId) {
            rescheduledCount++;
          }
          let apptMoment;
          if (/^\d+$/.test(String(bk.date))) {
            apptMoment = moment(Number(bk.date));
          } else {
            apptMoment = moment(bk.date, ['YYYY-MM-DD', 'YYYY/MM/DD', moment.ISO_8601]);
          }
          if (apptMoment.isValid()) {
            const slotEnd = TIME_TYPE_END_HOURS[bk.timeType] || '08:00';
            const [hh, mm] = slotEnd.split(':');
            apptMoment.hour(Number(hh)).minute(Number(mm));
            const hoursNotice = apptMoment.diff(moment(bk.updatedAt), 'hours', true);
            if (hoursNotice < 24) {
              lateCancellationsCount++;
            }
          }
        }
      });
    }

    const rescheduleRetentionRate = totalAffectedBookings > 0
      ? Math.round((rescheduledCount / totalAffectedBookings) * 1000) / 10
      : 0;

    const reopenRate = totalClosedSlots > 0
      ? Math.round((totalReopenedSlots / totalClosedSlots) * 1000) / 10
      : 0;

    const lateCancellationRate = totalAffectedBookings > 0
      ? Math.round((lateCancellationsCount / totalAffectedBookings) * 1000) / 10
      : 0;

    // Doctor Watchlist
    const doctorMap = {};
    for (const c of cancellations) {
      const dId = c.doctorId;
      if (!doctorMap[dId]) {
        const docUser = c.doctorData;
        doctorMap[dId] = {
          doctorId: dId,
          doctorName: docUser ? `${docUser.lastName || ''} ${docUser.firstName || ''}`.trim() : `Bác sĩ #${dId}`,
          email: docUser?.email || '',
          avatar: docUser?.image || null,
          specialty: docUser?.doctorInfoData?.specialtyData?.name || '--',
          clinic: docUser?.doctorInfoData?.clinicData?.name || '--',
          eventsCount: 0,
          affectedBookings: 0,
          totalRefunded: 0,
        };
      }
      doctorMap[dId].eventsCount++;
      doctorMap[dId].affectedBookings += Number(c.affectedBookingsCount || 0);
      doctorMap[dId].totalRefunded += Number(c.totalRefundAmount || 0);
    }

    const doctorWatchlist = [];
    for (const dId of Object.keys(doctorMap)) {
      const item = doctorMap[dId];
      const scoreRes = await getDoctorReliabilityScore(dId, { days: 30 });
      if (scoreRes && scoreRes.errCode === 0) {
        item.reliabilityScore = scoreRes.data.reliabilityScore;
        item.cancellationRate = scoreRes.data.cancellationRate;
        item.tier = scoreRes.data.tier;
        item.tierLabel = scoreRes.data.tierLabel;
        item.warningLevel = scoreRes.data.warningLevel;
        item.lateCancelledCount = scoreRes.data.lateCancelledCount;
      } else {
        item.reliabilityScore = 100;
        item.tier = 'EXCELLENT';
        item.tierLabel = 'Xuất sắc';
        item.warningLevel = 'NONE';
      }
      doctorWatchlist.push(item);
    }

    doctorWatchlist.sort((a, b) => b.affectedBookings - a.affectedBookings);

    // Xu hướng 14 ngày gần đây
    const trendMap = {};
    for (let i = 13; i >= 0; i--) {
      const dStr = moment().subtract(i, 'days').format('YYYY-MM-DD');
      trendMap[dStr] = { date: dStr, events: 0, bookings: 0, refundAmount: 0 };
    }
    cancellations.forEach(c => {
      const dStr = moment(c.createdAt).format('YYYY-MM-DD');
      if (trendMap[dStr]) {
        trendMap[dStr].events++;
        trendMap[dStr].bookings += Number(c.affectedBookingsCount || 0);
        trendMap[dStr].refundAmount += Number(c.totalRefundAmount || 0);
      }
    });

    return {
      errCode: 0,
      message: 'OK',
      data: {
        summary: {
          totalEvents,
          totalAffectedBookings,
          totalRefundAmount,
          totalClosedSlots,
          totalReopenedSlots,
          reopenRate,
          rescheduledCount,
          rescheduleRetentionRate,
          lateCancellationsCount,
          lateCancellationRate,
        },
        byScope,
        doctorWatchlist,
        dailyTrend: Object.values(trendMap),
      },
    };
  } catch (error) {
    console.error('Error in getCancellationAnalytics:', error);
    return { errCode: -1, message: error.message || 'Lỗi khi thống kê báo cáo hủy lịch' };
  }
};

module.exports = {
  previewCancellation,
  executeCancellation,
  getCancellationHistory,
  getCancellationDetail,
  reopenSchedule,
  getDoctorReliabilityScore,
  getCancellationAnalytics,
};
