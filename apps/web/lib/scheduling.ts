import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { BookingStatus, prisma, type Prisma } from "@booking/db";
import { assertCanManageBusiness, HttpError, type SessionUser } from "./authz";
import {
  generateSlots,
  localToUtc,
  windowsForDate,
  windowsOverlap,
  type BusyBooking,
  type Slot,
  type TimeWindow,
  type WeeklyRule,
} from "./availability";

// Database-backed scheduling. Pure rules live in ./availability.ts.

type Db = Prisma.TransactionClient;
type BusinessRow = { id: string; timezone: string };
type ServiceRow = { id: string; durationMin: number; bufferMin: number };

// Computes the free slots for one local date. Runs on either the root client or a transaction client,
// so booking creation can reuse the exact same logic under its lock.
async function computeDaySlots(
  db: Db,
  business: BusinessRow,
  service: ServiceRow,
  date: string,
  now: Date,
): Promise<Slot[]> {
  const dayStart = localToUtc(date, "00:00", business.timezone);
  // A booking lasts at most 480 minutes, so a one-day margin on each side covers every booking that can reach this day.
  const busyFrom = addDays(dayStart, -1);
  const busyTo = addDays(dayStart, 2);

  const rules: WeeklyRule[] = await db.availabilityRule.findMany({
    where: { businessId: business.id },
    select: { dayOfWeek: true, startTime: true, endTime: true },
  });

  const override = await db.availabilityOverride.findUnique({
    where: { businessId_date: { businessId: business.id, date: new Date(`${date}T00:00:00.000Z`) } },
    select: { isClosed: true, startTime: true, endTime: true },
  });

  const bookings = await db.booking.findMany({
    where: {
      businessId: business.id,
      status: BookingStatus.CONFIRMED,
      startAt: { gte: busyFrom, lt: busyTo },
    },
    select: { startAt: true, endAt: true, service: { select: { bufferMin: true } } },
  });

  const busy: BusyBooking[] = bookings.map((b) => ({
    startAt: b.startAt,
    endAt: b.endAt,
    bufferMin: b.service.bufferMin,
  }));

  return generateSlots({
    date,
    timezone: business.timezone,
    windows: windowsForDate(date, rules, override),
    durationMin: service.durationMin,
    bufferMin: service.bufferMin,
    busy,
    now,
  });
}

export async function getAvailableSlots(businessId: string, serviceId: string, date: string, now = new Date()) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new HttpError(404, "Business not found");

  const service = await prisma.service.findFirst({ where: { id: serviceId, businessId, isActive: true } });
  if (!service) throw new HttpError(404, "Service not found");

  const slots = await computeDaySlots(prisma, business, service, date, now);
  return {
    businessId,
    serviceId,
    date,
    timezone: business.timezone,
    slots: slots.map((s) => ({
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      localTime: formatInTimeZone(s.startAt, business.timezone, "HH:mm"),
    })),
  };
}

export type CreateBookingInput = {
  customerId: string;
  businessId: string;
  serviceId: string;
  startAt: Date;
  notes?: string | null;
  now?: Date;
};

// Double-booking prevention:
//  1. Lock the business row (SELECT ... FOR UPDATE). Concurrent bookings for the same business queue here.
//  2. Once the lock is granted, the committed bookings from the winning transaction are visible.
//  3. Recompute slots and require the requested start to be one of them. This checks the weekly rules,
//     overrides, buffers, past times and existing bookings in one place.
//  4. Insert, then commit. The lock is released on commit.
export async function createBooking(input: CreateBookingInput) {
  const now = input.now ?? new Date();

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${input.businessId} FOR UPDATE`;

      const business = await tx.business.findUnique({ where: { id: input.businessId } });
      if (!business) throw new HttpError(404, "Business not found");

      const service = await tx.service.findFirst({
        where: { id: input.serviceId, businessId: input.businessId, isActive: true },
      });
      if (!service) throw new HttpError(404, "Service not found");

      const date = formatInTimeZone(input.startAt, business.timezone, "yyyy-MM-dd");
      const slots = await computeDaySlots(tx, business, service, date, now);
      const isAvailable = slots.some((s) => s.startAt.getTime() === input.startAt.getTime());
      if (!isAvailable) throw new HttpError(409, "That time is no longer available");

      return tx.booking.create({
        data: {
          businessId: input.businessId,
          serviceId: input.serviceId,
          customerId: input.customerId,
          startAt: input.startAt,
          endAt: addMinutes(input.startAt, service.durationMin),
          notes: input.notes ?? null,
          status: BookingStatus.CONFIRMED,
        },
      });
    },
    { timeout: 10_000 },
  );
}

// Customers may cancel their own bookings. Owners of the business and ADMIN may cancel any booking there.
export async function cancelBooking(bookingId: string, user: SessionUser, now = new Date()) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { business: { select: { ownerId: true } } },
  });
  if (!booking) throw new HttpError(404, "Booking not found");

  if (booking.customerId !== user.id) {
    assertCanManageBusiness(user, booking.business);
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new HttpError(409, `Booking is already ${booking.status.toLowerCase()}`);
  }
  if (booking.startAt.getTime() < now.getTime()) {
    throw new HttpError(409, "Past bookings cannot be cancelled");
  }

  // Conditional update: if a concurrent request already changed the status, count is 0 and we do not double-cancel.
  const { count } = await prisma.booking.updateMany({
    where: { id: bookingId, status: BookingStatus.CONFIRMED },
    data: { status: BookingStatus.CANCELLED, cancelledAt: now },
  });
  if (count === 0) throw new HttpError(409, "Booking was changed by another request");

  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

// Rejects a weekly rule that overlaps another rule on the same weekday.
export async function assertNoRuleOverlap(
  businessId: string,
  dayOfWeek: number,
  window: TimeWindow,
  excludeRuleId?: string,
): Promise<void> {
  const sameDay = await prisma.availabilityRule.findMany({
    where: { businessId, dayOfWeek, ...(excludeRuleId && { id: { not: excludeRuleId } }) },
    select: { startTime: true, endTime: true },
  });
  if (sameDay.some((r) => windowsOverlap(r, window))) {
    throw new HttpError(409, "This rule overlaps an existing rule for the same day");
  }
}
