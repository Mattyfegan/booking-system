"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, EmptyState, Modal, Textarea } from "@booking/ui";
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
type Confirmation = { phase: "saving" | "saved"; serviceName: string; startAt: string; endAt: string };

// Service -> date -> time -> review -> confirm.
// Confirming is optimistic: the booking shows as confirmed and the slot is held immediately.
// If the server rejects it, the hold is released, the reason is shown, and availability is reloaded.
export function BookingPanel({ business, services, access, signInHref }: BookingPanelProps) {
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState<string | null>(null);
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle", slots: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [heldStarts, setHeldStarts] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const selectedSlot = slotsState.slots.find((s) => s.startAt === selectedStart) ?? null;
  // Hide held slots and any start time that has already passed (the server enforces this too).
  const nowMs = Date.now();
  const visibleSlots = slotsState.slots.filter(
    (s) => !heldStarts.includes(s.startAt) && new Date(s.startAt).getTime() > nowMs,
  );

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
        setSlotsState({ status: "ready", slots: body.slots });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSlotsState({ status: "error", slots: [] });
      });

    return () => controller.abort();
  }, [serviceId, date, reloadKey]);

  async function confirmBooking() {
    if (!service || !selectedSlot) return;
    const slot = selectedSlot;

    // Optimistic update: show success and hold the slot before the server responds.
    setReviewOpen(false);
    setError(null);
    setHeldStarts((held) => [...held, slot.startAt]);
    setConfirmation({ phase: "saving", serviceName: service.name, startAt: slot.startAt, endAt: slot.endAt });
    setSelectedStart(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          startAt: slot.startAt,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not complete your booking. Please try again.");
      }
      setConfirmation((c) => (c ? { ...c, phase: "saved" } : c));
      setNotes("");
    } catch (err) {
      // Roll back the optimistic confirmation.
      setConfirmation(null);
      setError(err instanceof Error ? err.message : "Could not complete your booking. Please try again.");
    } finally {
      setHeldStarts((held) => held.filter((h) => h !== slot.startAt));
      // Reload so the list reflects the server's view, including any buffers from the new booking.
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
      {error && <Alert tone="error">{error}</Alert>}

      {confirmation && (
        <Card className="flex flex-col gap-3 border-green-200 bg-green-50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-green-900">
              {confirmation.phase === "saving" ? "Booking your appointment..." : "Booking confirmed"}
            </p>
            <Badge tone="success">{confirmation.phase === "saving" ? "Saving..." : "Saved"}</Badge>
          </div>
          <p className="text-sm text-green-900">
            {confirmation.serviceName} on {formatDayInZone(new Date(confirmation.startAt), business.timezone)} at{" "}
            {formatTimeInZone(new Date(confirmation.startAt), business.timezone)} ({business.name})
          </p>
          <div className="flex flex-wrap gap-2">
            {access === "customer" && (
              <Link
                href="/my-bookings"
                className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                View my bookings
              </Link>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmation(null)}>
              Book another
            </Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="service-heading" className="flex flex-col gap-3">
        <h2 id="service-heading" className="text-lg font-semibold">
          1. Choose a service
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
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
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-black",
                    active ? "border-black ring-1 ring-black" : "border-gray-200 hover:border-gray-400",
                  ].join(" ")}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-sm font-semibold">{formatPrice(s.priceCents)}</span>
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

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="date-heading" className="flex flex-col gap-3">
          <h2 id="date-heading" className="text-lg font-semibold">
            2. Pick a date
          </h2>
          <Card>
            <BookingCalendar value={date} onChange={setDate} />
          </Card>
        </section>

        <section aria-labelledby="time-heading" className="flex flex-col gap-3">
          <h2 id="time-heading" className="text-lg font-semibold">
            3. Pick a time
          </h2>
          <p className="text-xs text-gray-500">Times are shown in {business.timezone}.</p>
          <SlotPicker
            status={date ? slotsState.status : "idle"}
            slots={visibleSlots}
            timezone={business.timezone}
            selected={selectedStart}
            onSelect={setSelectedStart}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
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
          <Button type="button" disabled={!selectedSlot} onClick={() => setReviewOpen(true)} className="w-full sm:w-auto">
            Review booking
          </Button>
        )}
        {access === "guest" && (
          <Link
            href={signInHref}
            className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 sm:w-auto"
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
        onClose={() => setReviewOpen(false)}
        title="Confirm your booking"
        description={`${business.name}. Times are in ${business.timezone}.`}
        footer={
          <>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setReviewOpen(false)}>
              Back
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={confirmBooking}>
              Confirm booking
            </Button>
          </>
        }
      >
        {service && selectedSlot && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Service</dt>
            <dd className="font-medium">{service.name}</dd>
            <dt className="text-gray-500">Date</dt>
            <dd>{formatDayInZone(new Date(selectedSlot.startAt), business.timezone)}</dd>
            <dt className="text-gray-500">Time</dt>
            <dd>
              {formatTimeInZone(new Date(selectedSlot.startAt), business.timezone)} (
              {formatDurationMin(service.durationMin)})
            </dd>
            <dt className="text-gray-500">Price</dt>
            <dd>{formatPrice(service.priceCents)}</dd>
          </dl>
        )}
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          hint="Anything the business should know before your appointment."
        />
      </Modal>
    </div>
  );
}
