import { describe, expect, it } from "vitest";
import {
  createBusinessSchema,
  createServiceSchema,
  isValidTimeZone,
  registerSchema,
  slugify,
  updateServiceSchema,
} from "../validation";

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("  Riverside Barbers & Co. ")).toBe("riverside-barbers-co");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
    expect(slugify("!!!")).toBe("");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("registerSchema", () => {
  it("defaults role to CUSTOMER and normalises email", () => {
    const parsed = registerSchema.parse({ name: "A", email: " Use@Example.com ", password: "longenough" });
    expect(parsed.role).toBe("CUSTOMER");
    expect(parsed.email).toBe("use@example.com");
  });

  it("rejects ADMIN self-registration", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "longenough", role: "ADMIN" }).success).toBe(
      false,
    );
  });

  it("rejects passwords over bcrypt's 72-byte limit", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
});

describe("createBusinessSchema", () => {
  it("rejects an unknown timezone", () => {
    expect(createBusinessSchema.safeParse({ name: "X", timezone: "Nowhere/City" }).success).toBe(false);
  });

  it("rejects slugs with double hyphens and accepts clean slugs", () => {
    expect(createBusinessSchema.safeParse({ name: "X", slug: "bad--slug" }).success).toBe(false);
    expect(createBusinessSchema.safeParse({ name: "X", slug: "good-slug" }).success).toBe(true);
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
