"use client";

import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type BookingCalendarProps = {
  // Selected day as "YYYY-MM-DD".
  value: string | null;
  onChange: (date: string) => void;
  // Days before this are disabled. Defaults to today.
  minDate?: Date;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Month-grid date picker. Works in the browser's local calendar; the API interprets the chosen day in the business timezone.
export function BookingCalendar({ value, onChange, minDate }: BookingCalendarProps) {
  const floor = startOfDay(minDate ?? new Date());
  const [month, setMonth] = useState(() => startOfMonth(value ? new Date(`${value}T00:00:00`) : floor));

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
  const canGoBack = startOfMonth(addMonths(month, -1)) >= startOfMonth(floor);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="rounded-md px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          &larr;
        </button>
        <p className="text-sm font-semibold" aria-live="polite">
          {format(month, "MMMM yyyy")}
        </p>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
          className="rounded-md px-3 py-1 text-sm hover:bg-gray-100"
        >
          &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div role="group" aria-label={format(month, "MMMM yyyy")} className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const disabled = day < floor;
          const selected = value === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={format(day, "EEEE d MMMM yyyy")}
              onClick={() => onChange(iso)}
              className={[
                "flex aspect-square items-center justify-center rounded-md text-sm transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-black",
                !isSameMonth(day, month) ? "text-gray-300" : "",
                disabled ? "cursor-not-allowed text-gray-300 line-through" : "hover:bg-gray-100",
                selected ? "bg-black font-semibold text-white hover:bg-gray-800" : "",
                !selected && isToday(day) ? "ring-1 ring-gray-400" : "",
              ].join(" ")}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
