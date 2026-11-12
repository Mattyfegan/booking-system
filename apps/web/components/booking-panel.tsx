"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, EmptyState, Modal, Textarea } from "@booking/ui";
import { BookingCalendar } from "@/components/booking-calendar";
import { SlotPicker, type SlotItem } from "@/components/slot-picker";
import { formatDayInZone, formatDurationMin, formatPrice, formatTimeInZone } from "@/lib/format";

export type PanelService = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  bufferMin: number;
};

export type BookingPanelProps = {
  business: { name: string; timezone: string };
  services: PanelService[];
  // guest: not signed in. customer: may book. business-owner: can browse but not book.
  access: "guest" | "customer" | "business-owner";
  signInHref: string;
};

type SlotsState = { status: "idle" | "loading" | "error" | "ready"; slots: SlotItem[] };

// Service -> date -> time -> review -> confirm.
// A successful booking redirects to /booking-confirmed/[id] so the confirmation is on screen after the
// customer has scrolled down. A rejected booking keeps the review open with the reason and reloads times.
const CLOCK_TICK_MS = 30_000;

export function BookingPanel({ business, services, access, signInHref }: BookingPanelProps) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState<string | null>(null);
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle", slots: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [reviewSlot, setReviewSlot] = useState<SlotItem | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Ticks so that times greyed out as "passed" update while the page stays open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const selectedSlot = slotsState.slots.find((s) => s.startAt === selectedStart) ?? null;
  const selectedIsBookable = !!selectedSlot && !selectedSlot.booked && new Date(selectedSlot.startAt).getTime() > now;

  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    setSlotsState({ status: "loading", slots: [] });
    setSelectedStart(null);

    const params = new URLSearchParams({ serviceId, date });
    fetch(`/api/availability?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Availability request failed (${res.status})`);
        const body = (await res.json()) as { slots: SlotItem[] };
        setNow(Date.now());
        setSlotsState({ status: "ready", slots: body.slots });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSlotsState({ status: "error", slots: [] });
      });

    return () => controller.abort();
  }, [serviceId, date, reloadKey]);

  function openReview() {
    if (!selectedSlot) return;
    setReviewSlot(selectedSlot);
    setBookingError(null);
    setReviewOpen(true);
  }

  async function confirmBooking() {
    if (!service || !reviewSlot) return;

    setSubmitting(true);
    setBookingError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          startAt: reviewSlot.startAt,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not complete your booking. Please try again.");
      }
      const body = (await res.json()) as { booking: { id: string } };
      // Leave `submitting` set: the page is navigating away, so the form must stay locked.
      router.push(`/booking-confirmed/${body.booking.id}`);
    } catch (err) {
      setSubmitting(false);
      setBookingError(err instanceof Error ? err.message : "Could not complete your booking. Please try again.");
      // Refresh availability so the taken time shows as booked.
      setReloadKey((k) => k + 1);
    }
  }

  if (services.length === 0) {
    return <EmptyState title="No services available" description="This business has not listed any services yet." />;
  }

  const selectedLabel =
    selectedSlot && date
      ? `${formatDayInZone(new Date(selectedSlot.startAt), business.timezone)} at ${formatTimeInZone(new Date(selectedSlot.startAt), business.timezone)}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="service-heading" className="flex flex-col gap-3">
        <h2 id="service-heading" className="text-lg font-semibold text-brand-green">
          1. Choose a service
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const active = s.id === serviceId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setServiceId(s.id)}
                  className={[
                    "flex h-full w-full flex-col gap-1 rounded-lg border bg-white p-4 text-left transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
                    active
                      ? "border-brand-green bg-brand-gold-soft ring-1 ring-brand-green"
                      : "border-gray-200 hover:border-brand-gold",
                  ].join(" ")}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-brand-green">{s.name}</span>
                    <span className="text-sm font-semibold text-brand-green">{formatPrice(s.priceCents)}</span>
                  </span>
                  <span className="text-sm text-gray-600">
                    {formatDurationMin(s.durationMin)}
                    {s.bufferMin > 0 && ` + ${s.bufferMin} min buffer`}
                  </span>
                  {s.description && <span className="text-sm text-gray-500">{s.description}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <section aria-labelledby="date-heading">
          <Card className="flex flex-col gap-4">
            <h2 id="date-heading" className="text-lg font-semibold text-brand-green">
              2. Pick a date
            </h2>
            <BookingCalendar value={date} onChange={setDate} />
          </Card>
        </section>

        <section aria-labelledby="time-heading">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="time-heading" className="text-lg font-semibold text-brand-green">
                3. Pick a time
              </h2>
              <p className="text-xs text-gray-500">Times are shown in {business.timezone}.</p>
            </div>
            <SlotPicker
              status={date ? slotsState.status : "idle"}
              slots={slotsState.slots}
              timezone={business.timezone}
              now={now}
              selected={selectedStart}
              onSelect={setSelectedStart}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </Card>
        </section>
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          {service && selectedLabel ? (
            <>
              <span className="font-medium">{service.name}</span>, {selectedLabel}
            </>
          ) : (
            <span className="text-gray-600">Select a service, date and time to continue.</span>
          )}
        </p>

        {access === "customer" && (
          <Button
            type="button"
            variant="brand"
            disabled={!selectedIsBookable}
            onClick={openReview}
            className="w-full sm:w-auto"
          >
            Review booking
          </Button>
        )}
        {access === "guest" && (
          <Link
            href={signInHref}
            className="inline-flex w-full items-center justify-center rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold sm:w-auto"
          >
            Sign in to book
          </Link>
        )}
        {access === "business-owner" && (
          <p className="text-sm text-gray-600">Business owners cannot book appointments.</p>
        )}
      </Card>

      <Modal
        open={reviewOpen}
        onClose={() => {
          if (!submitting) setReviewOpen(false);
        }}
        title="Confirm your booking"
        description={`${business.name}. Times are in ${business.timezone}.`}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={submitting}
              onClick={() => setReviewOpen(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="brand"
              className="w-full sm:w-auto"
              disabled={submitting}
              onClick={confirmBooking}
            >
              {submitting ? "Booking..." : "Confirm booking"}
            </Button>
          </>
        }
      >
        {bookingError && <Alert tone="error">{bookingError}</Alert>}
        {service && reviewSlot && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Service</dt>
            <dd className="font-medium">{service.name}</dd>
            <dt className="text-gray-500">Date</dt>
            <dd>{formatDayInZone(new Date(reviewSlot.startAt), business.timezone)}</dd>
            <dt className="text-gray-500">Time</dt>
            <dd>
              {formatTimeInZone(new Date(reviewSlot.startAt), business.timezone)} (
              {formatDurationMin(service.durationMin)})
            </dd>
            <dt className="text-gray-500">Price</dt>
            <dd className="font-semibold text-brand-green">{formatPrice(service.priceCents)}</dd>
          </dl>
        )}
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={submitting}
          hint="Anything the business should know before your appointment."
        />
      </Modal>
    </div>
  );
}
