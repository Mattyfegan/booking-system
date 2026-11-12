import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { prisma } from "@booking/db";
import { Badge, Card } from "@booking/ui";
import { PageShell } from "@/components/skeletons";
import { getBusiness } from "@/lib/business";
import { formatDayInZone, formatDurationMin, formatPrice, formatTimeInZone } from "@/lib/format";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Booking confirmed" };
export const dynamic = "force-dynamic";

// Success state shown after a booking is created. Only the customer who made the booking can view it.
export default async function BookingConfirmedPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/booking-confirmed/${params.id}`)}`);

  const [business, booking] = await Promise.all([
    getBusiness(),
    prisma.booking.findFirst({
      where: { id: params.id, customerId: user.id },
      include: { service: { select: { name: true, durationMin: true, priceCents: true } } },
    }),
  ]);
  if (!booking) notFound();

  return (
    <PageShell>
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Card className="flex flex-col gap-5 border-brand-gold bg-brand-gold-soft p-6 text-center sm:p-8">
          <span
            aria-hidden="true"
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-green text-white ring-4 ring-brand-gold/40"
          >
            <Check size={28} strokeWidth={2.5} />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-brand-green">Booking confirmed</h1>
            <p className="text-sm text-brand-green">
              Your appointment at {business.name} is booked. You can review or cancel it under My bookings.
            </p>
          </div>

          <dl className="mx-auto grid max-w-sm grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-white p-4 text-left text-sm">
            <dt className="text-gray-500">Service</dt>
            <dd className="font-medium">{booking.service.name}</dd>
            <dt className="text-gray-500">Date</dt>
            <dd>{formatDayInZone(booking.startAt, business.timezone)}</dd>
            <dt className="text-gray-500">Time</dt>
            <dd>
              {formatTimeInZone(booking.startAt, business.timezone)} ({formatDurationMin(booking.service.durationMin)})
            </dd>
            <dt className="text-gray-500">Price</dt>
            <dd>{formatPrice(booking.service.priceCents)}</dd>
            <dt className="text-gray-500">Status</dt>
            <dd>
              <Badge tone="success">Confirmed</Badge>
            </dd>
          </dl>

          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Link
              href="/my-bookings"
              className="inline-flex items-center justify-center rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
            >
              View my bookings
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-brand-green bg-white px-4 py-2 text-sm font-medium text-brand-green transition-colors hover:bg-brand-gold-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
            >
              Book another appointment
            </Link>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
