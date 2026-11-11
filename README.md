# Booking System

Online appointment booking for **Riverside Barbers**. Customers pick a service, a date and a free time, then book and cancel through a web interface. The shop's owner manages services and opening hours. The system serves this one business only; it is not a multi-business platform.

> A portfolio project - not intended for production use.

## Built With

This project was built using the Claude Code harness using (**Claude Haiku 5.5 **), planning and implementing a structured milestone plan in a standard Next.js monorepo.

## Tech Stack

- **Next.js 14** - App Router + Server Actions
- **Prisma 5** + **PostgreSQL** - relational data layer with typed queries and transactions
- **NextAuth.js** - authentication with credential and OAuth (Google) providers
- **Tailwind CSS** - utility-first styling
- **Zod** - runtime schema validation across API boundaries
- **date-fns / date-fns-tz** - timezone-aware date arithmetic and slot generation
- **Resend** + **React Email** - transactional email (confirmations, reminders)
- **pnpm** + **Turborepo** - monorepo task orchestration

## Features

- Services with duration, price and buffer time
- Weekly opening hours with per-date overrides (holidays, closures)
- Conflict-safe booking via a row lock on the business settings row (`SELECT ... FOR UPDATE`)
- Customer booking flow on the home page: service, date, time, confirm, and cancel from My bookings
- Owner dashboard - business profile and services (management UI is Milestone 5)
- Transactional emails - booking confirmations and 24-hour reminders

## Milestones

- [x] **Milestone 1 - Project foundation & data model**
  Scaffold the monorepo, configure Postgres via Docker, and define the full Prisma schema. *Done when:* `db:generate` and `db:migrate` succeed, all tables exist, and the app boots with `/api/health` returning green.

- [x] **Milestone 2 - Authentication & business profiles**
  NextAuth.js with credential + Google OAuth, role model (customer / business_owner / admin), and full CRUD for business profiles and services. *Done when:* login/logout works, roles are enforced on API routes, and a seeded business owner can manage their services.

- [ ] **Milestone 3 - Availability & conflict-safe booking**
  Availability rules engine, slot generation, and the booking transaction with pessimistic locking to prevent double-booking. *Done when:* given a date and service, available slots are returned correctly, and concurrent booking attempts correctly resolve to a single successful booking.

- [ ] **Milestone 4 - Customer-facing UI**
  Business discovery, availability calendar, booking flow, and "my bookings" page with cancellation. *Done when:* a customer can complete a full booking and cancellation journey without touching the database directly.

- [ ] **Milestone 5 - Admin dashboard**
  Schedule overview, booking management, availability editor, and service management. *Done when:* a business owner can view today's bookings, block out a day, and edit a service - all without a database client.

- [ ] **Milestone 6 - Email notifications**
  Confirmation and cancellation emails via Resend, plus a cron-triggered 24-hour reminder. *Done when:* a completed booking triggers a confirmation email to both customer and business owner, and reminders are queued correctly.

- [ ] **Milestone 7 - Hardening & polish**
  End-to-end tests (Playwright), rate limiting, timezone edge-case handling, query optimisation, and empty/error states throughout the UI. *Done when:* `pnpm test`, `pnpm lint`, and `pnpm build` all pass cleanly.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start the database
docker compose up -d

# Copy and fill in environment variables
cp .env.example .env

# Create the schema and seed Riverside Barbers (owner, customer, admin, services, hours, bookings)
pnpm db:migrate
pnpm db:seed

# Start the dev server
pnpm dev
```

Seeded logins (password `password123`, or `SEED_PASSWORD`): `owner@example.com` (business owner), `customer@example.com` (customer), `admin@example.com` (admin).

### Tests

Integration tests write and delete rows, so they run against a separate database. Create it once, then push the schema to it:

```bash
docker exec booking-system-db psql -U postgres -c "CREATE DATABASE booking_system_test;"
cd packages/db && DATABASE_URL="postgresql://postgres:postgres@localhost:5433/booking_system_test?schema=public" npx prisma db push
```

`TEST_DATABASE_URL` in `.env` makes `pnpm test` use that database instead of the live one.

Open [http://localhost:3000](http://localhost:3000) and [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Project Layout

```
apps/web         → Next.js app (pages, API routes, server actions)
packages/db      → Prisma schema, generated client, and query helpers
packages/ui      → Shared React components
packages/config  → Environment validation (Zod)
```

## Scripts

| Command          | Purpose                                      |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | Start the dev server                         |
| `pnpm build`     | Production build                             |
| `pnpm test`      | Run tests                                    |
| `pnpm lint`      | Lint & format (Biome)                        |
| `pnpm db:migrate`| Run Prisma migrations against local Postgres |
| `pnpm db:generate` | Regenerate the Prisma client               |
| `pnpm db:seed`   | Seed the database with test data             |
| `pnpm db:studio` | Open Prisma Studio                           |
