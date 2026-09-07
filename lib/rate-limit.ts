// Fixed-window rate limiter on top of Redis. Takes the client as a
// parameter (rather than importing the lib/redis.ts singleton directly) so
// it's trivially testable with ioredis-mock — no module-mocking needed.
//
// Fails open on any Redis error (logs, then allows the request) rather than
// failing closed. This matches how the rest of this app already treats
// Redis as a fast-path, not a hard dependency (see the session-stats/
// broadcast routes' graceful degradation) — a Redis blip should not be able
// to take down login for real candidates.
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

// Best-effort client IP behind Vercel's proxy — the first entry in
// x-forwarded-for is the original client. Never trust this for anything
// beyond rate-limiting (it's attacker-controllable if the proxy doesn't
// strip/rewrite it), and always fall back to a shared bucket rather than
// throwing when it's missing.
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function checkRateLimit(
  redis: RedisLike,
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // Only the request that created the key sets its expiry — avoids
      // resetting the window's TTL on every subsequent hit.
      await redis.expire(redisKey, windowSec);
    }
    return { allowed: count <= limit, remaining: Math.max(limit - count, 0) };
  } catch (err) {
    console.error(`Rate limit check failed for "${key}", failing open:`, err);
    return { allowed: true, remaining: limit };
  }
}
