import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, BookingStatus } from "@booking/db";
import { Card, EmptyState } from "@booking/ui";
import { BookingItem, type BookingItemData } from "@/components/booking-item";
import { PageShell } from "@/components/skeletons";
import { getBusiness } from "@/lib/business";
import { getSessionUser } from "@/lib/session";
import { formatDayInZone, formatDurationMin, formatPrice, formatTimeInZone } from "@/lib/format";

export const metadata: Metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/my-bookings");
  if (user.role === "BUSINESS_OWNER") redirect("/dashboard");

  const [business, rows] = await Promise.all([
    getBusiness(),
    prisma.booking.findMany({
      where: { customerId: user.id },
      include: { service: { select: { name: true, durationMin: true, priceCents: true } } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const now = new Date();
  const toItem = (b: (typeof rows)[number]): BookingItemData => ({
    id: b.id,
    status: b.status,
    isFuture: b.startAt.getTime() >= now.getTime(),
    serviceName: b.service.name,
    dayLabel: formatDayInZone(b.startAt, business.timezone),
    timeLabel: formatTimeInZone(b.startAt, business.timezone),
    durationLabel: formatDurationMin(b.service.durationMin),
    priceLabel: formatPrice(b.service.priceCents),
  });

  const upcoming = rows.filter((b) => b.status === BookingStatus.CONFIRMED && b.startAt >= now).map(toItem);
  const history = rows
    .filter((b) => !(b.status === BookingStatus.CONFIRMED && b.startAt >= now))
    .reverse()
    .map(toItem);

  return (
    <PageShell>
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-bold">My bookings</h1>
        <p className="text-sm text-gray-600">Upcoming appointments at {business.name} can be cancelled here.</p>
      </div>

      <section aria-labelledby="upcoming-heading" className="mb-10 flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming bookings"
            description={`Book your next appointment at ${business.name}.`}
            action={
              <Link
                href="/"
                className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Book an appointment
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((b) => (
              <li key={b.id}>
                <BookingItem booking={b} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-600">Past and cancelled bookings will appear here.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((b) => (
              <li key={b.id}>
                <BookingItem booking={b} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
