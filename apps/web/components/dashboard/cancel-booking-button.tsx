"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Modal } from "@booking/ui";

export type CancelBookingButtonProps = {
  bookingId: string;
  summary: string; // e.g. "Cut with Sam on Mon 3 Nov at 9:00 am"
};

// Owner/admin cancellation of an upcoming booking. Uses POST /api/bookings/:id/cancel.
export function CancelBookingButton({ bookingId, summary }: CancelBookingButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  async function cancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not cancel this booking.");
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this booking.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={() => setOpen(true)}>
        Cancel
      </Button>
      {error && !open && <Alert tone="error">{error}</Alert>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this booking?"
        description={`${summary}. The customer's slot will be released. This cannot be undone.`}
        footer={
          <>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button type="button" variant="danger" className="w-full sm:w-auto" disabled={submitting} onClick={cancel}>
              {submitting ? "Cancelling..." : "Yes, cancel"}
            </Button>
          </>
        }
      >
        {error && <Alert tone="error">{error}</Alert>}
      </Modal>
    </div>
  );
}
