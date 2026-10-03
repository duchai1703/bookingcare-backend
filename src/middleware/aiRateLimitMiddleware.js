'use strict';

// ═══════════════════════════════════════════════════════════════════════
// AI Rate Limit Middleware — Per-User Sliding Window & Stream Mutex
// ═══════════════════════════════════════════════════════════════════════

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 25; // 25 requests per 10 min per user

// In-memory sliding window store: userId -> Array of timestamps
const userRequestTimestamps = new Map();

// Active streams store: userId -> active stream flag & start timestamp
const activeUserStreams = new Map();

// Periodic cleanup of stale sliding windows every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of userRequestTimestamps.entries()) {
    const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);
    if (validTimestamps.length === 0) {
      userRequestTimestamps.delete(userId);
    } else {
      userRequestTimestamps.set(userId, validTimestamps);
    }
  }

  // Auto-expire zombie active streams older than 90 seconds
  for (const [userId, meta] of activeUserStreams.entries()) {
    if (now - meta.startTime > 90000) {
      activeUserStreams.delete(userId);
    }
  }
}, 5 * 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Middleware: Rate limit per authenticated user
 */
function aiRateLimiter(req, res, next) {
  const userId = req.user?.id;
  if (!userId) {
    // If not authenticated, let auth middleware handle or reject
    return res.status(401).json({
      errCode: 'AI_UNAUTHORIZED',
      message: 'Chưa đăng nhập.',
    });
  }

  const now = Date.now();

  // 1. Concurrent Stream Protection (Max 1 active stream per user)
  if (activeUserStreams.has(userId)) {
    return res.status(429).json({
      errCode: 'AI_STREAM_BUSY',
      message: 'Bạn đang có một phiên trò chuyện đang xử lý. Vui lòng đợi trong giây lát.',
    });
  }

  // 2. Sliding Window Request Limit
  const timestamps = userRequestTimestamps.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    userRequestTimestamps.set(userId, validTimestamps);
    return res.status(429).json({
      errCode: 'AI_RATE_LIMITED',
      message: 'Bạn đã sử dụng AI quá nhanh. Vui lòng thử lại sau.',
    });
  }

  // Register request
  validTimestamps.push(now);
  userRequestTimestamps.set(userId, validTimestamps);

  // Acquire user stream lock
  activeUserStreams.set(userId, { startTime: now });

  // Hook into response finish / close to release stream mutex automatically
  let released = false;
  const releaseLock = () => {
    if (!released) {
      released = true;
      activeUserStreams.delete(userId);
    }
  };

  res.on('finish', releaseLock);
  res.on('close', releaseLock);
  res.on('error', releaseLock);

  // Also attach release callback to req for manual release if needed
  req.releaseAiStreamLock = releaseLock;

  next();
}

/**
 * Helper to explicitly release stream lock
 */
function releaseUserStream(userId) {
  if (userId) {
    activeUserStreams.delete(userId);
  }
}

/**
 * Helper to reset rate limits (useful for testing)
 */
function resetRateLimits() {
  userRequestTimestamps.clear();
  activeUserStreams.clear();
}

module.exports = {
  aiRateLimiter,
  releaseUserStream,
  resetRateLimits,
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
};
