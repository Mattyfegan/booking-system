"use client";

import { Alert, Button, EmptyState, Skeleton } from "@booking/ui";
import { formatTimeInZone } from "@/lib/format";

export type SlotItem = { startAt: string; endAt: string; booked: boolean };

export type SlotPickerProps = {
  status: "idle" | "loading" | "error" | "ready";
  slots: SlotItem[];
  timezone: string;
  // Current time in epoch ms. Passed in so the parent can tick it and past slots grey out as the day progresses.
  now: number;
  selected: string | null;
  onSelect: (startAt: string) => void;
  onRetry: () => void;
};

// Renders the time options for one day. Booked and already-passed times stay visible but disabled.
export function SlotPicker({ status, slots, timezone, now, selected, onSelect, onRetry }: SlotPickerProps) {
  if (status === "idle") {
    return <EmptyState title="Pick a date" description="Available times for the selected day will appear here." />;
  }

  if (status === "loading") {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-busy="true" aria-label="Loading times">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <Alert tone="error" className="flex flex-col items-start gap-2">
        <span>We could not load times for this day.</span>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    );
  }

  if (slots.length === 0) {
    return <EmptyState title="Closed on this day" description="Try another date." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Available times" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((slot) => {
          const isSelected = selected === slot.startAt;
          const passed = new Date(slot.startAt).getTime() <= now;
          const unavailable = slot.booked || passed;
          const reason = slot.booked ? "Booked" : passed ? "Passed" : null;
          return (
            <button
              key={slot.startAt}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={unavailable}
              onClick={() => onSelect(slot.startAt)}
              className={[
                "flex flex-col items-center rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
                unavailable
                  ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                  : isSelected
                    ? "border-brand-green bg-brand-green text-white shadow-sm"
                    : "border-gray-300 bg-white text-brand-green hover:border-brand-gold hover:bg-brand-gold-soft",
              ].join(" ")}
            >
              <span className={unavailable ? "line-through" : undefined}>
                {formatTimeInZone(new Date(slot.startAt), timezone)}
              </span>
              {reason && <span className="text-[10px] font-normal">{reason}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">Greyed-out times are already booked or have passed.</p>
    </div>
  );
}
