"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, UserX } from "lucide-react";
import { Alert, Button } from "@booking/ui";

export type BookingOutcomeButtonsProps = {
  bookingId: string;
  summary: string; // e.g. "Cut for Sam on Mon 3 Nov at 9:00 am"
};

// Owner/admin records what happened to a booking that has already started: attended or no-show.
// Uses PATCH /api/manage/bookings/:id.
export function BookingOutcomeButtons({ bookingId, summary }: BookingOutcomeButtonsProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"COMPLETED" | "NO_SHOW" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function mark(status: "COMPLETED" | "NO_SHOW") {
    setSubmitting(status);
    setError(null);
    try {
      const res = await fetch(`/api/manage/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not update this booking.");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this booking.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={submitting !== null}
          onClick={() => mark("COMPLETED")}
          aria-label={`Mark completed: ${summary}`}
          className="gap-1.5 whitespace-nowrap"
        >
          <CalendarCheck size={14} aria-hidden="true" />
          {submitting === "COMPLETED" ? "Saving..." : "Completed"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={submitting !== null}
          onClick={() => mark("NO_SHOW")}
          aria-label={`Mark no-show: ${summary}`}
          className="gap-1.5 whitespace-nowrap"
        >
          <UserX size={14} aria-hidden="true" />
          {submitting === "NO_SHOW" ? "Saving..." : "No show"}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
