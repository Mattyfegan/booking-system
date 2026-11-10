# Booking System

An appointment booking platform for small businesses. Business owners configure their services and availability; customers browse, book, and cancel appointments through a clean web interface. Includes an admin dashboard and transactional email confirmations.

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

- Business profiles with configurable services (name, duration, price, buffer time)
- Weekly availability rules with per-date overrides (holidays, closures)
- Conflict-safe booking via database-level transactions and pessimistic locking
- Customer booking flow - browse businesses, pick a slot, confirm and cancel
- Admin dashboard - today's schedule, booking management, availability editor
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

# Run migrations (Milestone 1 onwards)
pnpm db:migrate

# Start the dev server
pnpm dev
```

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
