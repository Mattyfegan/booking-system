// Route-level tests. The session lookup is mocked (NextAuth needs a browser cookie). Everything else is real:
// validation, authz checks, the scheduling logic, and error-to-status mapping. Runs against TEST_DATABASE_URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus, prisma, Role } from "@booking/db";
import { getSessionUser } from "@/lib/session";
import { localToUtc } from "@/lib/availability";
import { GET as getAvailability } from "../availability/route";
import { POST as postBooking } from "../bookings/route";
import { POST as cancelRoute } from "../bookings/[id]/cancel/route";
import { GET as listRules, POST as createRule } from "../manage/availability/rules/route";
import { PATCH as patchRule } from "../manage/availability/rules/[ruleId]/route";
import { GET as listServices, POST as createService } from "../manage/services/route";
import { PATCH as patchBookingOutcome } from "../manage/bookings/[bookingId]/route";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));

const RUN = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TZ = "America/New_York";
const DATE = "2031-04-07"; // Monday, EDT
const URL_BASE = "http://localhost:3000";

let owner: { id: string };
let customer: { id: string };
let otherCustomer: { id: string };
let serviceId: string;

const asUser = (u: { id: string } | null, role?: Role) =>
  vi.mocked(getSessionUser).mockResolvedValue(u && role ? { id: u.id, role } : null);

const jsonRequest = (path: string, method: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ctx = (params: Record<string, string>) => ({ params }) as never;

beforeAll(async () => {
  await prisma.availabilityRule.deleteMany();
  await prisma.availabilityOverride.deleteMany();
  const existing = await prisma.business.findFirst();
  if (existing) {
    await prisma.business.update({ where: { id: existing.id }, data: { timezone: TZ } });
  } else {
    await prisma.business.create({ data: { name: "Riverside Barbers", timezone: TZ } });
  }

  owner = await prisma.user.create({
    data: { email: `ro-${RUN}@test.local`, name: "Route Owner", role: Role.BUSINESS_OWNER },
  });
  customer = await prisma.user.create({
    data: { email: `rc-${RUN}@test.local`, name: "Route Customer", role: Role.CUSTOMER },
  });
  otherCustomer = await prisma.user.create({
    data: { email: `rc2-${RUN}@test.local`, name: "Route Customer 2", role: Role.CUSTOMER },
  });

  const service = await prisma.service.create({
    data: { name: `Trim ${RUN}`, durationMin: 30, priceCents: 1000, bufferMin: 0 },
  });
  serviceId = service.id;

  await prisma.availabilityRule.create({
    data: { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }, // Monday
  });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { serviceId } });
  await prisma.service.deleteMany({ where: { id: serviceId } });
  await prisma.availabilityRule.deleteMany();
  const ids = [owner?.id, customer?.id, otherCustomer?.id].filter(Boolean) as string[];
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
});

describe("GET /api/availability", () => {
  it("rejects a malformed date with 400", async () => {
    const res = await getAvailability(new Request(`${URL_BASE}/api/availability?serviceId=${serviceId}&date=2031-02-30`));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown service", async () => {
    const res = await getAvailability(new Request(`${URL_BASE}/api/availability?serviceId=nope&date=${DATE}`));
    expect(res.status).toBe(404);
  });

  it("is public and returns slots in business-local time", async () => {
    const res = await getAvailability(new Request(`${URL_BASE}/api/availability?serviceId=${serviceId}&date=${DATE}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timezone).toBe(TZ);
    expect(body.slots[0].localTime).toBe("09:00");
    expect(body.slots[0].startAt).toBe(localToUtc(DATE, "09:00", TZ).toISOString());
  });
});

describe("POST /api/bookings", () => {
  const body = () => ({
    serviceId,
    startAt: localToUtc(DATE, "10:00", TZ).toISOString(),
  });

  it("returns 401 without a session", async () => {
    asUser(null);
    const res = await postBooking(jsonRequest("/api/bookings", "POST", body()));
    expect(res.status).toBe(401);
  });

  it("returns 403 for the business owner", async () => {
    asUser(owner, Role.BUSINESS_OWNER);
    const res = await postBooking(jsonRequest("/api/bookings", "POST", body()));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    asUser(customer, Role.CUSTOMER);
    const res = await postBooking(jsonRequest("/api/bookings", "POST", { ...body(), startAt: "tomorrow" }));
    expect(res.status).toBe(400);
  });

  it("creates a booking for a customer and returns 409 when the slot is taken", async () => {
    asUser(customer, Role.CUSTOMER);
    const first = await postBooking(jsonRequest("/api/bookings", "POST", body()));
    expect(first.status).toBe(201);
    const json = await first.json();
    expect(json.booking.status).toBe(BookingStatus.CONFIRMED);
    expect(json.booking.customerId).toBe(customer.id);

    asUser(otherCustomer, Role.CUSTOMER);
    const second = await postBooking(jsonRequest("/api/bookings", "POST", body()));
    expect(second.status).toBe(409);
  });
});

describe("POST /api/bookings/:id/cancel", () => {
  it("returns 403 when a different customer tries to cancel", async () => {
    const booking = await prisma.booking.create({
      data: {
        serviceId,
        customerId: customer.id,
        startAt: localToUtc(DATE, "11:00", TZ),
        endAt: localToUtc(DATE, "11:30", TZ),
      },
    });

    asUser(otherCustomer, Role.CUSTOMER);
    const res = await cancelRoute(jsonRequest(`/api/bookings/${booking.id}/cancel`, "POST"), ctx({ id: booking.id }));
    expect(res.status).toBe(403);

    asUser(customer, Role.CUSTOMER);
    const ok = await cancelRoute(jsonRequest(`/api/bookings/${booking.id}/cancel`, "POST"), ctx({ id: booking.id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).booking.status).toBe(BookingStatus.CANCELLED);
  });
});

describe("PATCH /api/manage/bookings/:id", () => {
  const outcome = (id: string, status: string) =>
    patchBookingOutcome(jsonRequest(`/api/manage/bookings/${id}`, "PATCH", { status }), ctx({ bookingId: id }));

  it("returns 403 for a customer and 400 for an invalid status", async () => {
    const past = await prisma.booking.create({
      data: {
        serviceId,
        customerId: customer.id,
        startAt: localToUtc("2020-01-06", "09:00", TZ),
        endAt: localToUtc("2020-01-06", "09:30", TZ),
      },
    });

    asUser(customer, Role.CUSTOMER);
    expect((await outcome(past.id, "COMPLETED")).status).toBe(403);

    asUser(owner, Role.BUSINESS_OWNER);
    expect((await outcome(past.id, "CANCELLED")).status).toBe(400);
  });

  it("refuses an upcoming booking, then marks a started one exactly once", async () => {
    asUser(owner, Role.BUSINESS_OWNER);
    const upcoming = await prisma.booking.create({
      data: {
        serviceId,
        customerId: customer.id,
        startAt: localToUtc(DATE, "15:00", TZ),
        endAt: localToUtc(DATE, "15:30", TZ),
      },
    });
    expect((await outcome(upcoming.id, "NO_SHOW")).status).toBe(409);

    const started = await prisma.booking.create({
      data: {
        serviceId,
        customerId: customer.id,
        startAt: localToUtc("2020-01-06", "10:00", TZ),
        endAt: localToUtc("2020-01-06", "10:30", TZ),
      },
    });
    const first = await outcome(started.id, "NO_SHOW");
    expect(first.status).toBe(200);
    expect((await first.json()).booking.status).toBe(BookingStatus.NO_SHOW);

    const again = await outcome(started.id, "COMPLETED");
    expect(again.status).toBe(409);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: started.id } })).status).toBe(BookingStatus.NO_SHOW);
  });
});

describe("manage routes", () => {
  it("returns 403 for a customer on services and availability", async () => {
    asUser(customer, Role.CUSTOMER);
    expect((await listServices()).status).toBe(403);
    expect((await listRules()).status).toBe(403);
    const created = await createService(jsonRequest("/api/manage/services", "POST", { name: "X", durationMin: 30, priceCents: 0 }));
    expect(created.status).toBe(403);
  });

  it("lets the owner add a service", async () => {
    asUser(owner, Role.BUSINESS_OWNER);
    const res = await createService(
      jsonRequest("/api/manage/services", "POST", { name: `Extra ${RUN}`, durationMin: 45, priceCents: 2000 }),
    );
    expect(res.status).toBe(201);
    const created = (await res.json()).service;
    await prisma.service.delete({ where: { id: created.id } });
  });

  it("lets the owner add a rule, rejects an overlapping one, and validates PATCH", async () => {
    asUser(owner, Role.BUSINESS_OWNER);

    const created = await createRule(
      jsonRequest("/api/manage/availability/rules", "POST", { dayOfWeek: 3, startTime: "09:00", endTime: "10:00" }),
    );
    expect(created.status).toBe(201);
    const { rule } = await created.json();

    const overlapping = await createRule(
      jsonRequest("/api/manage/availability/rules", "POST", { dayOfWeek: 3, startTime: "09:30", endTime: "11:00" }),
    );
    expect(overlapping.status).toBe(409);

    const inverted = await createRule(
      jsonRequest("/api/manage/availability/rules", "POST", { dayOfWeek: 4, startTime: "12:00", endTime: "09:00" }),
    );
    expect(inverted.status).toBe(400);

    const badPatch = await patchRule(
      jsonRequest(`/api/manage/availability/rules/${rule.id}`, "PATCH", { endTime: "08:00" }),
      ctx({ ruleId: rule.id }),
    );
    expect(badPatch.status).toBe(400);

    const list = await listRules();
    expect(list.status).toBe(200);
    expect((await list.json()).rules.length).toBeGreaterThanOrEqual(2);
  });
});
