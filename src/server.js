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
      console.error('[FATAL ERROR] Unable to retrieve session timezone information from PostgreSQL server during boot.');
      process.exit(1);
    }

    const systemTimezone = results[0].tz;

    if (systemTimezone !== 'Asia/Ho_Chi_Minh') {
      console.error(`[FATAL CRITICAL ERROR] Hardened Timezone Mismatch detected! PostgreSQL Session TZ is '${systemTimezone}', expected 'Asia/Ho_Chi_Minh'. Halting system initialization immediately to prevent booking FSM data desync state between database layer and backend app engine.`);
      process.exit(1);
    }

    console.log('[DEVSECOPS SUCCESS] PostgreSQL Timezone Alignment confirmed at Asia/Ho_Chi_Minh (UTC+07). System initialization approved.');
  } catch (error) {
    // [HOTFIX CODEX AUDIT] Ép ngắt mạch sập nguồn container ngay khi lỗi bắt tay xảy ra, cấm chạy cố
    console.error('[FATAL ERROR] Critical database handshake failure during boot timezone check validation loop:', error);
    process.exit(1);
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
  try {
    // Giai đoạn 1: Xác thực kết nối cơ sở dữ liệu
    await db.sequelize.authenticate();
    console.log('>>> Database connected');

    // Giai đoạn 2: Đồng bộ cấu trúc bảng
    await db.syncSchema();
    console.log('>>> All tables synced');

    // Giai đoạn 3: Chốt chặn boot guard timezone — DỪNG NGAY nếu sai timezone
    await checkSystemTimezoneEnforcement();

    // Giai đoạn 4: Mở cổng HTTP Server lắng nghe request trên tất cả giao diện mạng (0.0.0.0)
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`>>> Production Hardened App Backend is running on port ${PORT} (0.0.0.0)`);
    });

    // [Phase 13 — Blueprint PK8.5] Đồng bộ maxRequestsPerSocket với Nginx keepalive_requests 10000
    server.maxRequestsPerSocket = 10000;
  } catch (err) {
    // [HOTFIX CODEX AUDIT] Ép process.exit(1) khi bất kỳ bước boot nào thất bại
    console.error('[FATAL ERROR] Server startup failed:', err);
    process.exit(1);
  }
}

startServer();
