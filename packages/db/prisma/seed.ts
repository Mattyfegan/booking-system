import bcrypt from "bcryptjs";
import { BookingStatus, PrismaClient, Role } from "../generated/client";

// Dev-only seed data for Riverside Barbers, the single business this system serves.
// Passwords are for local use only; override with SEED_PASSWORD.
// Safe to re-run: every block only creates rows that are missing, so existing bookings and edits are kept.
const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "password123";
const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_NAME = "Riverside Barbers";
const TIMEZONE = "UTC";

// 10:00 UTC on a day offset from today (negative = past).
function atTenUtc(dayOffset: number): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0));
  return new Date(d.getTime() + dayOffset * DAY_MS);
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  // Accounts. Only one owner: the shop's own login. ADMIN is for platform staff.
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { name: "Platform Admin", email: "admin@example.com", password: passwordHash, role: Role.ADMIN },
  });
  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: {
      name: "Riverside Barbers Owner",
      email: "owner@example.com",
      password: passwordHash,
      role: Role.BUSINESS_OWNER,
    },
  });
  const customer = await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: { name: "Sample Customer", email: "customer@example.com", password: passwordHash, role: Role.CUSTOMER },
  });

  // The business settings row (singleton).
  const existingBusiness = await prisma.business.findFirst();
  if (existingBusiness) {
    await prisma.business.update({
      where: { id: existingBusiness.id },
      data: { name: BUSINESS_NAME, timezone: TIMEZONE, description: "Traditional cuts and shaves, booked online." },
    });
  } else {
    await prisma.business.create({
      data: {
        name: BUSINESS_NAME,
        description: "Traditional cuts and shaves, booked online.",
        timezone: TIMEZONE,
      },
    });
  }

  // Services.
  let services = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });
  if (services.length === 0) {
    await prisma.service.createMany({
      data: [
        { name: "Haircut", durationMin: 30, priceCents: 3500, bufferMin: 0 },
        { name: "Beard trim", durationMin: 15, priceCents: 1500, bufferMin: 5 },
        { name: "Full service", durationMin: 60, priceCents: 6500, bufferMin: 10 },
      ],
    });
    services = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });
  }
  const [haircut, beard, full] = services;

  // Weekly opening hours (0 = Sunday ... 6 = Saturday). Without rules nothing is bookable.
  const ruleCount = await prisma.availabilityRule.count();
  if (ruleCount === 0) {
    const weekday = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "17:00" }));
    const saturday = { dayOfWeek: 6, startTime: "09:00", endTime: "13:00" };
    await prisma.availabilityRule.createMany({ data: [...weekday, saturday] });
  }

  // Bookings: two past completed, one past no-show, one cancelled, and three upcoming.
  const bookingCount = await prisma.booking.count();
  if (bookingCount === 0) {
    const base = { customerId: customer.id };
    await prisma.booking.createMany({
      data: [
        {
          ...base,
          serviceId: haircut.id,
          startAt: atTenUtc(-14),
          endAt: new Date(atTenUtc(-14).getTime() + 30 * 60_000),
          status: BookingStatus.COMPLETED,
        },
        {
          ...base,
          serviceId: full.id,
          startAt: atTenUtc(-7),
          endAt: new Date(atTenUtc(-7).getTime() + 60 * 60_000),
          status: BookingStatus.COMPLETED,
          notes: "Prefers a short back and sides.",
        },
        {
          ...base,
          serviceId: beard.id,
          startAt: atTenUtc(-2),
          endAt: new Date(atTenUtc(-2).getTime() + 15 * 60_000),
          status: BookingStatus.NO_SHOW,
        },
        {
          ...base,
          serviceId: haircut.id,
          startAt: atTenUtc(4),
          endAt: new Date(atTenUtc(4).getTime() + 30 * 60_000),
          status: BookingStatus.CANCELLED,
          cancelledAt: atTenUtc(3),
        },
        {
          ...base,
          serviceId: haircut.id,
          startAt: atTenUtc(1),
          endAt: new Date(atTenUtc(1).getTime() + 30 * 60_000),
          status: BookingStatus.CONFIRMED,
        },
        {
          ...base,
          serviceId: beard.id,
          startAt: atTenUtc(2),
          endAt: new Date(atTenUtc(2).getTime() + 15 * 60_000),
          status: BookingStatus.CONFIRMED,
        },
        {
          ...base,
          serviceId: full.id,
          startAt: atTenUtc(6),
          endAt: new Date(atTenUtc(6).getTime() + 60 * 60_000),
          status: BookingStatus.CONFIRMED,
        },
      ],
    });
  }

  const total = await prisma.booking.count();
  console.log(`Seeded "${BUSINESS_NAME}" with ${services.length} services and ${total} bookings.`);
  console.log(`Owner login: owner@example.com (BUSINESS_OWNER), customer: customer@example.com, admin: admin@example.com`);
  console.log(`Seed password for all three users: ${process.env.SEED_PASSWORD ? "(from SEED_PASSWORD)" : "password123"}`);
  console.log(`Owner ID: ${owner.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
