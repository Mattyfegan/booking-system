import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, BookingStatus, type Prisma } from "@booking/db";
import { Card, EmptyState } from "@booking/ui";
import { CalendarClock, CalendarPlus, History } from "lucide-react";
import { BookingRow, type BookingRowData } from "@/components/booking-row";
import { Pagination } from "@/components/pagination";
import { SortableHead, type ColumnDef } from "@/components/sort-header";
import { PageShell } from "@/components/skeletons";
import { tableBodyClass, tableCardClass, tableClass, tableScrollClass } from "@/components/table-styles";
import { getBusiness } from "@/lib/business";
import { formatDayInZone, formatDurationMin, formatPrice, formatTimeInZone } from "@/lib/format";
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

export const metadata: Metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

// Sortable columns. "Time" is not listed because it follows the Date column (same start instant).
const SORT_KEYS = ["service", "date", "duration", "price", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const DEFAULTS = {
  upcoming: { sort: "date", dir: "asc" },
  history: { sort: "date", dir: "desc" },
} as const;

const COLUMNS: ColumnDef<SortKey>[] = [
  { label: "Service", key: "service" },
  { label: "Date", key: "date" },
  { label: "Time", key: null },
  { label: "Duration", key: "duration" },
  { label: "Price", key: "price" },
  { label: "Status", key: "status" },
  { label: "", key: null },
];

// Both sections live in one URL, so paging or sorting one table leaves the other where it was.
function listHref(upcoming: ListState<SortKey>, history: ListState<SortKey>): string {
  return buildHref("/my-bookings", sectionParams("upcoming", upcoming), sectionParams("history", history));
}

// Ordering for Prisma. The id tie-breaker keeps pages stable when several rows share a value.
function orderFor(state: ListState<SortKey>): Prisma.BookingOrderByWithRelationInput[] {
  const d = state.dir;
  let primary: Prisma.BookingOrderByWithRelationInput;
  switch (state.sort) {
    case "service":
      primary = { service: { name: d } };
      break;
    case "duration":
      primary = { service: { durationMin: d } };
      break;
    case "price":
      primary = { service: { priceCents: d } };
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

export default async function MyBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/my-bookings");
  if (user.role === "BUSINESS_OWNER") redirect("/dashboard");

  const now = new Date();
  // Upcoming: confirmed and not yet started. History: everything else (past, cancelled, completed, no-show).
  const upcomingWhere: Prisma.BookingWhereInput = {
    customerId: user.id,
    status: BookingStatus.CONFIRMED,
    startAt: { gte: now },
  };
  const historyWhere: Prisma.BookingWhereInput = {
    customerId: user.id,
    OR: [{ status: { not: BookingStatus.CONFIRMED } }, { startAt: { lt: now } }],
  };

  const [business, upcomingTotal, historyTotal] = await Promise.all([
    getBusiness(),
    prisma.booking.count({ where: upcomingWhere }),
    prisma.booking.count({ where: historyWhere }),
  ]);

  const upcoming = clampPage(parseListState(searchParams, "upcoming", SORT_KEYS, DEFAULTS.upcoming), upcomingTotal);
  const history = clampPage(parseListState(searchParams, "history", SORT_KEYS, DEFAULTS.history), historyTotal);

  const include = { service: { select: { name: true, durationMin: true, priceCents: true } } } as const;
  const [upcomingRows, historyRows] = await Promise.all([
    prisma.booking.findMany({
      where: upcomingWhere,
      include,
      orderBy: orderFor(upcoming),
      skip: (upcoming.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.booking.findMany({
      where: historyWhere,
      include,
      orderBy: orderFor(history),
      skip: (history.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const toRow = (b: (typeof upcomingRows)[number]): BookingRowData => ({
    id: b.id,
    status: b.status,
    isFuture: b.startAt.getTime() >= now.getTime(),
    serviceName: b.service.name,
    dayLabel: formatDayInZone(b.startAt, business.timezone),
    timeLabel: formatTimeInZone(b.startAt, business.timezone),
    durationLabel: formatDurationMin(b.service.durationMin),
    priceLabel: formatPrice(b.service.priceCents),
  });

  return (
    <PageShell>
      <header className="mb-8 flex flex-col gap-2">
        <span aria-hidden="true" className="h-1 w-12 rounded-full bg-brand-gold" />
        <h1 className="text-3xl font-bold text-brand-green">My bookings</h1>
        <p className="max-w-2xl text-gray-600">
          Upcoming appointments at {business.name} can be cancelled here.
        </p>
      </header>

      <section aria-labelledby="upcoming-heading" className="mb-10 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="upcoming-heading" className="flex items-center gap-2 text-lg font-semibold text-brand-green">
            <CalendarClock size={20} aria-hidden="true" />
            Upcoming
          </h2>
          <span className="text-sm text-gray-500">{upcomingTotal} total</span>
        </div>

        {upcomingTotal === 0 ? (
          <EmptyState
            title="No upcoming bookings"
            description={`Book your next appointment at ${business.name}.`}
            action={
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
              >
                <CalendarPlus size={16} aria-hidden="true" />
                Book an appointment
              </Link>
            }
          />
        ) : (
          <div className={tableCardClass}>
            <div className={tableScrollClass}>
              <table className={tableClass}>
                <caption className="sr-only">Upcoming bookings</caption>
                <SortableHead columns={COLUMNS} state={upcoming} hrefFor={(next) => listHref(next, history)} />
                <tbody className={tableBodyClass}>
                  {upcomingRows.map((b) => (
                    <BookingRow key={b.id} booking={toRow(b)} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Upcoming bookings pages"
              page={upcoming.page}
              pageSize={PAGE_SIZE}
              total={upcomingTotal}
              hrefFor={(p) => listHref({ ...upcoming, page: p }, history)}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="history-heading" className="flex items-center gap-2 text-lg font-semibold text-brand-green">
            <History size={20} aria-hidden="true" />
            History
          </h2>
          <span className="text-sm text-gray-500">{historyTotal} total</span>
        </div>

        {historyTotal === 0 ? (
          <Card>
            <p className="text-sm text-gray-600">Past and cancelled bookings will appear here.</p>
          </Card>
        ) : (
          <div className={tableCardClass}>
            <div className={tableScrollClass}>
              <table className={tableClass}>
                <caption className="sr-only">Past and cancelled bookings</caption>
                <SortableHead columns={COLUMNS} state={history} hrefFor={(next) => listHref(upcoming, next)} />
                <tbody className={tableBodyClass}>
                  {historyRows.map((b) => (
                    <BookingRow key={b.id} booking={toRow(b)} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              label="History pages"
              page={history.page}
              pageSize={PAGE_SIZE}
              total={historyTotal}
              hrefFor={(p) => listHref(upcoming, { ...history, page: p })}
            />
          </div>
        )}
      </section>
    </PageShell>
  );
}
