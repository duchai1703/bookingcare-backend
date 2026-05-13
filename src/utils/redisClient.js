// Mock redisClient.js
const store = new Map();

const redisClient = {
  async set(key, value, mode, duration, nx) {
    if (nx === 'NX' && store.has(key)) return null;
    store.set(key, value);
    if (mode === 'EX' && duration) {
      setTimeout(() => store.delete(key), duration * 1000);
    }
    return 'OK';
  },
  async get(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async del(key) {
    store.delete(key);
    return 1;
  }
};

module.exports = redisClient;
