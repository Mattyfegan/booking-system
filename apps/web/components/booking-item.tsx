"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Modal, type BadgeTone } from "@booking/ui";

export type BookingItemData = {
  id: string;
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  // True when the start time is still in the future (computed on the server at render time).
  isFuture: boolean;
  serviceName: string;
  dayLabel: string;
  timeLabel: string;
  durationLabel: string;
  priceLabel: string;
};

const STATUS_LABEL: Record<BookingItemData["status"], string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No show",
};

const STATUS_TONE: Record<BookingItemData["status"], BadgeTone> = {
  CONFIRMED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
  NO_SHOW: "warning",
};

// Cancellation is optimistic: the badge flips immediately and reverts if the request fails.
export function BookingItem({ booking }: { booking: BookingItemData }) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState<BookingItemData["status"] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const status = optimisticStatus ?? booking.status;
  const canCancel = status === "CONFIRMED" && booking.isFuture;

  async function cancel() {
    setDialogOpen(false);
    setError(null);
    setOptimisticStatus("CANCELLED");
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not cancel this booking. Please try again.");
      }
      // Refetch server data so the item moves to the right section.
      startTransition(() => router.refresh());
    } catch (err) {
      setOptimisticStatus(null);
      setError(err instanceof Error ? err.message : "Could not cancel this booking.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{booking.serviceName}</h3>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
        <p className="text-sm text-gray-600">
          {booking.dayLabel} at {booking.timeLabel} · {booking.durationLabel} · {booking.priceLabel}
        </p>
        {error && <Alert tone="error" className="mt-2">{error}</Alert>}
      </div>

      {canCancel && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isSubmitting}
          onClick={() => setDialogOpen(true)}
          aria-label={`Cancel ${booking.serviceName} on ${booking.dayLabel}`}
          className="w-full sm:w-auto"
        >
          Cancel booking
        </Button>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Cancel this booking?"
        description={`${booking.serviceName} on ${booking.dayLabel} at ${booking.timeLabel}. This cannot be undone.`}
        footer={
          <>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>
              Keep booking
            </Button>
            <Button type="button" variant="danger" className="w-full sm:w-auto" onClick={cancel}>
              Yes, cancel
            </Button>
          </>
        }
      />
    </Card>
  );
}
