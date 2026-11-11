import { describe, expect, it } from "vitest";
import { centsToDollarsInput, dollarsToCents, summarizeServices, toCountMap } from "../dashboard";

const services = [
  { id: "cut", name: "Cut", priceCents: 2500, isActive: true },
  { id: "beard", name: "Beard", priceCents: 1000, isActive: true },
  { id: "old", name: "Old", priceCents: 500, isActive: false },
];

describe("summarizeServices", () => {
  it("multiplies bookings by the service price for past and upcoming separately", () => {
    const { rows, totals } = summarizeServices(services, { cut: 3, beard: 2 }, { cut: 1 });

    expect(rows[0]).toMatchObject({ serviceId: "cut", pastCount: 3, pastRevenueCents: 7500, upcomingCount: 1, upcomingRevenueCents: 2500 });
    expect(rows[1]).toMatchObject({ serviceId: "beard", pastCount: 2, pastRevenueCents: 2000, upcomingCount: 0, upcomingRevenueCents: 0 });
    expect(totals).toEqual({ pastCount: 5, pastRevenueCents: 9500, upcomingCount: 1, upcomingRevenueCents: 2500 });
  });

  it("keeps inactive services with zero counts so they still appear in the table", () => {
    const { rows } = summarizeServices(services, {}, {});
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ serviceId: "old", isActive: false, pastCount: 0, pastRevenueCents: 0 });
  });

  it("returns zero totals when there are no services", () => {
    expect(summarizeServices([], {}, {}).totals).toEqual({
      pastCount: 0,
      pastRevenueCents: 0,
      upcomingCount: 0,
      upcomingRevenueCents: 0,
    });
  });
});

describe("toCountMap", () => {
  it("maps Prisma groupBy rows to a serviceId lookup", () => {
    expect(toCountMap([{ serviceId: "cut", _count: { _all: 4 } }])).toEqual({ cut: 4 });
  });
});

describe("price parsing", () => {
  it("converts dollar input to integer cents", () => {
    expect(dollarsToCents("25")).toBe(2500);
    expect(dollarsToCents("25.5")).toBe(2550);
    expect(dollarsToCents(" 0.99 ")).toBe(99);
  });

  it("rejects negative, malformed, or over-precise input", () => {
    expect(dollarsToCents("-1")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("1.999")).toBeNull();
  });

  it("formats cents back to a two-decimal input value", () => {
    expect(centsToDollarsInput(2550)).toBe("25.50");
    expect(centsToDollarsInput(0)).toBe("0.00");
  });
});
