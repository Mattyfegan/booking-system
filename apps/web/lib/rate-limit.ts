import { HttpError } from "./authz";

// Fixed-window rate limiter kept in process memory. It protects a single-instance deployment.
// Limits are per process, so a horizontally scaled deployment would need a shared store (e.g. Redis).

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  // Account creation: a handful per IP per hour.
  register: { limit: 5, windowMs: 60 * 60_000 },
  // Credential sign-in: counted per email, so guessing one account's password is throttled.
  signIn: { limit: 10, windowMs: 15 * 60_000 },
  // Booking creation: per signed-in customer.
  booking: { limit: 10, windowMs: 60_000 },
  // Public slot lookup: per IP, generous enough for a calendar UI but stops bulk scraping.
  availability: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

// Drops expired windows so the map cannot grow without bound.
function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Counts one hit against `key`. Returns the seconds to wait when the limit is exceeded, or 0 when allowed.
export function consumeRateLimit(key: string, rule: RateLimitRule, now = Date.now()): number {
  sweep(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return 0;
  }
  current.count += 1;
  if (current.count <= rule.limit) return 0;
  return Math.ceil((current.resetAt - now) / 1000);
}

// Throws a 429 HttpError when the caller is over the limit. Works with errorResponse in route handlers.
export function assertWithinRateLimit(key: string, rule: RateLimitRule, now = Date.now()): void {
  const retryAfter = consumeRateLimit(key, rule, now);
  if (retryAfter > 0) {
    throw new HttpError(429, `Too many requests. Try again in ${retryAfter} seconds.`);
  }
}

// Best-effort client IP. Trusts the first X-Forwarded-For hop, which is only safe behind a proxy that sets it.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

// Test helper: clears all counters.
export function resetRateLimits(): void {
  buckets.clear();
}
