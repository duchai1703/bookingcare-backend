// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.2] idempotencyStore.js
// Atomic idempotency store dùng Redis.
// setInProgress: NX lock 30s — chặn duplicate request.
// setDone: Lưu kết quả với TTL 24h.
// get: Trả null | "IN_PROGRESS" | parsed JSON.
// delete: Xóa key im lặng (silent fail).
// ═══════════════════════════════════════════════════════════════════════
const redis = require('./redisClient');

const idempotencyStore = {
  async setInProgress(key) {
    const result = await redis.set(key, 'IN_PROGRESS', 'EX', 30, 'NX');
    return result === 'OK';
  },

  async setDone(key, payload) {
    await redis.set(key, JSON.stringify(payload), 'EX', 86400);
  },

  async get(key) {
    const raw = await redis.get(key);
    if (raw === null) return null;
    if (raw === 'IN_PROGRESS') return 'IN_PROGRESS';
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },

  async delete(key) {
    try {
      await redis.del(key);
    } catch (e) {
      /* silent — không để lỗi Redis lan ra caller */
    }
  },
};

module.exports = idempotencyStore;
