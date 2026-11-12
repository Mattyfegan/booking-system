import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingStatus, prisma, type Prisma } from "@booking/db";
import { Badge, Card, EmptyState } from "@booking/ui";
import {
  Banknote,
  CalendarClock,
  History,
  LayoutDashboard,
  Scissors,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { ServiceManager, type ManagedService } from "@/components/dashboard/service-manager";
import { Pagination } from "@/components/pagination";
import { SortableHead, StaticHeader, type ColumnDef } from "@/components/sort-header";
import { SignOutButton } from "@/components/sign-out-button";
import { PageShell } from "@/components/skeletons";
import {
  tableBodyClass,
  tableCardClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
  tableScrollClass,
} from "@/components/table-styles";
import { getBusiness } from "@/lib/business";
import { summarizeServices, toCountMap } from "@/lib/dashboard";
import { formatDayInZone, formatPrice, formatTimeInZone } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import {
  PAGE_SIZE,
  buildHref,
  clampPage,
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

const bookingInclude = {
  service: { select: { name: true } },
  customer: { select: { name: true, email: true } },
} as const;

// Both lists share one URL, same as My bookings, so paging or sorting one table keeps the other in place.
function dashboardHref(upcoming: ListState<BookingSortKey>, history: ListState<BookingSortKey>): string {
  return buildHref("/dashboard", sectionParams("upcoming", upcoming), sectionParams("history", history));
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

// Owner/admin overview: stats, revenue by service, services, and the upcoming and past booking lists.
export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");
  if (user.role === "CUSTOMER") redirect("/");

  const now = new Date();
  // Upcoming: confirmed and not yet started. History: everything else, including cancelled future bookings.
  const upcomingWhere: Prisma.BookingWhereInput = { status: BookingStatus.CONFIRMED, startAt: { gte: now } };
  const historyWhere: Prisma.BookingWhereInput = {
    OR: [{ status: { not: BookingStatus.CONFIRMED } }, { startAt: { lt: now } }],
  };

  const [business, services, upcomingTotal, historyTotal, pastGroups, upcomingGroups] = await Promise.all([
    getBusiness(),
    prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
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

  const upcoming = clampPage(parseListState(searchParams, "upcoming", SORT_KEYS, DEFAULTS.upcoming), upcomingTotal);
  const history = clampPage(parseListState(searchParams, "history", SORT_KEYS, DEFAULTS.history), historyTotal);

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

  const tz = business.timezone;
  const nowMs = now.getTime();

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
              <thead className={tableHeadClass}>
                <tr>
                  <StaticHeader label="Service" />
                  <StaticHeader label="Price" align="right" />
                  <StaticHeader label="Past" align="right" />
                  <StaticHeader label="Revenue" align="right" />
                  <StaticHeader label="Upcoming" align="right" />
                  <StaticHeader label="Booked value" align="right" />
                </tr>
              </thead>
              <tbody className={tableBodyClass}>
                {serviceStats.map((r) => (
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
            withActions
            hrefFor={(next) => dashboardHref(next, history)}
            pageHref={(p) => dashboardHref({ ...upcoming, page: p }, history)}
          />
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <SectionHeading id="history-heading" icon={History} title="Booking history" count={historyTotal} />
        {historyTotal === 0 ? (
          <EmptyState title="No past bookings yet" />
        ) : (
          <BookingTable
            caption="Booking history"
            pagerLabel="History pages"
            state={history}
            total={historyTotal}
            rows={historyRows}
            timezone={tz}
            nowMs={nowMs}
            withActions={false}
            hrefFor={(next) => dashboardHref(upcoming, next)}
            pageHref={(p) => dashboardHref(upcoming, { ...history, page: p })}
          />
        )}
      </section>
    </PageShell>
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

function BookingTable({
  caption,
  pagerLabel,
  state,
  total,
  rows,
  timezone,
  nowMs,
  withActions,
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
  withActions: boolean;
  hrefFor: (next: ListState<BookingSortKey>) => string;
  pageHref: (page: number) => string;
}) {
  const columns: ColumnDef<BookingSortKey>[] = [
    { label: "When", key: "date" },
    { label: "Service", key: "service" },
    { label: "Customer", key: "customer" },
    { label: "Status", key: "status" },
    ...(withActions ? [{ label: "", key: null }] : []),
  ];

  return (
    <div className={tableCardClass}>
      <div className={tableScrollClass}>
        <table className={tableClass}>
          <caption className="sr-only">{caption}</caption>
          <SortableHead columns={columns} state={state} hrefFor={hrefFor} />
          <tbody className={tableBodyClass}>
            {rows.map((b) => {
              // A confirmed booking whose start has passed has happened but was never marked completed.
              const past = b.startAt.getTime() < nowMs;
              const badge =
                b.status === BookingStatus.CONFIRMED && past
                  ? { label: "Past", tone: "neutral" as const }
                  : STATUS_BADGE[b.status];
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
                  {withActions && (
                    <td className="px-4 py-3 text-right">
                      <CancelBookingButton
                        bookingId={b.id}
                        summary={`${b.service.name} for ${b.customer.name ?? b.customer.email} on ${formatDayInZone(b.startAt, timezone)} at ${formatTimeInZone(b.startAt, timezone)}`}
                      />
                    </td>
                  )}
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
