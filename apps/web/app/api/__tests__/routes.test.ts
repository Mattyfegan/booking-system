// Route-level tests. The session lookup is mocked (NextAuth needs a browser cookie). Everything else is real:
// validation, authz checks, the scheduling logic, and error-to-status mapping. Requires the Postgres instance.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus, prisma, Role } from "@booking/db";
import { getSessionUser } from "@/lib/session";
import { localToUtc } from "@/lib/availability";
import { GET as getAvailability } from "../availability/route";
import { POST as postBooking } from "../bookings/route";
import { POST as cancelRoute } from "../bookings/[id]/cancel/route";
import { GET as listRules, POST as createRule } from "../businesses/[id]/availability/rules/route";
import { PATCH as patchRule } from "../businesses/[id]/availability/rules/[ruleId]/route";

vi.mock("@/lib/session", async () => {
  const { prisma: db } = await import("@booking/db");
  const { assertCanManageBusiness, HttpError } = await import("@/lib/authz");
  return {
    getSessionUser: vi.fn(),
    loadManagedBusiness: async (businessId: string, user: { id: string; role: string }) => {
      const business = await db.business.findUnique({ where: { id: businessId } });
      if (!business) throw new HttpError(404, "Business not found");
      assertCanManageBusiness(user as never, business);
      return business;
    },
  };
});

const RUN = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TZ = "America/New_York";
const DATE = "2031-04-07"; // Monday, EDT
const URL_BASE = "http://localhost:3000";

let owner: { id: string };
let otherOwner: { id: string };
let customer: { id: string };
let otherCustomer: { id: string };
let businessId: string;
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
  owner = await prisma.user.create({
    data: { email: `ro-${RUN}@test.local`, name: "Route Owner", role: Role.BUSINESS_OWNER },
  });
  otherOwner = await prisma.user.create({
    data: { email: `ro2-${RUN}@test.local`, name: "Other Owner", role: Role.BUSINESS_OWNER },
  });
  customer = await prisma.user.create({
    data: { email: `rc-${RUN}@test.local`, name: "Route Customer", role: Role.CUSTOMER },
  });
  otherCustomer = await prisma.user.create({
    data: { email: `rc2-${RUN}@test.local`, name: "Route Customer 2", role: Role.CUSTOMER },
  });

  const business = await prisma.business.create({
    data: { name: "Route Salon", slug: `route-${RUN}`, ownerId: owner.id, timezone: TZ },
  });
  businessId = business.id;

  const service = await prisma.service.create({
    data: { businessId, name: "Trim", durationMin: 30, priceCents: 1000, bufferMin: 0 },
  });
  serviceId = service.id;

  await prisma.availabilityRule.create({
    data: { businessId, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }, // Monday
  });
});

afterAll(async () => {
  if (businessId) {
    await prisma.booking.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  }
  const ids = [owner?.id, otherOwner?.id, customer?.id, otherCustomer?.id].filter(Boolean) as string[];
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
});

describe("GET /api/availability", () => {
  it("rejects a malformed date with 400", async () => {
    const res = await getAvailability(
      new Request(`${URL_BASE}/api/availability?businessId=${businessId}&serviceId=${serviceId}&date=2031-02-30`),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown business", async () => {
    const res = await getAvailability(
      new Request(`${URL_BASE}/api/availability?businessId=nope&serviceId=${serviceId}&date=${DATE}`),
    );
    expect(res.status).toBe(404);
  });

  it("is public and returns slots in business-local time", async () => {
    const res = await getAvailability(
      new Request(`${URL_BASE}/api/availability?businessId=${businessId}&serviceId=${serviceId}&date=${DATE}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timezone).toBe(TZ);
    expect(body.slots[0].localTime).toBe("09:00");
    expect(body.slots[0].startAt).toBe(localToUtc(DATE, "09:00", TZ).toISOString());
  });
});

describe("POST /api/bookings", () => {
  const body = () => ({
    businessId,
    serviceId,
    startAt: localToUtc(DATE, "10:00", TZ).toISOString(),
  });

  it("returns 401 without a session", async () => {
    asUser(null);
    const res = await postBooking(jsonRequest("/api/bookings", "POST", body()));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a business owner", async () => {
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
        businessId,
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

describe("availability rule management", () => {
  it("returns 403 for a customer", async () => {
    asUser(customer, Role.CUSTOMER);
    const res = await listRules(jsonRequest(`/api/businesses/${businessId}/availability/rules`, "GET"), ctx({ id: businessId }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for an owner of a different business", async () => {
    asUser(otherOwner, Role.BUSINESS_OWNER);
    const res = await createRule(
      jsonRequest(`/api/businesses/${businessId}/availability/rules`, "POST", { dayOfWeek: 2, startTime: "09:00", endTime: "10:00" }),
      ctx({ id: businessId }),
    );
    expect(res.status).toBe(403);
  });

  it("lets the owner add a rule, rejects an overlapping one, and validates PATCH", async () => {
    asUser(owner, Role.BUSINESS_OWNER);

    const created = await createRule(
      jsonRequest(`/api/businesses/${businessId}/availability/rules`, "POST", { dayOfWeek: 3, startTime: "09:00", endTime: "10:00" }),
      ctx({ id: businessId }),
    );
    expect(created.status).toBe(201);
    const { rule } = await created.json();

    const overlapping = await createRule(
      jsonRequest(`/api/businesses/${businessId}/availability/rules`, "POST", { dayOfWeek: 3, startTime: "09:30", endTime: "11:00" }),
      ctx({ id: businessId }),
    );
    expect(overlapping.status).toBe(409);

    const inverted = await createRule(
      jsonRequest(`/api/businesses/${businessId}/availability/rules`, "POST", { dayOfWeek: 4, startTime: "12:00", endTime: "09:00" }),
      ctx({ id: businessId }),
    );
    expect(inverted.status).toBe(400);

    const badPatch = await patchRule(
      jsonRequest(`/api/businesses/${businessId}/availability/rules/${rule.id}`, "PATCH", { endTime: "08:00" }),
      ctx({ id: businessId, ruleId: rule.id }),
    );
    expect(badPatch.status).toBe(400);

    const list = await listRules(jsonRequest(`/api/businesses/${businessId}/availability/rules`, "GET"), ctx({ id: businessId }));
    expect(list.status).toBe(200);
    expect((await list.json()).rules.length).toBeGreaterThanOrEqual(2);
  });
});
