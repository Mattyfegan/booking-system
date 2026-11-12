import { describe, expect, it } from "vitest";
import {
  conflicts,
  dayOfWeekFor,
  generateDaySlots,
  generateSlots,
  isValidDateString,
  localToUtc,
  windowsForDate,
  windowsOverlap,
  type WeeklyRule,
} from "../availability";

const TZ = "America/New_York";
// 2031-03-10 is a Monday in US Eastern time, after DST started on 2031-03-09.
const MONDAY = "2031-03-10";

const iso = (d: Date) => d.toISOString();

describe("isValidDateString", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDateString("2031-03-10")).toBe(true);
    expect(isValidDateString("2032-02-29")).toBe(true);
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidDateString("2031-3-10")).toBe(false);
    expect(isValidDateString("2031-02-30")).toBe(false);
    expect(isValidDateString("2031-13-01")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
  });
});

describe("dayOfWeekFor", () => {
  it("uses 0 = Sunday ... 6 = Saturday", () => {
    expect(dayOfWeekFor("2031-03-09")).toBe(0); // Sunday
    expect(dayOfWeekFor(MONDAY)).toBe(1);
    expect(dayOfWeekFor("2031-03-15")).toBe(6); // Saturday
  });
});

describe("windowsForDate precedence", () => {
  const rules: WeeklyRule[] = [
    { dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
    { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
  ];

  it("returns the weekday's rules sorted by start time", () => {
    expect(windowsForDate(MONDAY, rules, null)).toEqual([
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "13:00", endTime: "17:00" },
    ]);
  });

  it("returns no windows for a weekday with no rules", () => {
    expect(windowsForDate("2031-03-09", rules, null)).toEqual([]);
  });

  it("a closed override removes all windows for that date", () => {
    expect(windowsForDate(MONDAY, rules, { isClosed: true, startTime: null, endTime: null })).toEqual([]);
  });

  it("an override with hours replaces the weekly rules for that date", () => {
    expect(windowsForDate(MONDAY, rules, { isClosed: false, startTime: "10:00", endTime: "11:00" })).toEqual([
      { startTime: "10:00", endTime: "11:00" },
    ]);
  });
});

describe("localToUtc", () => {
  it("converts business-local wall time to UTC, respecting the offset", () => {
    // EDT (UTC-4) on 2031-03-10
    expect(iso(localToUtc(MONDAY, "09:00", TZ))).toBe("2031-03-10T13:00:00.000Z");
  });

  it("uses EST (UTC-5) before the spring-forward transition", () => {
    // 2031-03-08 is still EST
    expect(iso(localToUtc("2031-03-08", "09:00", TZ))).toBe("2031-03-08T14:00:00.000Z");
  });

  it("handles UTC businesses", () => {
    expect(iso(localToUtc(MONDAY, "09:00", "UTC"))).toBe("2031-03-10T09:00:00.000Z");
  });
});

describe("conflicts", () => {
  const existing = {
    startAt: new Date("2031-03-10T14:00:00Z"),
    endAt: new Date("2031-03-10T15:00:00Z"),
    bufferMin: 10,
  };
  const at = (hhmm: string, durationMin = 60) => {
    const start = new Date(`2031-03-10T${hhmm}:00Z`);
    return { start, end: new Date(start.getTime() + durationMin * 60_000) };
  };

  it("detects a direct overlap", () => {
    expect(conflicts({ ...at("14:30"), bufferMin: 0 }, existing)).toBe(true);
  });

  it("treats the existing booking's trailing buffer as occupied", () => {
    // Existing occupies 14:00-15:10. A candidate starting 15:05 must be rejected.
    expect(conflicts({ ...at("15:05"), bufferMin: 0 }, existing)).toBe(true);
  });

  it("treats the candidate's own trailing buffer as occupied", () => {
    // Candidate 12:30-13:30 with 10 min buffer occupies until 13:40. Existing starts 14:00: no conflict.
    expect(conflicts({ ...at("12:30"), bufferMin: 10 }, existing)).toBe(false);
    // Candidate 12:30-13:55 with buffer runs to 14:05, overlapping the existing 14:00 start.
    expect(conflicts({ ...at("12:30", 85), bufferMin: 10 }, existing)).toBe(true);
  });

  it("allows back-to-back bookings when buffers are zero", () => {
    expect(conflicts({ ...at("15:00"), bufferMin: 0 }, { ...existing, bufferMin: 0 })).toBe(false);
  });
});

describe("windowsOverlap", () => {
  it("is false for adjacent windows and true for overlapping ones", () => {
    const a = { startTime: "09:00", endTime: "12:00" };
    expect(windowsOverlap(a, { startTime: "12:00", endTime: "13:00" })).toBe(false);
    expect(windowsOverlap(a, { startTime: "11:59", endTime: "13:00" })).toBe(true);
    expect(windowsOverlap(a, { startTime: "08:00", endTime: "09:01" })).toBe(true);
  });
});

describe("generateSlots", () => {
  const base = {
    date: MONDAY,
    timezone: TZ,
    windows: [{ startTime: "09:00", endTime: "11:00" }],
    durationMin: 60,
    bufferMin: 0,
    busy: [],
    now: new Date("2030-01-01T00:00:00Z"),
  };
  const localTimes = (slots: { startAt: Date }[]) =>
    slots.map((s) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(s.startAt));

  it("generates slots on the step grid that finish inside the window", () => {
    const slots = generateSlots(base);
    // 09:00, 09:15, ..., 10:00 (10:00-11:00 ends exactly at window end). 10:15 would overrun.
    expect(localTimes(slots)[0]).toBe("09:00");
    expect(localTimes(slots).at(-1)).toBe("10:00");
    expect(slots).toHaveLength(5);
  });

  it("respects a custom step size", () => {
    const slots = generateSlots({ ...base, stepMin: 30 });
    expect(localTimes(slots)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("returns nothing when the service is longer than the window", () => {
    expect(generateSlots({ ...base, durationMin: 180 })).toEqual([]);
  });

  it("excludes slots starting before now", () => {
    const slots = generateSlots({ ...base, now: new Date(localToUtc(MONDAY, "09:30", TZ)) });
    expect(localTimes(slots)[0]).toBe("09:30");
  });

  it("excludes slots that conflict with busy bookings, including buffers", () => {
    const busy = [
      {
        startAt: localToUtc(MONDAY, "09:00", TZ),
        endAt: localToUtc(MONDAY, "10:00", TZ),
        bufferMin: 15,
      },
    ];
    // The existing booking occupies 09:00-10:15 (buffer included). In a 09:00-11:00 window every start
    // up to 10:00 overlaps it, and 10:15 would run past 11:00, so nothing is free.
    expect(generateSlots({ ...base, busy, bufferMin: 0 })).toEqual([]);

    // In a 09:00-12:00 window the free starts are 10:15 through 11:00.
    const wider = generateSlots({ ...base, windows: [{ startTime: "09:00", endTime: "12:00" }], busy, bufferMin: 0 });
    expect(localTimes(wider)).toEqual(["10:15", "10:30", "10:45", "11:00"]);
  });

  it("de-duplicates slots from overlapping windows and sorts them", () => {
    const slots = generateSlots({
      ...base,
      windows: [
        { startTime: "10:00", endTime: "11:00" },
        { startTime: "09:00", endTime: "10:30" },
      ],
    });
    const times = slots.map((s) => s.startAt.getTime());
    expect(new Set(times).size).toBe(times.length);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("generateDaySlots keeps booked starts in the list, flagged, instead of dropping them", () => {
    const busy = [{ startAt: localToUtc(MONDAY, "09:00", TZ), endAt: localToUtc(MONDAY, "10:00", TZ), bufferMin: 0 }];
    const day = generateDaySlots({ ...base, busy });
    expect(localTimes(day)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
    // 09:00-45 all start inside the booking; 10:00 is the first start after it.
    expect(day.map((s) => s.booked)).toEqual([true, true, true, true, false]);
  });

  it("keeps wall-clock times stable across the DST transition", () => {
    // 2031-03-09 is the spring-forward day. 09:00 local is EDT on that day, so it is 13:00 UTC.
    const slots = generateSlots({
      ...base,
      date: "2031-03-09",
      windows: [{ startTime: "09:00", endTime: "10:00" }],
    });
    expect(slots.map((s) => iso(s.startAt))).toEqual(["2031-03-09T13:00:00.000Z"]);
  });
});
