import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Store a revoked jti in Redis with TTL equal to remaining token lifetime.
// No-op when Redis is unavailable (dev without Upstash).
export async function revokeToken(jti: string, expSeconds: number): Promise<void> {
  if (!redis) return;
  const ttl = Math.max(expSeconds - Math.floor(Date.now() / 1000), 1);
  await redis.set(`revoked:${jti}`, "1", { ex: ttl });
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  if (!redis) return false;
  const result = await redis.get(`revoked:${jti}`);
  return result !== null;
}
