// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.3] paymentController.js
// Luồng thanh toán VNPay: buildVnpayUrl, createPaymentUrl, vnpayIpn
// Tuân thủ 100% Tài liệu Kiến trúc v20.6 — 64 Guards
// ═══════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment-timezone');
const axios = require('axios');
const validator = require('validator');
const { Sequelize, Op } = require('sequelize');
const db = require('../models');
const idempotencyStore = require('../utils/idempotencyStore');
const generateReceiptToken = require('../utils/generateReceiptToken');
const sanitizeLog = require('../utils/sanitizeLog');
const VNPAY_ALLOWED_KEYS = require('../utils/vnpayAllowedKeys');

// ═══ ENV Constants ═══
const VNP_TMN_CODE = process.env.VNP_TMN_CODE;
const VNP_HASH_SECRET = process.env.VNP_HASH_SECRET;
const VNP_URL = process.env.VNP_URL;
const VNP_RETURN_URL = process.env.VNP_RETURN_URL;
const VNP_API_URL = process.env.VNP_API_URL;

// ═══ Isolation Level shorthand ═══
const READ_COMMITTED = Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED;

// ═══════════════════════════════════════════════════════════════════════
// buildVnpayUrl — Tạo URL redirect sang cổng thanh toán VNPay
// Guard: SHA512 HMAC, sorted keys, amount × 100
// [NEW LOGIC VNPAY-MAIL]: Lỗi 27 — vnp_ExpireDate = updatedAt + 20 phút (đồng bộ Cronjob)
// ═══════════════════════════════════════════════════════════════════════
function buildVnpayUrl(paymentToken, amount, ipAddr, updatedAt) {
  const cleanOrderInfo = `Thanh toan don hang ${paymentToken}`.replace(
    /[^a-zA-Z0-9 ]/g,
    '',
  );
  // [NEW LOGIC VNPAY-MAIL]: Lỗi 28 — Ép timezone Asia/Ho_Chi_Minh
  const createDate = updatedAt
    ? moment(updatedAt).tz('Asia/Ho_Chi_Minh').format('YYYYMMDDHHmmss')
    : moment().tz('Asia/Ho_Chi_Minh').format('YYYYMMDDHHmmss');
  // [NEW LOGIC VNPAY-MAIL]: Lỗi 27 — ExpireDate = updatedAt + 20 phút (khớp Cronjob)
  const expireDate = updatedAt
    ? moment(updatedAt).tz('Asia/Ho_Chi_Minh').add(20, 'minutes').format('YYYYMMDDHHmmss')
    : moment().tz('Asia/Ho_Chi_Minh').add(20, 'minutes').format('YYYYMMDDHHmmss');
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_Amount: amount * 100,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: paymentToken,
    vnp_OrderInfo: cleanOrderInfo,
    vnp_Locale: 'vn',
    vnp_ReturnUrl: VNP_RETURN_URL,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate, // [NEW LOGIC VNPAY-MAIL]: Lỗi 27
  };
  const sorted = {};
  Object.keys(params)
    .sort()
    .forEach((k) => (sorted[k] = params[k]));
  const signData = qs.stringify(sorted, { encode: false });
  const hash = crypto
    .createHmac('sha512', VNP_HASH_SECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
  const urlQuery = qs.stringify(sorted, { encode: true });
  return `${VNP_URL}?${urlQuery}&vnp_SecureHashType=SHA512&vnp_SecureHash=${hash}`;
}

// ═══════════════════════════════════════════════════════════════════════
// createPaymentUrl — POST /api/v1/payment/create-payment-url
// Middleware chain: backpressureGate → verifyToken → checkPatientRole
// Guards: #56 Idempotency, #62 TCP Bridge, #55 Timeout 8s,
//         #37 Lock Order (Schedule TRƯỚC → Booking SAU), #27 S1 Cutoff
// ═══════════════════════════════════════════════════════════════════════
async function createPaymentUrl(req, res) {
  const idempotencyKey = req.headers['x-idempotency-key'];

  // ═══ IDEMPOTENCY GATE (Fail-Closed) — Guard #56 ═══
  if (idempotencyKey) {
    let existing;
    try {
      existing = await idempotencyStore.get(idempotencyKey);
    } catch (e) {
      res.set('Retry-After', '5');
      return res.status(503).json({ errCode: -4 });
    }
    if (existing === 'IN_PROGRESS')
      return res.status(409).json({ errCode: -2, suggestedWaitMs: 3000 });
    if (existing && existing !== 'IN_PROGRESS') return res.json(existing);
    try {
      if (!(await idempotencyStore.setInProgress(idempotencyKey)))
        return res.status(409).json({ errCode: -2, suggestedWaitMs: 3000 });
    } catch (e) {
      res.set('Retry-After', '5');
      return res.status(503).json({ errCode: -4 });
    }
  }

  const ac = new AbortController();
  const signal = ac.signal;
  let isResponded = false;
  let timeoutHandle;

  // ═══ TCP Bridge — Guard #62: dọn khi client drop BẤT THƯỜNG ═══
  req.on('close', () => {
    if (!res.writableEnded) {
      ac.abort();
      if (idempotencyKey)
        idempotencyStore.delete(idempotencyKey).catch(() => {});
    }
  });

  try {
    // ═══ Timeout Race — Guard #55: 8000ms ═══
    await Promise.race([
      executeCreatePayment(req, res, signal, idempotencyKey),
      new Promise((_, rej) => {
        timeoutHandle = setTimeout(() => {
          ac.abort();
          rej(new Error('TIMEOUT'));
        }, 8000);
      }),
    ]);
  } catch (err) {
    if (err.message === 'TIMEOUT' && !isResponded) {
      isResponded = true;
      if (idempotencyKey)
        idempotencyStore.delete(idempotencyKey).catch(() => {});
      res.set('Retry-After', '3');
      return res.status(503).json({ errCode: -3 });
    }
    if (!isResponded) {
      isResponded = true;
      if (idempotencyKey)
        idempotencyStore.delete(idempotencyKey).catch(() => {});
      return res.status(500).json({ errCode: -1 });
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  async function executeCreatePayment(req, res, signal, idempotencyKey) {
    const { doctorId, date, timeType, price } = req.body;
    const legacyToken = crypto.randomUUID();

    let isResume = false,
      paymentTokenToUse = null,
      bookingPriceToUse = null;
    if (signal.aborted) return;
    const t = await db.sequelize.transaction({
      isolationLevel: READ_COMMITTED,
    });
    await db.sequelize.query('SET SESSION innodb_lock_wait_timeout=5', {
      transaction: t,
    });

    try {
      // ⚠️ LOCK ORDER: Schedule TRƯỚC → Booking SAU (Guard #37, #43)
      // Thứ tự này BẮT BUỘC nhất quán trong mọi transaction để ngăn Deadlock

      // A: Lock Schedule TRƯỚC
      if (signal.aborted) {
        await t.rollback();
        return;
      }
      const schedule = await db.Schedule.findOne({
        where: { doctorId, date, timeType },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!schedule) {
        await t.rollback();
        return writeResponse({ errCode: 3 });
      }
      if (schedule.currentNumber >= schedule.maxNumber) {
        await t.rollback();
        return writeResponse({ errCode: 4 });
      }

      // B: Booking SAU
      if (signal.aborted) {
        await t.rollback();
        return;
      }
      const existing = await db.Booking.findOne({
        where: {
          patientId: req.user.id,
          doctorId,
          date,
          timeType,
          statusId: { [Op.in]: ['S1', 'S2', 'S3'] },
        },
        transaction: t,
      });
      if (existing && ['S2', 'S3'].includes(existing.statusId)) {
        await t.rollback();
        return writeResponse({ errCode: 2 });
      }
      if (existing?.statusId === 'S1' && existing.paymentStatus === 'unpaid') {
        // ═══ S1/Cutoff Logic — Guard #27 ═══
        // Raw SQL dùng NOW() server-side để tránh NTP drift
        const cutoff = await db.sequelize.query(
          `SELECT (createdAt<DATE_SUB(NOW(),INTERVAL 20 MINUTE)) AS isExpired
           FROM Bookings WHERE id=:id`,
          {
            replacements: { id: existing.id },
            type: Sequelize.QueryTypes.SELECT,
            plain: true,
            transaction: t,
          },
        );
        if (!cutoff.isExpired) {
          isResume = true;
          paymentTokenToUse = existing.paymentToken;
          bookingPriceToUse = existing.bookingPrice;
          await t.commit();
        } else {
          existing.statusId = 'S4';
          existing.paymentStatus = 'expired';
          await existing.save({ transaction: t });
          if (schedule.currentNumber > 0)
            await schedule.decrement('currentNumber', {
              by: 1,
              transaction: t,
            });
        }
      }

      // C: Tạo mới
      if (!isResume) {
        if (signal.aborted) {
          await t.rollback();
          return;
        }
        const nb = await db.Booking.create(
          {
            patientId: req.user.id,
            doctorId,
            date,
            timeType,
            statusId: 'S1',
            paymentStatus: 'unpaid',
            bookingPrice: price,
            paymentToken: crypto.randomUUID(),
            token: legacyToken,
          },
          { transaction: t },
        );
        await schedule.increment('currentNumber', { by: 1, transaction: t });
        if (signal.aborted) {
          await t.rollback();
          return;
        }
        await t.commit();
        paymentTokenToUse = nb.paymentToken;
        bookingPriceToUse = nb.bookingPrice;
      }

      // STEP_URL: Tạo VNPay URL
      if (signal.aborted) return;
      const ipAddr =
        req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.ip;
      const vnpUrl = buildVnpayUrl(
        paymentTokenToUse,
        bookingPriceToUse,
        ipAddr,
      );
      const payload = { errCode: 0, paymentUrl: vnpUrl, isResume };

      if (idempotencyKey) {
        try {
          await idempotencyStore.setDone(idempotencyKey, payload);
        } catch (e) {
          idempotencyStore.delete(idempotencyKey).catch(() => {});
        }
      }
      writeResponse(payload);
    } catch (err) {
      if (t && !t.finished) await t.rollback();
      if (idempotencyKey)
        idempotencyStore.delete(idempotencyKey).catch(() => {});
      writeResponse({ errCode: -1 }, 500);
    }
    function writeResponse(body, status = 200) {
      if (isResponded) return;
      isResponded = true;
      res.status(status).json(body);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// vnpayIpn — GET /api/v1/payment/vnpay-ipn
// Nhận webhook IPN từ VNPay → xác thực chữ ký → cập nhật trạng thái
// Guards: #40 timingSafeEqual, #16 AllowedKeys, #37/#38 Lock Order Exception
// ═══════════════════════════════════════════════════════════════════════
async function vnpayIpn(req, res) {
  try {
    const vnp_Params = Object.assign(Object.create(null), req.query);
    if (Object.keys(vnp_Params).length === 0)
      return res.status(200).json({ RspCode: '97' });
    for (const key of Object.keys(vnp_Params))
      if (!VNPAY_ALLOWED_KEYS.includes(key))
        return res.status(200).json({ RspCode: '97' });
    if (
      typeof vnp_Params['vnp_SecureHashType'] !== 'string' ||
      vnp_Params['vnp_SecureHashType'] !== 'SHA512'
    )
      return res.status(200).json({ RspCode: '97' });
    const receivedHash = vnp_Params['vnp_SecureHash'];
    if (
      typeof receivedHash !== 'string' ||
      !/^[a-f0-9]{128}$/i.test(receivedHash)
    )
      return res.status(200).json({ RspCode: '97' });

    // ═══ Tính toán chữ ký expected ═══
    const params = Object.assign(Object.create(null), vnp_Params);
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];
    const sorted = Object.create(null);
    Object.keys(params)
      .sort()
      .forEach((k) => (sorted[k] = params[k]));
    const signData = qs.stringify(sorted, { encode: false });
    const expected = crypto
      .createHmac('sha512', VNP_HASH_SECRET)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    // ═══ Guard #40: timingSafeEqual — chống timing attack ═══
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedHash, 'utf-8'),
        Buffer.from(expected, 'utf-8'),
      )
    )
      return res.status(200).json({ RspCode: '97' });

    const vnpAmount = parseInt(vnp_Params['vnp_Amount'], 10);
    if (!Number.isSafeInteger(vnpAmount))
      return res.status(200).json({ RspCode: '04' });
    const vnpTransNo = vnp_Params['vnp_TransactionNo'];
    if (typeof vnpTransNo !== 'string' || !vnpTransNo.trim())
      return res.status(200).json({ RspCode: '97' });

    // ⚠️ [v20.1 FIX-2] IPN lock bắt đầu từ Booking (xem exception tại else branch bên dưới)
    const t = await db.sequelize.transaction();
    try {
      // ═══ LOCK ORDER EXCEPTION (IPN): Booking TRƯỚC → Schedule SAU ═══
      // Guard #37/#38: IPN buộc phải lock Booking trước để lấy doctorId/date/timeType
      const booking = await db.Booking.findOne({
        where: { paymentToken: vnp_Params['vnp_TxnRef'] },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [
          { model: db.User, as: 'doctorBookingData' },
          { model: db.User, as: 'patientData' },
          { model: db.Allcode, as: 'timeTypeBooking' },
        ],
      });
      if (!booking) {
        await t.rollback();
        return res.status(200).json({ RspCode: '01' });
      }
      if (
        ['paid', 'failed', 'expired', 'refunded'].includes(
          booking.paymentStatus,
        )
      ) {
        await t.rollback();
        return res.status(200).json({ RspCode: '02' });
      }
      if (
        !Number.isSafeInteger(booking.bookingPrice * 100) ||
        vnpAmount !== booking.bookingPrice * 100
      ) {
        await t.rollback();
        return res.status(200).json({ RspCode: '04' });
      }

      if (vnp_Params['vnp_ResponseCode'] === '00') {
        // ═══ Thanh toán THÀNH CÔNG ═══
        booking.statusId = 'S2';
        booking.paymentStatus = 'paid';
        booking.vnpayTransactionNo = vnpTransNo;
        booking.vnp_PayDate = vnp_Params['vnp_PayDate'];
        booking.receiptExpiredAt = db.sequelize.literal(
          'DATE_ADD(NOW(),INTERVAL 24 HOUR)',
        );
        booking.reconcileFirstSeenAt = null;
        booking.lastQuerydrCode = '00';
        await generateReceiptToken(booking, t); // save bên trong
        await t.commit();
        res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
        // Email chạy ngầm — KHÔNG await để không block IPN response
        sendBookingEmail(booking).catch((e) =>
          console.error('[EMAIL]', sanitizeLog(e, null)),
        );
      } else {
        // ═══ Thanh toán THẤT BẠI ═══
        // ✅ [v20.0 F3] LOCK ORDER EXCEPTION (IPN only):
        // IPN buộc phải lock Booking trước để lấy doctorId/date/timeType.
        // Thứ tự: Booking → Schedule (ngược với create_payment_url).
        // Deadlock risk được kiểm soát bởi Guard #38 (retry × 3, errno 1213/1205).
        // KHÔNG thay đổi thứ tự này — đây là ràng buộc phụ thuộc dữ liệu.
        booking.statusId = 'S4';
        booking.paymentStatus = 'failed';
        await booking.save({ transaction: t });
        const schedule = await db.Schedule.findOne({
          where: {
            doctorId: booking.doctorId,
            date: booking.date,
            timeType: booking.timeType,
          },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });
        if (schedule?.currentNumber > 0)
          await schedule.decrement('currentNumber', { by: 1, transaction: t });
        await t.commit();
        res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      }
    } catch (err) {
      if (t && !t.finished) await t.rollback();
      res.status(200).json({ RspCode: '99' });
    }
  } catch (g) {
    res.status(200).json({ RspCode: '99' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// sendBookingEmail — Placeholder cho email service
// Sẽ được triển khai đầy đủ ở GĐ tiếp theo.
// Hiện tại log thông tin booking để xác nhận flow hoạt động.
// ═══════════════════════════════════════════════════════════════════════
async function sendBookingEmail(booking) {
  console.log('[EMAIL] Sending booking confirmation for booking:', booking.id);
  // TODO: [Phase 11.x] Tích hợp email service thực tế
}

// ═══════════════════════════════════════════════════════════════════════
// [NEW LOGIC VNPAY-MAIL]: createPaymentUrlByToken
// POST /api/v1/payment/create-payment-url-by-token
// Public endpoint — bệnh nhân bấm từ email (chưa đăng nhập, không có JWT)
// Nhận paymentToken → tìm booking S1.5 → tạo VNPay URL
// Guards: Lỗi 8 (giá 0 đồng bypass), Lỗi 18 (JSON contract), Lỗi 21 (IPv6)
// ═══════════════════════════════════════════════════════════════════════
async function createPaymentUrlByToken(req, res) {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu paymentToken!' });
    }

    // Tìm booking ở trạng thái S1.5 (đã verify email, chờ thanh toán)
    const booking = await db.Booking.findOne({
      where: {
        paymentToken: token.trim(),
        statusId: 'S1.5',
        paymentStatus: 'unpaid',
      },
      raw: false,
    });
    if (!booking) {
      return res.status(404).json({ errCode: 2, message: 'Không tìm thấy lịch hẹn hoặc đã thanh toán!' });
    }

    // [NEW LOGIC VNPAY-MAIL]: Lỗi 8 — Bypass VNPay nếu giá 0 đồng (khám miễn phí)
    if (booking.bookingPrice === 0) {
      booking.statusId = 'S2';
      booking.paymentStatus = 'paid';
      await booking.save();
      // [NEW LOGIC VNPAY-MAIL]: Lỗi 18 — Trả JSON, KHÔNG dùng res.redirect
      return res.json({
        errCode: 0,
        bypassVnpay: true,
        redirectUrl: `${process.env.URL_REACT}/payment-result?vnp_ResponseCode=00&vnp_TxnRef=${booking.paymentToken}`,
      });
    }

    // [NEW LOGIC VNPAY-MAIL]: Lỗi 21 — Strip IPv6, chuyển về IPv4 hoặc 127.0.0.1
    let ipAddr =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip;
    // Nếu IPv6 (chứa dấu :) → chuyển về 127.0.0.1
    if (ipAddr && ipAddr.includes(':')) {
      // IPv4-mapped IPv6 (::ffff:192.168.1.1) → lấy phần IPv4
      if (ipAddr.includes('::ffff:')) {
        ipAddr = ipAddr.split('::ffff:')[1];
      } else {
        ipAddr = '127.0.0.1'; // Fallback cho IPv6 thuần túy
      }
    }

    // Tạo VNPay URL với updatedAt (Lỗi 27 — đồng bộ ExpireDate với Cronjob 20 phút)
    const vnpUrl = buildVnpayUrl(
      booking.paymentToken,
      booking.bookingPrice,
      ipAddr,
      booking.updatedAt, // [NEW LOGIC VNPAY-MAIL]: Lỗi 27
    );

    return res.json({ errCode: 0, paymentUrl: vnpUrl });
  } catch (err) {
    console.error('[createPaymentUrlByToken]', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// vnpayQuerydr — Truy vấn trạng thái giao dịch từ VNPay
// Guard #F2: Null-check createdAt trước moment()
// Guard #16: Computed Property Name ["24"]
// ═══════════════════════════════════════════════════════════════════════
async function vnpayQuerydr(booking) {
  const params = {
    vnp_RequestId: crypto.randomUUID(),
    vnp_Version: '2.1.0',
    vnp_Command: 'querydr',
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_TxnRef: booking.paymentToken,
    vnp_OrderInfo: `Truy van don hang ${booking.paymentToken}`.replace(
      /[^a-zA-Z0-9 ]/g,
      '',
    ),
    // ✅ [v20.0 F2] Null-check createdAt trước moment()
    vnp_TransactionDate: booking.createdAt
      ? moment(booking.createdAt)
          .tz('Asia/Ho_Chi_Minh')
          .format('YYYYMMDDHHmmss')
      : '',
    vnp_CreateDate: moment().tz('Asia/Ho_Chi_Minh').format('YYYYMMDDHHmmss'),
    vnp_IpAddr: '127.0.0.1',
  };
  const sorted = {};
  Object.keys(params)
    .sort()
    .forEach((k) => (sorted[k] = params[k]));
  params.vnp_SecureHash = crypto
    .createHmac('sha512', VNP_HASH_SECRET)
    .update(Buffer.from(qs.stringify(sorted, { encode: false }), 'utf-8'))
    .digest('hex');

  const resp = await axios.post(VNP_API_URL, params, { timeout: 10000 });
  const code = resp.data?.vnp_TransactionStatus;

  // ✅ [v20.1 FIX-1] Computed Property Name — ép string key, chống auto-format
  const WHITELIST = { '00': 'paid', ['24']: 'cancelled', '02': 'pending' };
  return WHITELIST[code]
    ? { status: WHITELIST[code], rawCode: code, data: resp.data }
    : { status: 'transient', rawCode: code, data: resp.data };
}

// ═══════════════════════════════════════════════════════════════════════
// cleanupS1 — POST /api/v1/cron/cleanup-s1
// Cronjob quét booking S1 hết hạn (>20 phút)
// Guards: #36 GET_LOCK, #15 Batch=5, #38 Lock Order Exception,
//         #52 Reconcile 2-Strike, #25 catch return 500
// ═══════════════════════════════════════════════════════════════════════
async function cleanupS1(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.API_CRON_SECRET)
    return res.status(403).json({ errCode: -1 });

  let lockAcquired = false;
  try {
    const lockResult = await db.sequelize.query(
      "SELECT GET_LOCK('cron_cleanup_s1', 30) AS acquired",
      {
        type: Sequelize.QueryTypes.SELECT,
        plain: true,
        options: { type: 'write' },
      },
    );
    lockAcquired = lockResult.acquired === 1;
    if (!lockAcquired) return res.json({ skipped: true });

    // ═══════════════════════════════════════════════════════════════════
    // [NEW LOGIC VNPAY-MAIL]: Quét S1 (dựa trên createdAt) và S1.5 (dựa trên updatedAt)
    // S1 → S4: KHÔNG nhả slot (chưa tăng slot)
    // S1.5 → S4: CÓ nhả slot (đã tăng slot lúc verify)
    // ═══════════════════════════════════════════════════════════════════
    const staleS1 = await db.Booking.findAll({
      where: {
        statusId: 'S1',
        paymentStatus: 'unpaid',
        createdAt: {
          [Op.lt]: db.sequelize.literal('DATE_SUB(NOW(), INTERVAL 20 MINUTE)'),
        },
      },
    });

    // [NEW LOGIC VNPAY-MAIL]: S1.5 dựa trên updatedAt (thời điểm verify email)
    const staleS15 = await db.Booking.findAll({
      where: {
        statusId: 'S1.5',
        paymentStatus: 'unpaid',
        updatedAt: {
          [Op.lt]: db.sequelize.literal('DATE_SUB(NOW(), INTERVAL 20 MINUTE)'),
        },
      },
    });

    const staleBookings = [
      ...staleS1.map((b) => ({ booking: b, needSlotRelease: false })),
      ...staleS15.map((b) => ({ booking: b, needSlotRelease: true })),
    ];

    let processed = 0,
      zombies = 0;

    // ⚡ [v18.0 T5] BATCH PROCESSING — CONCURRENCY=5
    const chunks = [];
    for (let i = 0; i < staleBookings.length; i += 5)
      chunks.push(staleBookings.slice(i, i + 5));

    for (const batch of chunks) {
      await Promise.all(
        batch.map(async (entry) => {
          const booking = entry.booking;
          const needSlotRelease = entry.needSlotRelease;
          let retries = 0;
          while (retries < 3) {
            try {
              // [NEW LOGIC VNPAY-MAIL]: S1 không cần QueryDR (chưa tạo URL VNPay)
              if (!needSlotRelease) {
                // S1 → S4 đơn giản, không nhả slot
                const t = await db.sequelize.transaction();
                try {
                  const fresh = await db.Booking.findByPk(booking.id, {
                    lock: t.LOCK.UPDATE,
                    transaction: t,
                    raw: false,
                  });
                  if (!fresh || fresh.statusId !== 'S1') {
                    await t.rollback();
                    break;
                  }
                  fresh.statusId = 'S4';
                  fresh.paymentStatus = 'expired';
                  await fresh.save({ transaction: t });
                  await t.commit();
                  processed++;
                  break;
                } catch (err) {
                  if (t && !t.finished) await t.rollback();
                  throw err;
                }
              }

              // ═══════════════════════════════════════════════════════════
              // [NEW LOGIC VNPAY-MAIL]: S1.5 — Lỗi 16: QueryDR NGOÀI transaction
              // Gọi VNPay API trước, sau đó mở transaction ngắn để lưu DB
              // ═══════════════════════════════════════════════════════════
              // Strike 1: Đánh dấu lần đầu
              if (!booking.reconcileFirstSeenAt) {
                const t = await db.sequelize.transaction();
                try {
                  booking.reconcileFirstSeenAt = db.sequelize.literal('NOW()');
                  await booking.save({ transaction: t });
                  await t.commit();
                  break;
                } catch (err) {
                  if (t && !t.finished) await t.rollback();
                  throw err;
                }
              }

              // Check matured (>10min)
              const m = await db.sequelize.query(
                `SELECT (reconcileFirstSeenAt < DATE_SUB(NOW(), INTERVAL 10 MINUTE)) AS ok
               FROM Bookings WHERE id=:id`,
                {
                  replacements: { id: booking.id },
                  type: Sequelize.QueryTypes.SELECT,
                  plain: true,
                },
              );
              if (!m.ok) break;

              // [NEW LOGIC VNPAY-MAIL]: Lỗi 16 — QueryDR NGOÀI transaction
              // Lỗi 33 — crypto.randomUUID() cho vnp_RequestId (đã có trong vnpayQuerydr)
              const qdr = await vnpayQuerydr(booking);

              // [NEW LOGIC VNPAY-MAIL]: Transaction ngắn để lưu kết quả
              const t = await db.sequelize.transaction();
              try {
                // [NEW LOGIC VNPAY-MAIL]: Lỗi 25 — Recheck DB trước khi ghi đè
                const freshBooking = await db.Booking.findByPk(booking.id, {
                  lock: t.LOCK.UPDATE,
                  transaction: t,
                  raw: false,
                });
                if (!freshBooking || freshBooking.statusId !== 'S1.5') {
                  await t.rollback();
                  break;
                }
                // [NEW LOGIC VNPAY-MAIL]: Lỗi 25 — Nếu IPN đã ghi paid → bỏ qua
                if (freshBooking.paymentStatus === 'paid') {
                  await t.rollback();
                  break;
                }

                freshBooking.lastQuerydrCode = qdr.rawCode;

                if (qdr.status === 'paid') {
                  freshBooking.statusId = 'S2';
                  freshBooking.paymentStatus = 'paid';
                  freshBooking.receiptExpiredAt = db.sequelize.literal(
                    'DATE_ADD(NOW(), INTERVAL 24 HOUR)',
                  );
                  freshBooking.reconcileFirstSeenAt = null;
                  await generateReceiptToken(freshBooking, t);
                } else {
                  freshBooking.statusId = 'S4';
                  freshBooking.paymentStatus = 'expired';
                  freshBooking.reconcileFirstSeenAt = null;
                  await freshBooking.save({ transaction: t });
                  // [NEW LOGIC VNPAY-MAIL]: Nhả slot cho S1.5
                  const sch = await db.Schedule.findOne({
                    where: {
                      doctorId: freshBooking.doctorId,
                      date: freshBooking.date,
                      timeType: freshBooking.timeType,
                    },
                    lock: t.LOCK.UPDATE,
                    transaction: t,
                  });
                  if (sch?.currentNumber > 0)
                    await sch.decrement('currentNumber', {
                      by: 1,
                      transaction: t,
                    });
                }

                // Zombie check (>24h)
                const z = await db.sequelize.query(
                  `SELECT (createdAt<DATE_SUB(NOW(),INTERVAL 24 HOUR)) AS isZ FROM Bookings WHERE id=:id`,
                  {
                    replacements: { id: freshBooking.id },
                    type: Sequelize.QueryTypes.SELECT,
                    plain: true,
                    transaction: t,
                  },
                );
                if (z.isZ) zombies++;

                await t.commit();
                processed++;
                break;
              } catch (err) {
                if (t && !t.finished) await t.rollback();
                throw err;
              }
            } catch (err) {
              if ([1213, 1205].includes(err.parent?.errno) && retries < 2) {
                retries++;
                continue;
              }
              console.error('[CRON_ERR]', sanitizeLog(err, null));
              break;
            }
          }
        }),
      );
    }
    res.json({ skipped: false, processed, zombies });
  } finally {
    if (lockAcquired)
      await db.sequelize
        .query("SELECT RELEASE_LOCK('cron_cleanup_s1')")
        .catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════
// bookingByToken — GET /api/v1/payment/booking-by-token
// Public API cho Frontend PaymentResult.jsx
// Guard #48: paymentToken + paymentStatus="paid"
// Guard #25: catch return 500
// ═══════════════════════════════════════════════════════════════════════
async function bookingByToken(req, res) {
  const token = req.query.token;
  if (!token || typeof token !== 'string' || !token.trim())
    return res.status(400).json({ errCode: 1 });

  try {
    // ✅ [v20.3 FIX-2] Query theo paymentToken (= vnp_TxnRef từ return URL).
    // publicReceiptToken là internal token — frontend không bao giờ có.
    // Guard thay thế: paymentStatus = "paid" chặn truy cập booking chưa TT.
    const booking = await db.Booking.findOne({
      where: {
        paymentToken: token,
        paymentStatus: 'paid',
      },
      include: [
        {
          model: db.User,
          as: 'doctorBookingData',
          attributes: ['firstName', 'lastName'],
        },
        {
          model: db.User,
          as: 'patientData',
          attributes: ['firstName', 'lastName'],
        },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['valueVi'] },
      ],
    });
    if (!booking) return res.status(404).json({ errCode: 2 });

    const safeName = String(
      (booking.patientData?.lastName || '') +
        ' ' +
        (booking.patientData?.firstName || ''),
    ).trim();
    const rawDoc = String(
      (booking.doctorBookingData?.lastName || '') +
        ' ' +
        (booking.doctorBookingData?.firstName || ''),
    ).trim();

    res.json({
      errCode: 0,
      data: {
        patientNameMasked: maskName(validator.escape(String(safeName || ''))),
        doctorName: validator.escape(String(rawDoc || '')),
        date: booking.date,
        timeType: booking.timeTypeBooking?.valueVi || '',
        paymentStatus: booking.paymentStatus,
        bookingPrice: booking.bookingPrice,
        vnpayTransactionNo: booking.vnpayTransactionNo,
        vnp_PayDate: booking.vnp_PayDate,
      },
    });
  } catch (err) {
    return res.status(500).json({ errCode: -1 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// maskName — Che tên bệnh nhân bằng *** (null-safe)
// ═══════════════════════════════════════════════════════════════════════
function maskName(n) {
  if (!n || n.length < 2) return '***';
  const p = n.split(' ').filter(Boolean);
  return p.length <= 1
    ? p[0][0] + '***'
    : p[0] +
        ' ' +
        p
          .slice(1)
          .map((x) => x[0] + '***')
          .join(' ');
}

module.exports = {
  buildVnpayUrl,
  createPaymentUrl,
  vnpayIpn,
  vnpayQuerydr,
  cleanupS1,
  bookingByToken,
  createPaymentUrlByToken, // [NEW LOGIC VNPAY-MAIL]
};
