import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

// Pure scheduling logic: no I/O, so every rule here is unit-testable without a database.
// Times of day are "HH:mm" wall-clock values in the business timezone. Instants are JS Dates (UTC).

export const DEFAULT_SLOT_STEP_MIN = 15;

export type TimeWindow = { startTime: string; endTime: string };
export type WeeklyRule = TimeWindow & { dayOfWeek: number };
export type DayOverride = { isClosed: boolean; startTime: string | null; endTime: string | null };
export type BusyBooking = { startAt: Date; endAt: Date; bufferMin: number };
export type Slot = { startAt: Date; endAt: Date };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_MS = 60_000;

// Accepts "YYYY-MM-DD" and rejects impossible dates such as 2031-02-30.
export function isValidDateString(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// 0 = Sunday ... 6 = Saturday, matching Prisma's dayOfWeek column convention used by the schema.
export function dayOfWeekFor(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Precedence: a closed override wins, then an override with hours replaces the weekly rules,
// otherwise the weekly rules for that weekday apply.
export function windowsForDate(
  date: string,
  rules: WeeklyRule[],
  override: DayOverride | null | undefined,
): TimeWindow[] {
  if (override?.isClosed) return [];
  if (override?.startTime && override.endTime) {
    return [{ startTime: override.startTime, endTime: override.endTime }];
  }
  const dow = dayOfWeekFor(date);
  return rules
    .filter((r) => r.dayOfWeek === dow)
    .map(({ startTime, endTime }) => ({ startTime, endTime }))
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

// Converts a wall-clock time on a local date in the given IANA timezone to a UTC instant.
// Handles DST: on a spring-forward day, 02:30 does not exist and is shifted by date-fns-tz.
export function localToUtc(date: string, hhmm: string, timezone: string): Date {
  return fromZonedTime(`${date}T${hhmm}:00`, timezone);
}

// A booking occupies [startAt, endAt + bufferMin). Two intervals conflict when each one's
// occupied range overlaps the other's. Buffers are applied to both sides, so a candidate's
// trailing buffer cannot run into an existing booking, and vice versa.
export function conflicts(
  candidate: { start: Date; end: Date; bufferMin: number },
  existing: BusyBooking,
): boolean {
  const cStart = candidate.start.getTime();
  const cEnd = addMinutes(candidate.end, candidate.bufferMin).getTime();
  const eStart = existing.startAt.getTime();
  const eEnd = addMinutes(existing.endAt, existing.bufferMin).getTime();
  return cStart < eEnd && eStart < cEnd;
}

export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

export type DayInput = {
  date: string;
  timezone: string;
  windows: TimeWindow[];
  durationMin: number;
  bufferMin: number;
  busy: BusyBooking[];
  stepMin?: number;
};

// Every step-aligned start inside the open windows, including starts that are booked or already past.
// The UI greys those out instead of hiding them. Callers decide what is bookable.
export type DaySlot = Slot & { booked: boolean };

export function generateDaySlots(input: DayInput): DaySlot[] {
  const stepMs = (input.stepMin ?? DEFAULT_SLOT_STEP_MIN) * MINUTE_MS;
  const durationMs = input.durationMin * MINUTE_MS;
  const seen = new Map<number, DaySlot>();

  for (const w of input.windows) {
    const winStart = localToUtc(input.date, w.startTime, input.timezone).getTime();
    const winEnd = localToUtc(input.date, w.endTime, input.timezone).getTime();

    // A slot must finish inside its window. Buffer time after the last appointment may extend past it.
    for (let t = winStart; t + durationMs <= winEnd; t += stepMs) {
      if (seen.has(t)) continue;
      const slot = { start: new Date(t), end: new Date(t + durationMs) };
      const booked = input.busy.some((b) => conflicts({ ...slot, bufferMin: input.bufferMin }, b));
      seen.set(t, { startAt: slot.start, endAt: slot.end, booked });
    }
  }

  return [...seen.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

// Bookable slots only: not booked and not starting before `now`.
export function generateSlots(input: DayInput & { now: Date }): Slot[] {
  const { now, ...day } = input;
  const nowMs = now.getTime();
  return generateDaySlots(day)
    .filter((s) => !s.booked && s.startAt.getTime() >= nowMs)
    .map(({ startAt, endAt }) => ({ startAt, endAt }));
}
