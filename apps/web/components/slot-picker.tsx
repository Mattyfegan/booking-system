"use client";

import { Alert, Button, EmptyState, Skeleton } from "@booking/ui";
import { formatTimeInZone } from "@/lib/format";

export type SlotItem = { startAt: string; endAt: string };

export type SlotPickerProps = {
  status: "idle" | "loading" | "error" | "ready";
  slots: SlotItem[];
  timezone: string;
  selected: string | null;
  onSelect: (startAt: string) => void;
  onRetry: () => void;
};

// Renders the time options for one day. Each state (idle, loading, error, empty, ready) has its own output.
export function SlotPicker({ status, slots, timezone, selected, onSelect, onRetry }: SlotPickerProps) {
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
    return <EmptyState title="No times left on this day" description="Try another date or service." />;
  }

  return (
    <div role="radiogroup" aria-label="Available times" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selected === slot.startAt;
        return (
          <button
            key={slot.startAt}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(slot.startAt)}
            className={[
              "rounded-md border px-2 py-2 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-black",
              isSelected ? "border-black bg-black text-white" : "border-gray-300 bg-white hover:border-gray-500",
            ].join(" ")}
          >
            {formatTimeInZone(new Date(slot.startAt), timezone)}
          </button>
        );
      })}
    </div>
  );
}
