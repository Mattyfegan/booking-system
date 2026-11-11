// Integration tests: require Postgres. They run against TEST_DATABASE_URL (see vitest.config.ts) and
// remove every row they create, so they never touch the live Riverside Barbers data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BookingStatus, prisma, Role } from "@booking/db";
import { HttpError, type SessionUser } from "../authz";
import { localToUtc } from "../availability";
import { cancelBooking, createBooking, getAvailableSlots } from "../scheduling";

const TZ = "America/New_York";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Dates are far in the future so the "not in the past" rule never interferes.
// 2031-03-09 is the US spring-forward day (EST -> EDT at 02:00).
const DATES = {
  dst: "2031-03-09",
  closed: "2031-03-08",
  overrideHours: "2031-03-14",
  book: "2031-03-10",
  buffer: "2031-03-16",
  grid: "2031-03-17",
  concurrentSame: "2031-03-11",
  concurrentDiff: "2031-03-18",
  cancelCustomer: "2031-03-12",
  cancelOwner: "2031-03-13",
  cancelPast: "2031-03-19",
  cancelTwice: "2031-03-20",
} as const;

let owner: { id: string };
let customer: { id: string };
let otherCustomer: { id: string };
let serviceId: string;

const sessionUser = (u: { id: string }, role: Role): SessionUser => ({ id: u.id, role });
const at = (date: string, hhmm: string) => localToUtc(date, hhmm, TZ);

async function book(date: string, hhmm: string, who = customer, now?: Date) {
  return createBooking({ customerId: who.id, serviceId, startAt: at(date, hhmm), now });
}

async function expectHttpError(promise: Promise<unknown>, status: number) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
}

beforeAll(async () => {
  // The test database starts empty except for the business row, so wipe any leftover schedule first.
  await prisma.availabilityRule.deleteMany();
  await prisma.availabilityOverride.deleteMany();
  const existing = await prisma.business.findFirst();
  if (existing) {
    await prisma.business.update({ where: { id: existing.id }, data: { timezone: TZ } });
  } else {
    await prisma.business.create({ data: { name: "Riverside Barbers", timezone: TZ } });
  }

  owner = await prisma.user.create({
    data: { email: `owner-${RUN}@test.local`, name: "Test Owner", role: Role.BUSINESS_OWNER },
  });
  customer = await prisma.user.create({
    data: { email: `cust-${RUN}@test.local`, name: "Test Customer", role: Role.CUSTOMER },
  });
  otherCustomer = await prisma.user.create({
    data: { email: `other-${RUN}@test.local`, name: "Other Customer", role: Role.CUSTOMER },
  });

  // 60-minute service with a 10-minute buffer.
  const service = await prisma.service.create({
    data: { name: `Cut ${RUN}`, durationMin: 60, priceCents: 1500, bufferMin: 10 },
  });
  serviceId = service.id;

  // Open 09:00-12:00 every day of the week.
  await prisma.availabilityRule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "12:00" })),
  });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { serviceId } });
  await prisma.service.deleteMany({ where: { id: serviceId } }); // inactive services created by tests are removed here too
  await prisma.availabilityRule.deleteMany();
  await prisma.availabilityOverride.deleteMany();
  const ids = [owner?.id, customer?.id, otherCustomer?.id].filter(Boolean) as string[];
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("getAvailableSlots", () => {
  it("returns every step-aligned start where the full service fits inside the open hours", async () => {
    const result = await getAvailableSlots(serviceId, DATES.book);
    const times = result.slots.map((s) => s.localTime);
    // 60-min service in a 09:00-12:00 window, 15-min steps: 09:00 through 11:00.
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("11:00");
    expect(times).toHaveLength(9);
    expect(result.timezone).toBe(TZ);
  });

  it("returns 404 for an unknown service or an inactive one", async () => {
    await expectHttpError(getAvailableSlots("does-not-exist", DATES.book), 404);

    const inactive = await prisma.service.create({
      data: { name: "Hidden", durationMin: 30, priceCents: 0, isActive: false },
    });
    await expectHttpError(getAvailableSlots(inactive.id, DATES.book), 404);
    await prisma.service.delete({ where: { id: inactive.id } });
  });
});

describe("createBooking", () => {
  it("books the requested slot with the service duration as endAt", async () => {
    const booking = await book(DATES.book, "09:00");
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(booking.startAt.toISOString()).toBe(at(DATES.book, "09:00").toISOString());
    expect(booking.endAt.toISOString()).toBe(at(DATES.book, "10:00").toISOString());
  });

  it("removes overlapping slots including the buffer, then allows the first slot after it", async () => {
    await book(DATES.buffer, "09:00"); // occupies 09:00-10:10 with the 10-minute buffer

    const times = (await getAvailableSlots(serviceId, DATES.buffer)).slots.map((s) => s.localTime);
    expect(times).not.toContain("09:00");
    expect(times).not.toContain("09:15");
    expect(times).not.toContain("10:00"); // would overlap the buffer
    expect(times).toContain("10:15");

    await expectHttpError(book(DATES.buffer, "09:30"), 409);
    await expectHttpError(book(DATES.buffer, "10:00"), 409);
    await expect(book(DATES.buffer, "10:15")).resolves.toBeTruthy();
  });

  it("rejects starts off the step grid, outside open hours, or in the past", async () => {
    await expectHttpError(book(DATES.grid, "09:07"), 409); // not a 15-minute boundary
    await expectHttpError(book(DATES.grid, "13:00"), 409); // after closing
    await expectHttpError(book(DATES.grid, "09:00", customer, at(DATES.grid, "09:30")), 409); // already past
  });

  it("rejects a past start using the real clock, as the HTTP route does", async () => {
    // The route never injects `now`, so this exercises the default clock path that customers hit.
    await expectHttpError(createBooking({ customerId: customer.id, serviceId, startAt: at("2020-01-06", "09:00") }), 409);
  });

  it("uses the business timezone across the DST transition", async () => {
    // 09:00 on the spring-forward day is EDT (UTC-4), so 13:00Z, not 14:00Z.
    const booking = await book(DATES.dst, "09:00");
    expect(booking.startAt.toISOString()).toBe("2031-03-09T13:00:00.000Z");

    const slot = (await getAvailableSlots(serviceId, DATES.dst)).slots[0];
    expect(slot.localTime).toBe("10:15"); // 09:00 is taken; the next free start is after the 10-minute buffer
  });

  it("rejects every slot on a closed override day", async () => {
    await prisma.availabilityOverride.create({
      data: { date: new Date(`${DATES.closed}T00:00:00.000Z`), isClosed: true },
    });

    const result = await getAvailableSlots(serviceId, DATES.closed);
    expect(result.slots).toEqual([]);
    await expectHttpError(book(DATES.closed, "09:00"), 409);
  });

  it("uses override hours instead of the weekly rules on that date", async () => {
    await prisma.availabilityOverride.create({
      data: {
        date: new Date(`${DATES.overrideHours}T00:00:00.000Z`),
        isClosed: false,
        startTime: "10:00",
        endTime: "11:00",
      },
    });

    const times = (await getAvailableSlots(serviceId, DATES.overrideHours)).slots.map((s) => s.localTime);
    expect(times).toEqual(["10:00"]); // a 60-minute service only fits once in a 10:00-11:00 window
    await expectHttpError(book(DATES.overrideHours, "09:00"), 409);
    await expect(book(DATES.overrideHours, "10:00")).resolves.toBeTruthy();
  });

  it("lets exactly one of many concurrent bookings for the same slot succeed", async () => {
    const attempts = 10;
    const requests = Array.from({ length: attempts }, () => book(DATES.concurrentSame, "09:00"));
    const results = await Promise.allSettled(requests);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(attempts - 1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(HttpError);
      expect((r.reason as HttpError).status).toBe(409);
    }

    const stored = await prisma.booking.count({
      where: { serviceId, startAt: at(DATES.concurrentSame, "09:00"), status: BookingStatus.CONFIRMED },
    });
    expect(stored).toBe(1);
  });

  it("allows concurrent bookings for different slots", async () => {
    // 09:00 occupies until 10:10 (60 min + 10 min buffer), so 10:15 is the first non-conflicting start after it.
    const results = await Promise.allSettled([
      book(DATES.concurrentDiff, "09:00"),
      book(DATES.concurrentDiff, "10:15"),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});

describe("cancelBooking", () => {
  it("lets the customer cancel, sets CANCELLED, and frees the slot", async () => {
    const booking = await book(DATES.cancelCustomer, "09:00");
    const before = (await getAvailableSlots(serviceId, DATES.cancelCustomer)).slots.map((s) => s.localTime);
    expect(before).not.toContain("09:00");

    const cancelled = await cancelBooking(booking.id, sessionUser(customer, Role.CUSTOMER));
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);

    const after = (await getAvailableSlots(serviceId, DATES.cancelCustomer)).slots.map((s) => s.localTime);
    expect(after).toContain("09:00");
    await expect(book(DATES.cancelCustomer, "09:00")).resolves.toBeTruthy();
  });

  it("lets the business owner cancel a customer's booking", async () => {
    const booking = await book(DATES.cancelOwner, "09:00");
    const cancelled = await cancelBooking(booking.id, sessionUser(owner, Role.BUSINESS_OWNER));
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
  });

  it("forbids a different customer from cancelling", async () => {
    const booking = await book(DATES.cancelOwner, "10:00");
    await expectHttpError(cancelBooking(booking.id, sessionUser(otherCustomer, Role.CUSTOMER)), 403);
    const stillConfirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stillConfirmed.status).toBe(BookingStatus.CONFIRMED);
  });

  it("refuses to cancel a booking that is already cancelled", async () => {
    const booking = await book(DATES.cancelTwice, "09:00");
    const me = sessionUser(customer, Role.CUSTOMER);
    await cancelBooking(booking.id, me);
    await expectHttpError(cancelBooking(booking.id, me), 409);
  });

  it("refuses to cancel a booking whose start time has passed", async () => {
    const booking = await book(DATES.cancelPast, "09:00");
    const afterStart = at(DATES.cancelPast, "09:30");
    await expectHttpError(cancelBooking(booking.id, sessionUser(customer, Role.CUSTOMER), afterStart), 409);
  });

  it("returns 404 for an unknown booking", async () => {
    await expectHttpError(cancelBooking("missing-id", sessionUser(customer, Role.CUSTOMER)), 404);
  });
});
