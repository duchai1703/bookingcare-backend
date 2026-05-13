// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.2] generateReceiptToken.js
// Tạo publicReceiptToken cho booking đã thanh toán thành công.
// Ưu tiên UUID (3 lần thử). Fallback: HMAC-SHA256 nếu UUID collision.
// ═══════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

async function generateReceiptToken(booking, transaction) {
  // ── Vòng lặp thử UUID (tối đa 3 lần) ──
  for (let i = 0; i < 3; i++) {
    try {
      const token = crypto.randomUUID();
      booking.publicReceiptToken = token;
      await booking.save({ transaction });
      return token;
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
      if (i === 2) break;
    }
  }

  // ── Fallback: HMAC-SHA256 khi UUID collision 3 lần ──
  let nonce;
  try {
    nonce = crypto.randomBytes(16).toString('hex');
  } catch (e) {
    throw new Error('ENTROPY_FAIL');
  }

  const payload = `${booking.id}:${booking.vnp_TransactionNo}:${Date.now()}:${nonce}`;
  const token = crypto
    .createHmac('sha256', process.env.RECEIPT_FALLBACK_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 64);

  booking.publicReceiptToken = token;
  await booking.save({ transaction });
  return token;
}

module.exports = generateReceiptToken;
