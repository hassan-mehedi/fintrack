import { Redis } from "@upstash/redis";

const redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new Redis({
              url: process.env.UPSTASH_REDIS_REST_URL,
              token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null;

const memoryStore = new Map<string, number>();

function pruneMemoryStore() {
    const now = Date.now();
    for (const [jti, expiresAt] of memoryStore) {
        if (expiresAt <= now) memoryStore.delete(jti);
    }
}

export async function revokeToken(jti: string, expSeconds: number): Promise<void> {
    const ttl = Math.max(expSeconds - Math.floor(Date.now() / 1000), 1);
    if (redis) {
        await redis.set(`revoked:${jti}`, "1", { ex: ttl });
        return;
    }
    pruneMemoryStore();
    memoryStore.set(jti, Date.now() + ttl * 1000);
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
    if (redis) {
        return (await redis.get(`revoked:${jti}`)) !== null;
    }
    const expiresAt = memoryStore.get(jti);
    return expiresAt !== undefined && expiresAt > Date.now();
}
