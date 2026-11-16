// Reminder queue tests against TEST_DATABASE_URL. Email sending is mocked; everything else is real.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus, prisma, Role } from "@booking/db";
import { sendEmail } from "@/lib/email";
import { needsReminder, REMINDER_LEAD_HOURS, sendDueReminders } from "@/lib/reminders";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => "sent" as const) }));

const RUN = `rm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const HOUR = 60 * 60 * 1000;
// A fixed instant far from any other test data in the database.
const NOW = new Date("2030-06-01T12:00:00.000Z");

let customer: { id: string; email: string };
let serviceId: string;
let created: string[] = [];

async function makeBooking(startOffsetH: number, extra: { status?: BookingStatus; reminderSentAt?: Date } = {}) {
  const startAt = new Date(NOW.getTime() + startOffsetH * HOUR);
  const booking = await prisma.booking.create({
    data: {
      serviceId,
      customerId: customer.id,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: extra.status ?? BookingStatus.CONFIRMED,
      reminderSentAt: extra.reminderSentAt ?? null,
    },
  });
  created.push(booking.id);
  return booking.id;
}

beforeAll(async () => {
  const business = await prisma.business.findFirst();
  if (!business) await prisma.business.create({ data: { name: "Riverside Barbers", timezone: "UTC" } });

  customer = await prisma.user.create({
    data: { email: `rm-${RUN}@test.local`, name: "Reminder Customer", role: Role.CUSTOMER },
  });
  const service = await prisma.service.create({
    data: { name: `Reminder ${RUN}`, durationMin: 30, priceCents: 1000, bufferMin: 0 },
  });
  serviceId = service.id;
});

beforeEach(() => {
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue("sent");
});

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { id: { in: created } } });
  created = [];
});

describe("needsReminder", () => {
  it("is true only when the booking starts more than the lead time away", () => {
    const lead = REMINDER_LEAD_HOURS * HOUR;
    expect(needsReminder(new Date(NOW.getTime() + lead + 1), NOW)).toBe(true);
    expect(needsReminder(new Date(NOW.getTime() + lead), NOW)).toBe(false);
    expect(needsReminder(new Date(NOW.getTime() + 2 * HOUR), NOW)).toBe(false);
  });
});

describe("sendDueReminders", () => {
  it("sends once for each confirmed booking starting within 24 hours, and nothing else", async () => {
    const soon = await makeBooking(2);
    const late = await makeBooking(23);
    const beyond = await makeBooking(25);
    const past = await makeBooking(-1);
    const cancelled = await makeBooking(5, { status: BookingStatus.CANCELLED });

    const result = await sendDueReminders(NOW);

    expect(result).toEqual({ due: 2, sent: 2, skipped: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendEmail).mock.calls.every(([opts]) => opts.to === customer.email)).toBe(true);

    const rows = await prisma.booking.findMany({ where: { id: { in: [soon, late, beyond, past, cancelled] } } });
    const sentAt = Object.fromEntries(rows.map((r) => [r.id, r.reminderSentAt]));
    expect(sentAt[soon]).toEqual(NOW);
    expect(sentAt[late]).toEqual(NOW);
    expect(sentAt[beyond]).toBeNull();
    expect(sentAt[past]).toBeNull();
    expect(sentAt[cancelled]).toBeNull();
  });

  it("does not send a second reminder on a repeat run", async () => {
    await makeBooking(3);
    await sendDueReminders(NOW);
    vi.mocked(sendEmail).mockClear();

    const second = await sendDueReminders(NOW);

    expect(second.due).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not remind a booking that was already marked at creation", async () => {
    await makeBooking(4, { reminderSentAt: new Date(NOW.getTime() - HOUR) });

    const result = await sendDueReminders(NOW);

    expect(result.due).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim when sending fails, so the next run retries", async () => {
    const id = await makeBooking(6);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await sendDueReminders(NOW);
    expect(first).toEqual({ due: 1, sent: 0, skipped: 0, failed: 1 });
    const afterFailure = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(afterFailure.reminderSentAt).toBeNull();

    const retry = await sendDueReminders(NOW);
    expect(retry).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    const afterRetry = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(afterRetry.reminderSentAt).toEqual(NOW);

    errorSpy.mockRestore();
  });
});
