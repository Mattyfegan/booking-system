import bcrypt from "bcryptjs";
import { BookingStatus, PrismaClient, Role } from "../generated/client";

// Dev-only seed data. Passwords are for local use only; override with SEED_PASSWORD.
// Safe to re-run: users and the business are upserted, services and bookings are only created when missing.
const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "password123";
const DAY_MS = 24 * 60 * 60 * 1000;

// 10:00 UTC on a day offset from today (negative = past).
function atTenUtc(dayOffset: number): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0));
  return new Date(d.getTime() + dayOffset * DAY_MS);
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { name: "Platform Admin", email: "admin@example.com", password: passwordHash, role: Role.ADMIN },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: {
      name: "Sample Owner",
      email: "owner@example.com",
      password: passwordHash,
      role: Role.BUSINESS_OWNER,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      name: "Sample Customer",
      email: "customer@example.com",
      password: passwordHash,
      role: Role.CUSTOMER,
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: "riverside-barbers" },
    update: {},
    create: {
      name: "Riverside Barbers",
      slug: "riverside-barbers",
      description: "Sample business for local development.",
      timezone: "UTC",
      ownerId: owner.id,
    },
  });

  let services = await prisma.service.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  if (services.length === 0) {
    await prisma.service.createMany({
      data: [
        { businessId: business.id, name: "Haircut", durationMin: 30, priceCents: 3500, bufferMin: 0 },
        { businessId: business.id, name: "Beard trim", durationMin: 15, priceCents: 1500, bufferMin: 5 },
        { businessId: business.id, name: "Full service", durationMin: 60, priceCents: 6500, bufferMin: 10 },
      ],
    });
    services = await prisma.service.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  }
  const [haircut, beard, full] = services;

  // Bookings: two past completed, one past no-show, one cancelled, and three upcoming.
  const bookingCount = await prisma.booking.count({ where: { businessId: business.id } });
  if (bookingCount === 0) {
    const base = { businessId: business.id, customerId: customer.id };
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

  const total = await prisma.booking.count({ where: { businessId: business.id } });
  console.log(`Seeded users: admin@example.com (ADMIN), owner@example.com (BUSINESS_OWNER), customer@example.com (CUSTOMER)`);
  console.log(`Business "${business.name}": ${services.length} services, ${total} bookings.`);
  console.log(`Seed password for all three users: ${process.env.SEED_PASSWORD ? "(from SEED_PASSWORD)" : "password123"}`);
  console.log(`Admin ID: ${admin.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
