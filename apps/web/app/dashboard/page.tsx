import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { BookingStatus, prisma, type Prisma } from "@booking/db";
import { Badge, Button, Card, EmptyState } from "@booking/ui";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  History,
  LayoutDashboard,
  Scissors,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AvailabilityEditor, type ManagedOverride, type ManagedRule } from "@/components/dashboard/availability-editor";
import { BookingOutcomeButtons } from "@/components/dashboard/booking-outcome-buttons";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { ServiceManager, type ManagedService } from "@/components/dashboard/service-manager";
import { Pagination } from "@/components/pagination";
import { SortableHead, type ColumnDef } from "@/components/sort-header";
import { SignOutButton } from "@/components/sign-out-button";
import { PageShell } from "@/components/skeletons";
import {
  tableBodyClass,
  tableCardClass,
  tableClass,
  tableRowClass,
  tableScrollClass,
} from "@/components/table-styles";
import { getBusiness } from "@/lib/business";
import {
  bookingFilterWhere,
  dayRange,
  EMPTY_BOOKING_FILTERS,
  BOOKING_STATUS_FILTERS,
  parseBookingFilters,
  summarizeServices,
  toCountMap,
  type BookingFilters,
  type BookingStatusFilter,
} from "@/lib/dashboard";
import { formatDayInZone, formatPrice, formatTimeInZone } from "@/lib/format";
import {
  PAGE_SIZE,
  buildHref,
  clampPage,
  firstParam,
  parseListState,
  sectionParams,
  type ListState,
  type SearchParams,
} from "@/lib/table-state";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const SORT_KEYS = ["date", "service", "customer", "status"] as const;
type BookingSortKey = (typeof SORT_KEYS)[number];

const DEFAULTS = {
  upcoming: { sort: "date", dir: "asc" },
  history: { sort: "date", dir: "desc" },
} as const;

const STATUS_BADGE: Record<BookingStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  NO_SHOW: { label: "No show", tone: "warning" },
};

const STATUS_FILTER_LABEL: Record<BookingStatusFilter, string> = {
  ALL: "All statuses",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No show",
};

const bookingInclude = {
  service: { select: { name: true } },
  customer: { select: { name: true, email: true } },
} as const;

// Everything the dashboard reads from the URL. Each section keeps its own paging and sorting, and every
// link carries the full state so moving through one table does not reset the others.
type DashboardState = {
  upcoming: ListState<BookingSortKey>;
  history: ListState<BookingSortKey>;
  revenue: ListState<RevenueSortKey>;
  filters: BookingFilters;
};

function filterParams(f: BookingFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== "ALL") out.status = f.status;
  if (f.serviceId) out.service = f.serviceId;
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  return out;
}

function hrefFor(base: DashboardState, patch: Partial<DashboardState> = {}): string {
  const s = { ...base, ...patch };
  return buildHref(
    "/dashboard",
    sectionParams("upcoming", s.upcoming),
    sectionParams("history", s.history),
    sectionParams("revenue", s.revenue),
    filterParams(s.filters),
  );
}

// Revenue rows are sorted in place (there are only a few services), by the same URL-driven rules.
const REVENUE_KEYS = ["service", "price", "past", "revenue", "upcoming", "booked"] as const;
type RevenueSortKey = (typeof REVENUE_KEYS)[number];

const REVENUE_COLUMNS: ColumnDef<RevenueSortKey>[] = [
  { label: "Service", key: "service" },
  { label: "Price", key: "price", align: "right" },
  { label: "Past", key: "past", align: "right" },
  { label: "Revenue", key: "revenue", align: "right" },
  { label: "Upcoming", key: "upcoming", align: "right" },
  { label: "Booked value", key: "booked", align: "right" },
];

type ServiceStatRow = ReturnType<typeof summarizeServices>["rows"][number];

const REVENUE_VALUE: Record<Exclude<RevenueSortKey, "service">, (r: ServiceStatRow) => number> = {
  price: (r) => r.priceCents,
  past: (r) => r.pastCount,
  revenue: (r) => r.pastRevenueCents,
  upcoming: (r) => r.upcomingCount,
  booked: (r) => r.upcomingRevenueCents,
};

function sortRevenue(rows: ServiceStatRow[], state: ListState<RevenueSortKey>): ServiceStatRow[] {
  const sign = state.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (state.sort === "service") return sign * a.name.localeCompare(b.name);
    const value = REVENUE_VALUE[state.sort];
    return sign * (value(a) - value(b)) || a.name.localeCompare(b.name);
  });
}

function orderFor(state: ListState<BookingSortKey>): Prisma.BookingOrderByWithRelationInput[] {
  const d = state.dir;
  let primary: Prisma.BookingOrderByWithRelationInput;
  switch (state.sort) {
    case "service":
      primary = { service: { name: d } };
      break;
    case "customer":
      primary = { customer: { name: d } };
      break;
    case "status":
      primary = { status: d };
      break;
    case "date":
      primary = { startAt: d };
      break;
  }
  return [primary, { id: "asc" }];
}

// Owner/admin overview. Access is enforced by app/dashboard/layout.tsx.
export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const business = await getBusiness();
  const tz = business.timezone;
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const todayRange = dayRange(today, tz);

  const filters = parseBookingFilters({
    status: firstParam(searchParams.status),
    service: firstParam(searchParams.service),
    from: firstParam(searchParams.from),
    to: firstParam(searchParams.to),
  });

  // Upcoming: confirmed and not yet started. History: everything else, including cancelled future bookings.
  const upcomingWhere: Prisma.BookingWhereInput = { status: BookingStatus.CONFIRMED, startAt: { gte: now } };
  const historyBase: Prisma.BookingWhereInput = {
    OR: [{ status: { not: BookingStatus.CONFIRMED } }, { startAt: { lt: now } }],
  };
  const historyWhere: Prisma.BookingWhereInput = { AND: [historyBase, bookingFilterWhere(filters, tz)] };
  const todayWhere: Prisma.BookingWhereInput = { startAt: { gte: todayRange.gte, lt: todayRange.lt } };
  const overrideFrom = new Date(`${today}T00:00:00.000Z`);

  const [services, rules, overrideRows, todayRows, upcomingTotal, historyTotal, pastGroups, upcomingGroups] =
    await Promise.all([
      prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.availabilityRule.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
      prisma.availabilityOverride.findMany({ where: { date: { gte: overrideFrom } }, orderBy: { date: "asc" } }),
      prisma.booking.findMany({ where: todayWhere, include: bookingInclude, orderBy: { startAt: "asc" } }),
      prisma.booking.count({ where: upcomingWhere }),
      prisma.booking.count({ where: historyWhere }),
      // Past revenue counts bookings that happened: confirmed-but-past or completed. Cancelled and no-shows are excluded.
      prisma.booking.groupBy({
        by: ["serviceId"],
        where: { status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] }, startAt: { lt: now } },
        _count: { _all: true },
      }),
      prisma.booking.groupBy({
        by: ["serviceId"],
        where: { status: BookingStatus.CONFIRMED, startAt: { gte: now } },
        _count: { _all: true },
      }),
    ]);

  const overrideCounts = await Promise.all(
    overrideRows.map((o) => {
      const date = o.date.toISOString().slice(0, 10);
      return prisma.booking.count({ where: { status: BookingStatus.CONFIRMED, ...dayRange(date, tz) } });
    }),
  );

  const upcoming = clampPage(parseListState(searchParams, "upcoming", SORT_KEYS, DEFAULTS.upcoming), upcomingTotal);
  const revenue = parseListState(searchParams, "revenue", REVENUE_KEYS, { sort: "service", dir: "asc" });
  const history = clampPage(parseListState(searchParams, "history", SORT_KEYS, DEFAULTS.history), historyTotal);
  const state: DashboardState = { upcoming, history, revenue, filters };

  const [upcomingRows, historyRows] = await Promise.all([
    prisma.booking.findMany({
      where: upcomingWhere,
      include: bookingInclude,
      orderBy: orderFor(upcoming),
      skip: (upcoming.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.booking.findMany({
      where: historyWhere,
      include: bookingInclude,
      orderBy: orderFor(history),
      skip: (history.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const { rows: serviceStats, totals } = summarizeServices(
    services,
    toCountMap(pastGroups),
    toCountMap(upcomingGroups),
  );

  const managed: ManagedService[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    bufferMin: s.bufferMin,
    isActive: s.isActive,
  }));

  const managedRules: ManagedRule[] = rules.map((r) => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  const managedOverrides: ManagedOverride[] = overrideRows.map((o, i) => ({
    id: o.id,
    date: o.date.toISOString().slice(0, 10),
    isClosed: o.isClosed,
    startTime: o.startTime,
    endTime: o.endTime,
    bookingCount: overrideCounts[i],
  }));

  const nowMs = now.getTime();
  const filtersActive = filters.status !== "ALL" || filters.serviceId !== "" || filters.from !== "" || filters.to !== "";

  return (
    <PageShell>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <span aria-hidden="true" className="h-1 w-12 rounded-full bg-brand-gold" />
          <h1 className="text-3xl font-bold text-brand-green">Dashboard</h1>
          <p className="text-gray-600">
            {business.name} &middot; times in {tz}
          </p>
        </div>
        <SignOutButton />
      </header>

      <section aria-labelledby="today-heading" className="mb-10 flex flex-col gap-3">
        <SectionHeading
          id="today-heading"
          icon={CalendarDays}
          title={`Today's schedule`}
          count={todayRows.length}
        />
        <p className="text-sm text-gray-600">{formatDayInZone(now, tz)}</p>
        {todayRows.length === 0 ? (
          <EmptyState title="No bookings today" description="Bookings for today will appear here, in time order." />
        ) : (
          <div className={tableCardClass}>
            <div className={tableScrollClass}>
              <table className={tableClass}>
                <caption className="sr-only">Today&apos;s bookings</caption>
                <thead className="border-b border-gray-200 bg-brand-gold-soft text-left text-xs font-semibold uppercase tracking-wide text-brand-green">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Time
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Service
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Customer
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={tableBodyClass}>
                  {todayRows.map((b) => {
                    const badge = bookingBadge(b.status, b.startAt, nowMs);
                    return (
                      <tr key={b.id} className={tableRowClass}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-brand-green">
                          {formatTimeInZone(b.startAt, tz)}
                        </td>
                        <td className="px-4 py-3">{b.service.name}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span>{b.customer.name ?? "Customer"}</span>
                            <span className="text-xs text-gray-500">{b.customer.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <BookingActions booking={b} timezone={tz} nowMs={nowMs} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="stats-heading" className="mb-10 flex flex-col gap-3">
        <SectionHeading id="stats-heading" icon={LayoutDashboard} title="Overview" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={CalendarClock} label="Upcoming bookings" value={String(totals.upcomingCount)} />
          <StatCard icon={History} label="Past bookings" value={String(totals.pastCount)} />
          <StatCard
            icon={Banknote}
            label="Revenue to date"
            value={formatPrice(totals.pastRevenueCents)}
            hint="Past bookings x list price"
          />
          <StatCard
            icon={Wallet}
            label="Booked revenue"
            value={formatPrice(totals.upcomingRevenueCents)}
            hint="Upcoming bookings x list price"
          />
        </div>
      </section>

      <section aria-labelledby="revenue-heading" className="mb-10 flex flex-col gap-3">
        <SectionHeading id="revenue-heading" icon={TrendingUp} title="Revenue by service" />
        <p className="text-xs text-gray-500">
          Gross revenue only: the schema has no cost data, so this is not profit. Cancelled and no-show bookings are
          excluded.
        </p>
        <div className={tableCardClass}>
          <div className={tableScrollClass}>
            <table className={tableClass}>
              <caption className="sr-only">Revenue by service</caption>
              <SortableHead columns={REVENUE_COLUMNS} state={revenue} hrefFor={(next) => hrefFor(state, { revenue: next })} />
              <tbody className={tableBodyClass}>
                {sortRevenue(serviceStats, revenue).map((r) => (
                  <tr key={r.serviceId} className={`${tableRowClass} ${r.isActive ? "" : "text-gray-400"}`}>
                    <td className="px-4 py-3 font-medium text-brand-green">
                      <span className="flex items-center gap-2">
                        {r.name}
                        {!r.isActive && <Badge>Inactive</Badge>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatPrice(r.priceCents)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{r.pastCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {formatPrice(r.pastRevenueCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{r.upcomingCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {formatPrice(r.upcomingRevenueCents)}
                    </td>
                  </tr>
                ))}
                {serviceStats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-600">
                      No services yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="services-heading" className="mb-10 flex flex-col gap-3">
        <SectionHeading id="services-heading" icon={Scissors} title="Services" count={managed.length} />
        <ServiceManager services={managed} />
      </section>

      <section aria-labelledby="availability-heading" className="mb-10 flex flex-col gap-3">
        <SectionHeading id="availability-heading" icon={CalendarClock} title="Availability" />
        <AvailabilityEditor rules={managedRules} overrides={managedOverrides} today={today} timezone={tz} />
      </section>

      <section aria-labelledby="upcoming-heading" className="mb-10 flex flex-col gap-3">
        <SectionHeading id="upcoming-heading" icon={CalendarClock} title="Upcoming bookings" count={upcomingTotal} />
        {upcomingTotal === 0 ? (
          <EmptyState title="No upcoming bookings" description="New customer bookings will appear here." />
        ) : (
          <BookingTable
            caption="Upcoming bookings"
            pagerLabel="Upcoming bookings pages"
            state={upcoming}
            total={upcomingTotal}
            rows={upcomingRows}
            timezone={tz}
            nowMs={nowMs}
            hrefFor={(next) => hrefFor(state, { upcoming: next })}
            pageHref={(p) => hrefFor(state, { upcoming: { ...upcoming, page: p } })}
          />
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <SectionHeading id="history-heading" icon={History} title="Booking history" count={historyTotal} />
        <BookingFilterForm filters={filters} services={managed} state={state} />
        {historyTotal === 0 ? (
          <EmptyState
            title={filtersActive ? "No bookings match these filters" : "No past bookings yet"}
            description={filtersActive ? "Try a wider date range or clear the filters." : undefined}
          />
        ) : (
          <BookingTable
            caption="Booking history"
            pagerLabel="History pages"
            state={history}
            total={historyTotal}
            rows={historyRows}
            timezone={tz}
            nowMs={nowMs}
            hrefFor={(next) => hrefFor(state, { history: next })}
            pageHref={(p) => hrefFor(state, { history: { ...history, page: p } })}
          />
        )}
      </section>
    </PageShell>
  );
}

// A confirmed booking whose start has passed has happened but was never marked completed.
function bookingBadge(status: BookingStatus, startAt: Date, nowMs: number) {
  if (status === BookingStatus.CONFIRMED && startAt.getTime() < nowMs) {
    return { label: "Past", tone: "neutral" as const };
  }
  return STATUS_BADGE[status];
}

// Plain GET form: submitting it reloads the page with filter params in the URL, so the filters are shareable
// and work without JavaScript. Other sections' paging and sorting are carried over as hidden inputs.
function BookingFilterForm({
  filters,
  services,
  state,
}: {
  filters: BookingFilters;
  services: ManagedService[];
  state: DashboardState;
}) {
  const carried = {
    ...sectionParams("upcoming", state.upcoming),
    ...sectionParams("revenue", state.revenue),
  };
  const clearHref = hrefFor(state, { filters: EMPTY_BOOKING_FILTERS, history: { ...state.history, page: 1 } });
  const labelClass = "text-sm font-medium text-gray-800";
  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black";

  return (
    <form
      method="get"
      action="/dashboard"
      aria-label="Filter booking history"
      className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
    >
      {Object.entries(carried).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-status" className={labelClass}>
          Status
        </label>
        <select id="filter-status" name="status" defaultValue={filters.status} className={inputClass}>
          {BOOKING_STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-service" className={labelClass}>
          Service
        </label>
        <select id="filter-service" name="service" defaultValue={filters.serviceId} className={inputClass}>
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-from" className={labelClass}>
          From
        </label>
        <input id="filter-from" type="date" name="from" defaultValue={filters.from} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-to" className={labelClass}>
          To
        </label>
        <input id="filter-to" type="date" name="to" defaultValue={filters.to} className={inputClass} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="brand" size="md">
          Apply
        </Button>
        <Link href={clearHref} className="text-sm font-medium text-brand-green underline-offset-2 hover:underline">
          Clear
        </Link>
      </div>
    </form>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  count,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold text-brand-green">
        <Icon size={20} aria-hidden="true" />
        {title}
      </h2>
      {count !== undefined && <span className="text-sm text-gray-500">{count} total</span>}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-gold-soft text-brand-green">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-2xl font-semibold text-brand-green">{value}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </Card>
  );
}

type DashboardBooking = {
  id: string;
  status: BookingStatus;
  startAt: Date;
  service: { name: string };
  customer: { name: string | null; email: string };
};

// What an owner can do with one booking, by its state:
//  - confirmed and not started: cancel
//  - confirmed and started: record completed or no-show (it was never marked, so it shows as "Past")
//  - anything else: nothing, the outcome is final
function BookingActions({ booking, timezone, nowMs }: { booking: DashboardBooking; timezone: string; nowMs: number }) {
  if (booking.status !== BookingStatus.CONFIRMED) return null;
  const summary = `${booking.service.name} for ${booking.customer.name ?? booking.customer.email} on ${formatDayInZone(booking.startAt, timezone)} at ${formatTimeInZone(booking.startAt, timezone)}`;
  if (booking.startAt.getTime() >= nowMs) {
    return <CancelBookingButton bookingId={booking.id} summary={summary} />;
  }
  return <BookingOutcomeButtons bookingId={booking.id} summary={summary} />;
}

function BookingTable({
  caption,
  pagerLabel,
  state,
  total,
  rows,
  timezone,
  nowMs,
  hrefFor,
  pageHref,
}: {
  caption: string;
  pagerLabel: string;
  state: ListState<BookingSortKey>;
  total: number;
  rows: DashboardBooking[];
  timezone: string;
  nowMs: number;
  hrefFor: (next: ListState<BookingSortKey>) => string;
  pageHref: (page: number) => string;
}) {
  const columns: ColumnDef<BookingSortKey>[] = [
    { label: "When", key: "date" },
    { label: "Service", key: "service" },
    { label: "Customer", key: "customer" },
    { label: "Status", key: "status" },
    { label: "", key: null },
  ];

  return (
    <div className={tableCardClass}>
      <div className={tableScrollClass}>
        <table className={tableClass}>
          <caption className="sr-only">{caption}</caption>
          <SortableHead columns={columns} state={state} hrefFor={hrefFor} />
          <tbody className={tableBodyClass}>
            {rows.map((b) => {
              const badge = bookingBadge(b.status, b.startAt, nowMs);
              return (
                <tr key={b.id} className={tableRowClass}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDayInZone(b.startAt, timezone)} &middot; {formatTimeInZone(b.startAt, timezone)}
                  </td>
                  <td className="px-4 py-3 font-medium text-brand-green">{b.service.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span>{b.customer.name ?? "Customer"}</span>
                      <span className="text-xs text-gray-500">{b.customer.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <BookingActions booking={b} timezone={timezone} nowMs={nowMs} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination label={pagerLabel} page={state.page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} />
    </div>
  );
}
