// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.2] manualAuthGuard.js
// Middleware bảo vệ các endpoint nội bộ (cron, admin script).
// Kiểm tra header x-cron-secret khớp với API_CRON_SECRET.
// Trả 403 nếu không khớp — chặn truy cập trái phép từ bên ngoài.
// ═══════════════════════════════════════════════════════════════════════

function manualAuthGuard(req, res, next) {
  const cronSecret = req.headers['x-cron-secret'];

  if (!cronSecret || cronSecret !== process.env.API_CRON_SECRET) {
    return res.status(403).json({ errCode: -1 });
  }

  next();
}

module.exports = manualAuthGuard;
