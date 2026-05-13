// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — Guard #63] Backpressure Gate — Chống quá tải Server
// Giới hạn số request đang xử lý đồng thời. Nếu vượt MAX_PENDING,
// trả 503 + Retry-After để client biết chờ rồi thử lại.
// ═══════════════════════════════════════════════════════════════════════

let pendingRequests = 0;
const MAX_PENDING = 50;

function backpressureGate(req, res, next) {
  if (pendingRequests >= MAX_PENDING) {
    res.set('Retry-After', '5');
    return res.status(503).json({ errCode: -4 });
  }

  pendingRequests++;

  res.on('close', () => {
    pendingRequests--;
  });

  next();
}

module.exports = backpressureGate;
