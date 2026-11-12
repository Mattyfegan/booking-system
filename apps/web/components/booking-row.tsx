"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX } from "lucide-react";
import { Badge, Button, Modal, type BadgeTone } from "@booking/ui";

export type BookingRowData = {
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

const STATUS_LABEL: Record<BookingRowData["status"], string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No show",
};

const STATUS_TONE: Record<BookingRowData["status"], BadgeTone> = {
  CONFIRMED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
  NO_SHOW: "warning",
};

// One table row. Cancellation is optimistic: the badge flips immediately and reverts if the request fails.
export function BookingRow({ booking }: { booking: BookingRowData }) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState<BookingRowData["status"] | null>(null);
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
      // Refetch server data so the row moves to the right table.
      startTransition(() => router.refresh());
    } catch (err) {
      setOptimisticStatus(null);
      setError(err instanceof Error ? err.message : "Could not cancel this booking.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <tr className="align-middle transition-colors hover:bg-brand-gold-soft/60">
      <td className="px-4 py-3 font-medium text-brand-green">{booking.serviceName}</td>
      <td className="whitespace-nowrap px-4 py-3">{booking.dayLabel}</td>
      <td className="whitespace-nowrap px-4 py-3">{booking.timeLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{booking.durationLabel}</td>
      <td className="whitespace-nowrap px-4 py-3">{booking.priceLabel}</td>
      <td className="px-4 py-3">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          {canCancel && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setDialogOpen(true)}
              aria-label={`Cancel ${booking.serviceName} on ${booking.dayLabel}`}
              className="gap-1.5 whitespace-nowrap"
            >
              <CalendarX size={14} aria-hidden="true" />
              Cancel
            </Button>
          )}
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
        </div>

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
      </td>
    </tr>
  );
}
