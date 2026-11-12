"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const navButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-brand-green transition-colors hover:border-brand-gold hover:bg-brand-gold-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold disabled:cursor-not-allowed disabled:border-transparent disabled:text-gray-300 disabled:hover:bg-transparent";

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
          className={navButton}
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-brand-green" aria-live="polite">
          {format(month, "MMMM yyyy")}
        </p>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
          className={navButton}
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
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
          const today = isToday(day);
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
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
                !isSameMonth(day, month) ? "text-gray-300" : "",
                disabled ? "cursor-not-allowed text-gray-300 line-through" : "hover:bg-brand-gold-soft",
                selected ? "bg-brand-green font-semibold text-white hover:bg-brand-green-dark" : "",
                !selected && today ? "font-semibold text-brand-green ring-1 ring-brand-gold" : "",
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
