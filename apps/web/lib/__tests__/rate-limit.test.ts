import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "@/lib/authz";
import { assertWithinRateLimit, clientIp, consumeRateLimit, resetRateLimits } from "@/lib/rate-limit";

const rule = { limit: 3, windowMs: 60_000 };

beforeEach(() => resetRateLimits());

describe("consumeRateLimit", () => {
  it("allows up to the limit, then reports the seconds until the window resets", () => {
    const t0 = 1_000_000;
    expect(consumeRateLimit("k", rule, t0)).toBe(0);
    expect(consumeRateLimit("k", rule, t0 + 1_000)).toBe(0);
    expect(consumeRateLimit("k", rule, t0 + 2_000)).toBe(0);
    expect(consumeRateLimit("k", rule, t0 + 3_000)).toBe(57);
  });

  it("opens a fresh window once the previous one has expired", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) consumeRateLimit("k", rule, t0);
    expect(consumeRateLimit("k", rule, t0 + rule.windowMs)).toBe(0);
  });

  it("counts keys independently", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) consumeRateLimit("a", rule, t0);
    expect(consumeRateLimit("a", rule, t0)).toBeGreaterThan(0);
    expect(consumeRateLimit("b", rule, t0)).toBe(0);
  });
});

describe("assertWithinRateLimit", () => {
  it("throws a 429 HttpError once the limit is exceeded", () => {
    for (let i = 0; i < 3; i++) assertWithinRateLimit("x", rule);
    try {
      assertWithinRateLimit("x", rule);
      expect.unreachable("expected a 429");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(429);
    }
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For hop, or 'unknown' when absent", () => {
    const withHeader = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
    expect(clientIp(withHeader)).toBe("203.0.113.5");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
