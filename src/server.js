require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const db = require('./models');
const routes = require('./routes/web');

const app = express();

// SRS Section 5.4: CORS Policy
app.use(cors({
  origin: process.env.URL_REACT,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

// ✅ [FIX-IMAGE] DS-01 FIX v2: Tăng limit global lên 8mb
// TRƯỚC ĐÂY: 100kb global → jsonLarge (6mb) ở route KHÔNG có tác dụng
//   vì Express parse body ở middleware ĐẦU TIÊN (jsonSmall 100kb)
//   → body bị reject trước khi đến route-level jsonLarge
// SAU KHI FIX: 8mb global — đủ cho ảnh base64 (5MB ảnh ≈ 6.67MB base64)
app.use(bodyParser.json({ limit: '8mb' }));
app.use(bodyParser.urlencoded({ limit: '8mb', extended: true }));


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

// Connect DB, sync tables, start server
const PORT = process.env.PORT || 8080;

db.sequelize.authenticate()
  .then(() => {
    console.log('>>> Database connected');
    return db.sequelize.sync();
  })
  .then(async () => {
    console.log('>>> All tables synced');

    // ═══════════════════════════════════════════════════════════════════════
    // [Phase 10 — 🔒 HARD-FAIL BOOT CHECK — Zero Trust cho Dữ liệu Y tế]
    // Kiểm tra session timezone SAU KHI Sequelize sync thành công.
    // TUYỆT ĐỐI KHÔNG chấp nhận auto-fix. Nếu sai → process.exit(1).
    // ═══════════════════════════════════════════════════════════════════════
    const [tzResult] = await db.sequelize.query("SELECT @@session.time_zone AS tz");
    const sessionTz = tzResult[0]?.tz;
    if (sessionTz !== '+07:00') {
      console.error(`\n❌ [FATAL — TIMEZONE MISMATCH]`);
      console.error(`   Session timezone = '${sessionTz}', expected '+07:00'.`);
      console.error(`   → Kiểm tra cấu hình models/index.js: timezone + hooks.afterConnect`);
      console.error(`   → Server DỪNG NGAY để bảo vệ tính toàn vẹn dữ liệu y tế.\n`);
      process.exit(1); // ← Dừng server, TUYỆT ĐỐI KHÔNG auto-fix
    }
    console.log('✅ [TIMEZONE OK] Session timezone = +07:00');

    app.listen(PORT, () => {
      console.log(`>>> Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => console.error('>>> DB Error:', err));
