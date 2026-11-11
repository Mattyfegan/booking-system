// Pure dashboard math: no I/O, so the revenue rules are unit-testable without a database.
// Revenue here is bookings x list price. There is no cost data in the schema, so this is gross revenue, not profit.

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
