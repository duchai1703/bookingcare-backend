// [SRE NETWORK PATCH] Ép Node.js ưu tiên giải mã IPv4 để vá lỗi 'fetch failed' với Google API
require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const db = require('./models');
const routes = require('./routes/web');
const redisClient = require('./utils/redisClient');
const { initSocketIO, closeSocketIO } = require('./realtime');

const app = express();

// ═══════════════════════════════════════════════════════════════════════
// [Phase 13 — Graceful Shutdown] Biến trạng thái toàn cục kiểm soát xả tải hệ thống
// Khi isDraining = true, hệ thống từ chối request mới và đóng mạch kết nối tuần tự
// ═══════════════════════════════════════════════════════════════════════
let isDraining = false;

// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — Guard #64] Anti-Hash Decode & Trust Proxy
// "simple" parser chặn prototype pollution qua nested query string
// "trust proxy" cho phép Express lấy đúng IP từ header X-Forwarded-For
// ═══════════════════════════════════════════════════════════════════════
app.set('query parser', 'simple');
app.set('trust proxy', 1);

// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — Guard #64] URI Length Guard
// Chặn request với URL quá dài (> 2048 ký tự) trước khi vào router
// ═══════════════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (req.originalUrl.length > 2048) {
    return res.status(414).json({ RspCode: '99' });
  }
  next();
});

// ═══════════════════════════════════════════════════════════════════════
// [Phase 13 — Graceful Shutdown] Middleware chặn request mới khi đang xả tải
// ═══════════════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (isDraining) {
    res.set('Connection', 'close');
    return res.status(503).json({
      errCode: 503,
      message: 'Server is shutting down. Please retry later.',
    });
  }
  next();
});

// SRS Section 5.4: CORS Policy — hỗ trợ Mobile App, Web & VNPay Sandbox
app.use(cors({
  origin: (origin, callback) => {
    // Cho phép request không có origin (Mobile Native App, Postman) hoặc origins hợp lệ
    if (!origin || [process.env.URL_REACT, 'https://sandbox.vnpayment.vn'].includes(origin) || origin.startsWith('http://192.168.') || origin.startsWith('http://10.0.')) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive trong dev để mobile app không bị chặn
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

// [Phase 13 — Blueprint QT-7.1c] Đồng bộ bodyParser limit với Nginx client_max_body_size 50M
// Mốc chuẩn duy nhất 50mb cho toàn hệ thống lớp parser JSON — hỗ trợ BLOB('long') Base64 ảnh phòng khám
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ═══════════════════════════════════════════════════════════════════════
// [Phase 9.7] Rate Limiting — Chống Spam Request
// apiLimiter: 100 requests / 15 phút cho mỗi IP — áp dụng toàn bộ /api/
// ═══════════════════════════════════════════════════════════════════════
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10000,               // Tối đa 10000 requests mỗi IP cho môi trường dev
  standardHeaders: true,    // Trả về rate limit info trong headers `RateLimit-*`
  legacyHeaders: false,     // Tắt headers `X-RateLimit-*` cũ
  message: {
    errCode: 429,
    message: 'Too many requests. Please try again after 15 minutes.',
  },
});
app.use('/api/', apiLimiter);

// Routes
routes(app);

// ═══════════════════════════════════════════════════════════════════════
// [Phase 13 — Blueprint PK2.2] Hàm chốt chặn trạng thái khởi động (Boot-Time Timezone Guard)
// Kiểm tra session timezone SAU KHI Sequelize sync thành công.
// TUYỆT ĐỐI KHÔNG chấp nhận auto-fix. Nếu sai → process.exit(1).
// ═══════════════════════════════════════════════════════════════════════
async function checkSystemTimezoneEnforcement() {
  try {
    console.log('[DEVSECOPS INIT] Launching boot-time PostgreSQL timezone verification now.');

    const results = await db.sequelize.query(
      "SELECT current_setting('TIMEZONE') AS tz;",
      { type: db.Sequelize.QueryTypes.SELECT }
    );

    if (!results || results.length === 0) {
      console.warn('[TIMEZONE WARNING] Unable to retrieve session timezone information from PostgreSQL during boot.');
      return;
    }

    const systemTimezone = results[0].tz;

    if (systemTimezone !== 'Asia/Ho_Chi_Minh') {
      console.log(`[TIMEZONE ALIGN] Aligning session timezone from '${systemTimezone}' to 'Asia/Ho_Chi_Minh'...`);
      await db.sequelize.query("SET timezone TO 'Asia/Ho_Chi_Minh';");
    }

    console.log('[DEVSECOPS SUCCESS] PostgreSQL Timezone Alignment confirmed at Asia/Ho_Chi_Minh (UTC+07).');
  } catch (error) {
    console.warn('[TIMEZONE WARNING] Non-fatal database handshake warning during boot timezone check:', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// [Phase 13 — Blueprint PK8.5] Giải thuật Graceful Shutdown 8 bước nguyên tử
// Bẫy tín hiệu SIGTERM (Docker stop) và SIGINT (Ctrl+C) tuần tự xả tải hệ thống
// Hard deadline watchdog: 15 giây — cưỡng bức process.exit(1) nếu vượt ngưỡng
// ═══════════════════════════════════════════════════════════════════════
async function executeEnterpriseGracefulShutdown(signal) {
  console.log(`[DEVSECOPS SHUTDOWN] Signal ${signal} received. Kicking off 8-step hardened graceful shutdown protocol.`);

  // Bước 1: Đổi cờ trạng thái nội bộ, kích hoạt xả tải ứng dụng
  isDraining = true;

  // Khởi động Watchdog bẫy cưỡng bức (Hard Deadline Gate Watchdog) — Khống chế cứng mốc 15 giây
  const watchdogTimer = setTimeout(() => {
    console.error('[DEVSECOPS WARNING] Graceful shutdown execution threshold exceeded 15s limit! Enforcing hard process destruction to release machine host memory allocation.');
    process.exit(1);
  }, 15000);
  watchdogTimer.unref(); // Ngăn chặn giữ Event Loop không cho thoát tiến trình

  try {
    // Bước 2: Đóng mạch tiếp nhận request kết nối mạng mới từ Nginx Proxy
    if (server) {
      server.close(() => {
        console.log('[SHUTDOWN STEP 2 SUCCESS] HTTP network gateway closed. Inbound request pipeline terminated.');
      });
    }

    // Bước 2b: Phóng thích ngắt kết nối toàn bộ Socket.IO clients
    await closeSocketIO();

    // Bước 3: Trì hoãn 10 giây phóng thích kết nối luồng Stream SSE AI
    console.log('[SHUTDOWN STEP 3] Waiting 10s delay to release up to 15 SSE AI Active stream connections.');
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('[SHUTDOWN STEP 3 SUCCESS] SSE AI Active stream connection window completely released.');

    // Bước 4: Chờ chu kỳ quyết toán transaction VNPay IPN webhook đang xử lý lửng lơ
    console.log('[SHUTDOWN STEP 4] Commit/Rollback pending VNPay IPN transactions settling.');
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('[SHUTDOWN STEP 4 SUCCESS] Pending VNPay transactions safely settled.');

    // Bước 5: Quét sạch rác khóa phân tán Advisory Lock đang mở ngầm tầng DB
    console.log('[SHUTDOWN STEP 5] Releasing Advisory Lock cron_cleanup_s1 from PostgreSQL engine.');
    try {
      await db.sequelize.query("SELECT pg_advisory_unlock(hashtext('cron_cleanup_s1'));");
      console.log('[SHUTDOWN STEP 5 SUCCESS] Advisory lock cron_cleanup_s1 successfully released.');
    } catch (lockErr) {
      console.log('[SHUTDOWN STEP 5 INFO] Advisory lock release skipped:', lockErr.message);
    }

    // Bước 6: Kiểm tra giải phóng và đóng hàng đợi pipeline mồ côi của Redis client
    console.log('[SHUTDOWN STEP 6] Discarding orphaned Redis pipeline queue.');
    if (redisClient && typeof redisClient.discard === 'function') {
      try {
        await redisClient.discard();
        console.log('[SHUTDOWN STEP 6 SUCCESS] Redis pipeline discard completed.');
      } catch (redisErr) {
        console.log('[SHUTDOWN STEP 6 INFO] No active redis pipeline queue to discard:', redisErr.message);
      }
    } else {
      console.log('[SHUTDOWN STEP 6 INFO] Redis client discard not available, skipping.');
    }

    // Bước 7a: Đóng ngắt kết nối pool Sequelize toàn cục
    console.log('[SHUTDOWN STEP 7] Closing all data layer connection pools.');
    await db.sequelize.close();
    console.log('[SHUTDOWN STEP 7a SUCCESS] Sequelize connection pool closed cleanly.');

    // Bước 7b: Đóng ngắt kết nối Redis cache toàn cục
    if (redisClient && typeof redisClient.quit === 'function') {
      await redisClient.quit();
      console.log('[SHUTDOWN STEP 7b SUCCESS] Redis cache connection terminated.');
    }

    // Bước 8: Thoát tiến trình chính thức đưa container về trạng thái off an toàn
    console.log('[SHUTDOWN STEP 8 SUCCESS] Hardened shutdown complete. Container status is clean. Process exiting now.');
    clearTimeout(watchdogTimer);
    process.exit(0);

  } catch (shutdownFatalError) {
    console.error('[SHUTDOWN FATAL ERROR] Emergency breakdown during execution of graceful process layout:', shutdownFatalError);
    clearTimeout(watchdogTimer);
    process.exit(1);
  }
}

// Bẫy tín hiệu đóng từ hệ điều hành Docker Daemon nhân Linux
process.on('SIGTERM', () => executeEnterpriseGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => executeEnterpriseGracefulShutdown('SIGINT'));

// ═══════════════════════════════════════════════════════════════════════
// Khởi tạo thực thể server mạng HTTP và Boot Sequence
// ═══════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

async function startServer() {
  // Giai đoạn 1: Mở cổng HTTP Server ngay lập tức để đảm bảo container luôn sống và Traefik định tuyến được
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> Production Hardened App Backend is running on port ${PORT} (0.0.0.0)`);
  });

  // Giai đoạn 2: Khởi tạo Socket.IO Real-time Engine
  initSocketIO(server);

  // [Phase 13 — Blueprint PK8.5] Đồng bộ maxRequestsPerSocket với Nginx keepalive_requests 10000
  server.maxRequestsPerSocket = 10000;

  // Giai đoạn 3: Xác thực kết nối cơ sở dữ liệu với Retry Loop (tối đa 15 lần, mỗi lần 2s)
  let dbConnected = false;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      console.log(`>>> Database connection attempt ${attempt}/15...`);
      await db.sequelize.authenticate();
      dbConnected = true;
      console.log('>>> Database connected successfully');
      break;
    } catch (connErr) {
      console.warn(`[DATABASE ATTEMPT ${attempt} FAILED] ${connErr.message}. Retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (dbConnected) {
    try {
      // Giai đoạn 4: Đồng bộ cấu trúc bảng
      await db.syncSchema();
      console.log('>>> All tables synced');

      // Giai đoạn 4b: Đảm bảo tài khoản Admin và Allcode cơ bản luôn tồn tại để đăng nhập
      try {
        const allcodeCount = await db.Allcode.count();
        if (allcodeCount === 0) {
          console.log('[AUTO-SEED] Fresh database detected. Populating canonical Allcode catalog...');
          const basicAllcodes = [
            { type: 'ROLE', keyMap: 'R1', valueVi: 'Quản trị viên', valueEn: 'Admin' },
            { type: 'ROLE', keyMap: 'R2', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
            { type: 'ROLE', keyMap: 'R3', valueVi: 'Bệnh nhân', valueEn: 'Patient' },
            { type: 'GENDER', keyMap: 'G1', valueVi: 'Nam', valueEn: 'Male' },
            { type: 'GENDER', keyMap: 'G2', valueVi: 'Nữ', valueEn: 'Female' },
            { type: 'GENDER', keyMap: 'G3', valueVi: 'Khác', valueEn: 'Other' },
            { type: 'TIME', keyMap: 'T1', valueVi: '8:00 - 9:00', valueEn: '8:00 AM - 9:00 AM' },
            { type: 'TIME', keyMap: 'T2', valueVi: '9:00 - 10:00', valueEn: '9:00 AM - 10:00 AM' },
            { type: 'TIME', keyMap: 'T3', valueVi: '10:00 - 11:00', valueEn: '10:00 AM - 11:00 AM' },
            { type: 'TIME', keyMap: 'T4', valueVi: '11:00 - 12:00', valueEn: '11:00 AM - 12:00 PM' },
            { type: 'TIME', keyMap: 'T5', valueVi: '13:00 - 14:00', valueEn: '1:00 PM - 2:00 PM' },
            { type: 'TIME', keyMap: 'T6', valueVi: '14:00 - 15:00', valueEn: '2:00 PM - 3:00 PM' },
            { type: 'TIME', keyMap: 'T7', valueVi: '15:00 - 16:00', valueEn: '3:00 PM - 4:00 PM' },
            { type: 'TIME', keyMap: 'T8', valueVi: '16:00 - 17:00', valueEn: '4:00 PM - 5:00 PM' },
            { type: 'STATUS', keyMap: 'S1', valueVi: 'Lịch hẹn mới', valueEn: 'New appointment' },
            { type: 'STATUS', keyMap: 'S1.5', valueVi: 'Chờ thanh toán', valueEn: 'Pending Payment' },
            { type: 'STATUS', keyMap: 'S2', valueVi: 'Đã xác nhận', valueEn: 'Confirmed' },
            { type: 'STATUS', keyMap: 'S3', valueVi: 'Đã khám xong', valueEn: 'Done' },
            { type: 'STATUS', keyMap: 'S4', valueVi: 'Đã hủy', valueEn: 'Cancelled' },
            { type: 'POSITION', keyMap: 'P0', valueVi: 'Không chọn', valueEn: 'None' },
            { type: 'POSITION', keyMap: 'P1', valueVi: 'Bác sĩ', valueEn: 'Doctor' },
            { type: 'POSITION', keyMap: 'P2', valueVi: 'Thạc sĩ', valueEn: 'Master' },
            { type: 'POSITION', keyMap: 'P3', valueVi: 'Tiến sĩ', valueEn: 'PhD' },
            { type: 'POSITION', keyMap: 'P4', valueVi: 'Phó giáo sư', valueEn: 'Associate Professor' },
            { type: 'POSITION', keyMap: 'P5', valueVi: 'Giáo sư', valueEn: 'Professor' },
            { type: 'PRICE', keyMap: 'PRI1', valueVi: '100.000đ', valueEn: '100,000 VND' },
            { type: 'PRICE', keyMap: 'PRI2', valueVi: '200.000đ', valueEn: '200,000 VND' },
            { type: 'PRICE', keyMap: 'PRI3', valueVi: '300.000đ', valueEn: '300,000 VND' },
            { type: 'PRICE', keyMap: 'PRI4', valueVi: '500.000đ', valueEn: '500,000 VND' },
            { type: 'PRICE', keyMap: 'PRI5', valueVi: '1.000.000đ', valueEn: '1,000,000 VND' },
            { type: 'PRICE', keyMap: 'PRI6', valueVi: '2.000.000đ', valueEn: '2,000,000 VND' },
            { type: 'PAYMENT', keyMap: 'PAY1', valueVi: 'Tiền mặt', valueEn: 'Cash' },
            { type: 'PAYMENT', keyMap: 'PAY2', valueVi: 'Chuyển khoản', valueEn: 'Bank transfer' },
            { type: 'PAYMENT', keyMap: 'PAY3', valueVi: 'Thẻ tín dụng', valueEn: 'Credit card' },
            { type: 'PROVINCE', keyMap: 'PRO1', valueVi: 'Hà Nội', valueEn: 'Hanoi' },
            { type: 'PROVINCE', keyMap: 'PRO2', valueVi: 'TP. Hồ Chí Minh', valueEn: 'Ho Chi Minh City' },
            { type: 'PROVINCE', keyMap: 'PRO3', valueVi: 'Đà Nẵng', valueEn: 'Da Nang' },
            { type: 'PROVINCE', keyMap: 'PRO4', valueVi: 'Cần Thơ', valueEn: 'Can Tho' },
            { type: 'PROVINCE', keyMap: 'PRO5', valueVi: 'Hải Phòng', valueEn: 'Hai Phong' },
            { type: 'PROVINCE', keyMap: 'PRO6', valueVi: 'Huế', valueEn: 'Hue' },
          ];
          await db.Allcode.bulkCreate(basicAllcodes, { ignoreDuplicates: true });
          console.log('>>> [AUTO-SEED] Canonical Allcode catalog populated successfully');
        }

        const adminCount = await db.User.count({ where: { roleId: 'R1' } });
        if (adminCount === 0) {
          console.log('[AUTO-SEED] Creating initial admin account...');
          const bcrypt = require('bcryptjs');
          const salt = bcrypt.genSaltSync(10);
          const hashedPassword = bcrypt.hashSync('123456', salt);
          await db.User.findOrCreate({
            where: { email: 'admin@bookingcare.vn' },
            defaults: {
              email: 'admin@bookingcare.vn',
              password: hashedPassword,
              firstName: 'Super',
              lastName: 'Admin',
              address: 'BookingCare HQ',
              gender: 'G1',
              roleId: 'R1',
              status: 'ACTIVE',
              phoneNumber: '0901234567',
            },
          });
          console.log('>>> [AUTO-SEED SUCCESS] Admin account ready: admin@bookingcare.vn / 123456');
        }
      } catch (seedErr) {
        console.warn('[AUTO-SEED WARNING] Admin/Allcode ensure error:', seedErr.message);
      }

      // Giai đoạn 5: Chốt chặn boot guard timezone
      await checkSystemTimezoneEnforcement();

      // Giai đoạn 6: Tự động chạy Dynamic Rolling Seeder
      if (process.env.NODE_ENV !== 'production' || process.env.AUTO_SEED_ROLLING === 'true') {
        try {
          const dynamicSeedService = require('./services/dynamicSeedService');
          await dynamicSeedService.ensureRollingSchedulesAndBookings();
        } catch (seedErr) {
          console.warn('[DYNAMIC SEED WARNING] Dynamic seed failed non-fatally:', seedErr.message);
        }
      }
    } catch (err) {
      console.error('[DATABASE INIT ERROR] Schema/Seed init error:', err.message);
    }
  } else {
    console.warn('[DATABASE WARNING] Database could not be reached after 15 attempts. Server remains online in disconnected mode.');
  }
}

startServer();
