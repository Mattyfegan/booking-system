// Pure dashboard math: no I/O, so the revenue rules are unit-testable without a database.
// Revenue here is bookings x list price. There is no cost data in the schema, so this is gross revenue, not profit.
import type { BookingStatus, Prisma } from "@booking/db";
import { isValidDateString, localToUtc } from "./availability";

export type DashboardService = {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
};

export type ServiceBookingCounts = Record<string, number>;

export type ServiceStat = {
  serviceId: string;
  name: string;
  isActive: boolean;
  priceCents: number;
  pastCount: number;
  pastRevenueCents: number;
  upcomingCount: number;
  upcomingRevenueCents: number;
};

export type DashboardTotals = {
  pastCount: number;
  pastRevenueCents: number;
  upcomingCount: number;
  upcomingRevenueCents: number;
};

// pastCounts: bookings that already started and were not cancelled or no-shows.
// upcomingCounts: confirmed bookings that start in the future.
export function summarizeServices(
  services: DashboardService[],
  pastCounts: ServiceBookingCounts,
  upcomingCounts: ServiceBookingCounts,
): { rows: ServiceStat[]; totals: DashboardTotals } {
  const rows: ServiceStat[] = services.map((s) => {
    const pastCount = pastCounts[s.id] ?? 0;
    const upcomingCount = upcomingCounts[s.id] ?? 0;
    return {
      serviceId: s.id,
      name: s.name,
      isActive: s.isActive,
      priceCents: s.priceCents,
      pastCount,
      pastRevenueCents: pastCount * s.priceCents,
      upcomingCount,
      upcomingRevenueCents: upcomingCount * s.priceCents,
    };
  });

  const totals = rows.reduce<DashboardTotals>(
    (acc, r) => ({
      pastCount: acc.pastCount + r.pastCount,
      pastRevenueCents: acc.pastRevenueCents + r.pastRevenueCents,
      upcomingCount: acc.upcomingCount + r.upcomingCount,
      upcomingRevenueCents: acc.upcomingRevenueCents + r.upcomingRevenueCents,
    }),
    { pastCount: 0, pastRevenueCents: 0, upcomingCount: 0, upcomingRevenueCents: 0 },
  );

  return { rows, totals };
}

// Converts Prisma groupBy output ({ serviceId, _count: { _all } }[]) into a lookup table.
export function toCountMap(groups: { serviceId: string; _count: { _all: number } }[]): ServiceBookingCounts {
  return Object.fromEntries(groups.map((g) => [g.serviceId, g._count._all]));
}

// Converts a price typed in dollars (e.g. "25.5") to integer cents. Returns null for invalid input.
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

// "YYYY-MM-DD" for the calendar day after `date`. Works on the date string alone, so DST never shifts it.
export function nextDateString(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Half-open UTC range [gte, lt) covering one local calendar day in the business timezone.
export function dayRange(date: string, timezone: string): { gte: Date; lt: Date } {
  return { gte: localToUtc(date, "00:00", timezone), lt: localToUtc(nextDateString(date), "00:00", timezone) };
}

export const BOOKING_STATUS_FILTERS = ["ALL", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;
export type BookingStatusFilter = (typeof BOOKING_STATUS_FILTERS)[number];

export type BookingFilters = {
  status: BookingStatusFilter;
  serviceId: string; // "" means every service
  from: string; // "" or YYYY-MM-DD, inclusive, in the business timezone
  to: string; // "" or YYYY-MM-DD, inclusive, in the business timezone
};

export const EMPTY_BOOKING_FILTERS: BookingFilters = { status: "ALL", serviceId: "", from: "", to: "" };

// Reads filter values from the URL. Unknown statuses and malformed dates are dropped rather than failing the page.
// A reversed date range is swapped so the filter still means something.
export function parseBookingFilters(raw: {
  status?: string;
  service?: string;
  from?: string;
  to?: string;
}): BookingFilters {
  const status = (BOOKING_STATUS_FILTERS as readonly string[]).includes(raw.status ?? "")
    ? (raw.status as BookingStatusFilter)
    : "ALL";
  const from = raw.from && isValidDateString(raw.from) ? raw.from : "";
  const to = raw.to && isValidDateString(raw.to) ? raw.to : "";
  const ordered = from && to && from > to ? { from: to, to: from } : { from, to };
  return { status, serviceId: raw.service ?? "", ...ordered };
}

// Prisma where-clause for the filters. Returns an empty object when nothing is set.
export function bookingFilterWhere(filters: BookingFilters, timezone: string): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (filters.status !== "ALL") where.status = filters.status as BookingStatus;
  if (filters.serviceId) where.serviceId = filters.serviceId;
  if (filters.from || filters.to) {
    where.startAt = {
      ...(filters.from && { gte: localToUtc(filters.from, "00:00", timezone) }),
      ...(filters.to && { lt: dayRange(filters.to, timezone).lt }),
    };
  }
  return where;
}
