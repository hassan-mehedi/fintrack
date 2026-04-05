import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterMs: number;
}

type RateLimitChecker = (key: string) => RateLimitResult | Promise<RateLimitResult>;

// ---------------------------------------------------------------------------
// Upstash Redis (used when UPSTASH_REDIS_REST_URL is set)
// ---------------------------------------------------------------------------

const useUpstash = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redis: Redis | null = null;
if (useUpstash) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

// ---------------------------------------------------------------------------
// In-memory fallback (dev / single-instance)
// ---------------------------------------------------------------------------

type RateLimitEntry = { timestamps: number[] };

function createInMemoryLimiter({ maxRequests, windowMs }: RateLimitOptions) {
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

// ---------------------------------------------------------------------------
// Factory — picks Upstash or in-memory automatically
// ---------------------------------------------------------------------------

function createUpstashLimiter(
  prefix: string,
  { maxRequests, windowMs }: RateLimitOptions,
) {
  const limiter = new Ratelimit({
    redis: redis!,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs}ms`),
    prefix: `ratelimit:${prefix}`,
  });

  return async function checkLimit(key: string): Promise<RateLimitResult> {
    const result = await limiter.limit(key);
    return {
      success: result.success,
      remaining: result.remaining,
      retryAfterMs: result.success ? 0 : result.reset - Date.now(),
    };
  };
}

export function createRateLimiter(
  opts: RateLimitOptions,
  prefix = "default",
): RateLimitChecker {
  if (useUpstash) {
    return createUpstashLimiter(prefix, opts);
  }
  return createInMemoryLimiter(opts);
}

// ---------------------------------------------------------------------------
// Shared limiters
// ---------------------------------------------------------------------------

export const chatLimiter = createRateLimiter(
  { maxRequests: 20, windowMs: 60_000 },
  "chat",
);

export const transcribeLimiter = createRateLimiter(
  { maxRequests: 10, windowMs: 60_000 },
  "transcribe",
);

export const translateLimiter = createRateLimiter(
  { maxRequests: 10, windowMs: 60_000 },
  "translate",
);

export const registerLimiter = createRateLimiter(
  { maxRequests: 5, windowMs: 60_000 },
  "register",
);

export const loginLimiter = createRateLimiter(
  { maxRequests: 10, windowMs: 60_000 },
  "login",
);

// ---------------------------------------------------------------------------
// Shared constants (also used client-side)
// ---------------------------------------------------------------------------

export const LIMITS = {
  maxMessageLength: 500,
  maxVoiceDurationSec: 30,
  chatMaxPerMin: 20,
  transcribeMaxPerMin: 10,
  translateMaxPerMin: 10,
  maxAudioSizeBytes: 5 * 1024 * 1024, // 5MB
  maxJsonBodyBytes: 100 * 1024, // 100KB — generous for chat messages / form data
} as const;

// ---------------------------------------------------------------------------
// Request body size guard
// ---------------------------------------------------------------------------

export function isBodyTooLarge(
  req: Request,
  maxBytes = LIMITS.maxJsonBodyBytes,
): boolean {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return true;
  }
  return false;
}
