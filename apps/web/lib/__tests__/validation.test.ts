import { describe, expect, it } from "vitest";
import {
  createServiceSchema,
  isValidTimeZone,
  registerSchema,
  updateBusinessSchema,
  updateServiceSchema,
} from "../validation";

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("registerSchema", () => {
  it("normalises email and has no role field", () => {
    const parsed = registerSchema.parse({ name: "A", email: " Use@Example.com ", password: "longenough" });
    expect(parsed.email).toBe("use@example.com");
    expect("role" in parsed).toBe(false);
  });

  it("strips any role sent by the client, so ADMIN self-registration is impossible", () => {
    const parsed = registerSchema.parse({ name: "A", email: "a@b.co", password: "longenough", role: "ADMIN" });
    expect("role" in parsed).toBe(false);
  });

  it("rejects passwords over bcrypt's 72-byte limit", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
});

describe("updateBusinessSchema", () => {
  it("rejects an unknown timezone and accepts a valid one", () => {
    expect(updateBusinessSchema.safeParse({ timezone: "Nowhere/City" }).success).toBe(false);
    expect(updateBusinessSchema.safeParse({ timezone: "Europe/London" }).success).toBe(true);
  });
});

describe("service schemas", () => {
  const valid = { name: "Haircut", durationMin: 30, priceCents: 3500 };

  it("applies bufferMin default of 0", () => {
    expect(createServiceSchema.parse(valid).bufferMin).toBe(0);
  });

  it("rejects non-integer or out-of-range durations and prices", () => {
    expect(createServiceSchema.safeParse({ ...valid, durationMin: 2 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...valid, durationMin: 30.5 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...valid, priceCents: -1 }).success).toBe(false);
  });

  it("allows partial updates including isActive", () => {
    expect(updateServiceSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});
