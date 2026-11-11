import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingStatus, prisma } from "@booking/db";
import { Badge, Card, EmptyState } from "@booking/ui";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { ServiceManager, type ManagedService } from "@/components/dashboard/service-manager";
import { SignOutButton } from "@/components/sign-out-button";
import { getBusiness } from "@/lib/business";
import { summarizeServices, toCountMap } from "@/lib/dashboard";
import { formatDayInZone, formatPrice, formatTimeInZone } from "@/lib/format";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

const bookingInclude = {
  service: { select: { name: true } },
  customer: { select: { name: true, email: true } },
} as const;

const STATUS_BADGE: Record<BookingStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  NO_SHOW: { label: "No show", tone: "warning" },
};

// Owner/admin overview: upcoming and past bookings, revenue per service, and service management.
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");
  if (user.role === "CUSTOMER") redirect("/");

  const now = new Date();
  const [business, services, upcoming, history, pastGroups, upcomingGroups] = await Promise.all([
    getBusiness(),
    prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.booking.findMany({
      where: { status: BookingStatus.CONFIRMED, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: LIST_LIMIT,
      include: bookingInclude,
    }),
    prisma.booking.findMany({
      where: { startAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: LIST_LIMIT,
      include: bookingInclude,
    }),
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-600">
            {business.name} · times in {tz}
          </p>
        </div>
        <SignOutButton />
      </header>

      <section aria-labelledby="stats-heading" className="flex flex-col gap-3">
        <h2 id="stats-heading" className="text-lg font-semibold">
          Overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Upcoming bookings" value={String(totals.upcomingCount)} />
          <StatCard label="Past bookings" value={String(totals.pastCount)} />
          <StatCard label="Revenue to date" value={formatPrice(totals.pastRevenueCents)} hint="Past bookings x list price" />
          <StatCard label="Booked revenue" value={formatPrice(totals.upcomingRevenueCents)} hint="Upcoming bookings x list price" />
        </div>
      </section>

      <section aria-labelledby="perf-heading" className="flex flex-col gap-3">
        <h2 id="perf-heading" className="text-lg font-semibold">
          Revenue by service
        </h2>
        <p className="text-xs text-gray-500">
          Gross revenue only: the schema has no cost data, so this is not profit. Cancelled and no-show bookings are excluded.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Service</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Past</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Revenue</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Upcoming</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Booked value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {serviceStats.map((r) => (
                <tr key={r.serviceId} className={r.isActive ? "" : "text-gray-400"}>
                  <td className="px-3 py-2 font-medium">
                    {r.name}
                    {!r.isActive && <span className="ml-2 text-xs">(inactive)</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{formatPrice(r.priceCents)}</td>
                  <td className="px-3 py-2 text-right">{r.pastCount}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(r.pastRevenueCents)}</td>
                  <td className="px-3 py-2 text-right">{r.upcomingCount}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(r.upcomingRevenueCents)}</td>
                </tr>
              ))}
              {serviceStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-gray-600">No services yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="services-heading" className="flex flex-col gap-3">
        <h2 id="services-heading" className="text-lg font-semibold">
          Services
        </h2>
        <ServiceManager services={managed} />
      </section>

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold">
          Upcoming bookings
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming bookings" description="New customer bookings will appear here." />
        ) : (
          <BookingTable
            timezone={tz}
            rows={upcoming}
            renderAction={(b) => (
              <CancelBookingButton
                bookingId={b.id}
                summary={`${b.service.name} for ${b.customer.name ?? b.customer.email} on ${formatDayInZone(b.startAt, tz)} at ${formatTimeInZone(b.startAt, tz)}`}
              />
            )}
          />
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          Booking history
        </h2>
        <p className="text-xs text-gray-500">The {LIST_LIMIT} most recent past bookings.</p>
        {history.length === 0 ? (
          <EmptyState title="No past bookings yet" />
        ) : (
          <BookingTable timezone={tz} rows={history} />
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </Card>
  );
}

type BookingRow = {
  id: string;
  status: BookingStatus;
  startAt: Date;
  service: { name: string };
  customer: { name: string | null; email: string };
};

function BookingTable({
  rows,
  timezone,
  renderAction,
}: {
  rows: BookingRow[];
  timezone: string;
  renderAction?: (b: BookingRow) => React.ReactNode;
}) {
  const now = Date.now();
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">When</th>
            <th scope="col" className="px-3 py-2 font-medium">Service</th>
            <th scope="col" className="px-3 py-2 font-medium">Customer</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            {renderAction && <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((b) => {
            // A confirmed booking whose start has passed has happened but was never marked completed.
            const past = b.startAt.getTime() < now;
            const badge =
              b.status === BookingStatus.CONFIRMED && past
                ? { label: "Past", tone: "neutral" as const }
                : STATUS_BADGE[b.status];
            return (
              <tr key={b.id}>
                <td className="whitespace-nowrap px-3 py-2">
                  {formatDayInZone(b.startAt, timezone)} · {formatTimeInZone(b.startAt, timezone)}
                </td>
                <td className="px-3 py-2">{b.service.name}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span>{b.customer.name ?? "Customer"}</span>
                    <span className="text-xs text-gray-500">{b.customer.email}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </td>
                {renderAction && <td className="px-3 py-2 text-right">{renderAction(b)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
