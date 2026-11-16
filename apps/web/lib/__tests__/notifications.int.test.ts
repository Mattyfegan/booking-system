// Booking notification tests against TEST_DATABASE_URL. Resend is mocked; the templates and lookups are real.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus, prisma, Role } from "@booking/db";
import { sendEmail } from "../email";
import { notifyBookingCancelled, notifyBookingConfirmed, sendBookingReminder } from "../notifications";

vi.mock("../email", () => ({ sendEmail: vi.fn(async () => "sent" as const) }));

const RUN = `nt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const START = new Date("2030-07-02T21:00:00.000Z");

let customer: { id: string; email: string };
let serviceId: string;

beforeAll(async () => {
  const business = await prisma.business.findFirst();
  if (!business) await prisma.business.create({ data: { name: "Riverside Barbers", timezone: "Pacific/Auckland" } });

  customer = await prisma.user.create({
    data: { email: `nt-${RUN}@test.local`, name: "Notify Customer", role: Role.CUSTOMER },
  });
  const service = await prisma.service.create({
    data: { name: `Notify ${RUN}`, durationMin: 45, priceCents: 4000, bufferMin: 0 },
  });
  serviceId = service.id;
});

beforeEach(() => {
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue("sent");
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { customerId: customer.id } });
  await prisma.service.deleteMany({ where: { id: serviceId } });
  await prisma.user.deleteMany({ where: { id: customer.id } });
  await prisma.$disconnect();
});

async function freshBooking(status: BookingStatus = BookingStatus.CONFIRMED) {
  const booking = await prisma.booking.create({
    data: {
      serviceId,
      customerId: customer.id,
      startAt: START,
      endAt: new Date(START.getTime() + 45 * 60_000),
      status,
    },
  });
  return booking.id;
}

describe("notifyBookingConfirmed", () => {
  it("emails the customer", async () => {
    const id = await freshBooking();
    await notifyBookingConfirmed(id);

    const recipients = vi.mocked(sendEmail).mock.calls.map(([o]) => o.to);
    expect(recipients).toContain(customer.email);
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toMatch(/^Booking confirmed: Notify /);
  });

  it("never throws when the mail provider fails", async () => {
    const id = await freshBooking();
    vi.mocked(sendEmail).mockRejectedValue(new Error("resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyBookingConfirmed(id)).resolves.toBeUndefined();

    errorSpy.mockRestore();
  });
});

describe("notifyBookingCancelled", () => {
  it("emails the customer with a cancellation subject", async () => {
    const id = await freshBooking(BookingStatus.CANCELLED);
    await notifyBookingCancelled(id);

    const customerMail = vi.mocked(sendEmail).mock.calls.find(([o]) => o.to === customer.email);
    expect(customerMail?.[0].subject).toMatch(/^Booking cancelled: /);
  });
});

describe("sendBookingReminder", () => {
  it("sends one reminder to the customer", async () => {
    const id = await freshBooking();
    await sendBookingReminder(id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
      to: customer.email,
      subject: expect.stringMatching(/^Reminder: Notify /),
    });
  });

  it("rethrows provider failures so the cron job can retry", async () => {
    const id = await freshBooking();
    vi.mocked(sendEmail).mockRejectedValue(new Error("resend down"));
    await expect(sendBookingReminder(id)).rejects.toThrow("resend down");
  });
});
