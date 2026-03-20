type RateLimitEntry = { timestamps: number[] };

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter({ maxRequests, windowMs }: RateLimitOptions) {
  const map = new Map<string, RateLimitEntry>();

  // Cleanup stale entries every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of map) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) map.delete(key);
    }
  }, 60_000).unref?.();

  return function checkLimit(key: string): RateLimitResult {
    const now = Date.now();
    const entry = map.get(key) ?? { timestamps: [] };

    // Slide window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      const oldest = entry.timestamps[0]!;
      return {
        success: false,
        remaining: 0,
        retryAfterMs: windowMs - (now - oldest),
      };
    }

    entry.timestamps.push(now);
    map.set(key, entry);

    return {
      success: true,
      remaining: maxRequests - entry.timestamps.length,
      retryAfterMs: 0,
    };
  };
}

// --- Shared limiters ---

export const chatLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
});

export const transcribeLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

export const translateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

// --- Shared constants (also used client-side) ---

export const LIMITS = {
  maxMessageLength: 500,
  maxVoiceDurationSec: 30,
  chatMaxPerMin: 20,
  transcribeMaxPerMin: 10,
  translateMaxPerMin: 10,
  maxAudioSizeBytes: 5 * 1024 * 1024, // 5MB
} as const;
