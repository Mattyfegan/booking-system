# Booking System - Implementation Plan

## Milestone 1 - Project foundation & data model
**Goal:** Scaffold monorepo, configure Postgres via Docker, define full Prisma schema.

Deliverables:
- Monorepo scaffold (pnpm workspaces + Turborepo) with `apps/web`, `packages/db`, `packages/ui`, `packages/config`
- Docker Compose Postgres service with healthcheck
- Prisma schema: User, Account, Session, VerificationToken, Business, Service, AvailabilityRule, AvailabilityOverride, Booking
- Generated Prisma client exported from `@booking/db`
- `/api/health` route returning `{ status: "ok" }`
- `.env.example` with all required variables
- Scripts: `db:generate`, `db:migrate`, `db:seed`, `db:studio`

Done when: `db:generate` and `db:migrate` succeed, all tables exist, app boots with `/api/health` green.

## Milestone 2 - Authentication & business profiles
**Goal:** NextAuth with credentials + Google OAuth, role model, business/service CRUD.

Deliverables:
- NextAuth configuration (credentials + Google) with JWT/session callbacks
- Role enum enforced on API routes (CUSTOMER, BUSINESS_OWNER, ADMIN)
- Sign-in / sign-out pages and middleware protection
- Business profile CRUD (create, read, update, delete) scoped to owner
- Service CRUD nested under business
- Seed script with a business owner, customer, and sample business/services

Done when: login/logout works, roles enforced on API routes, seeded owner can manage services.

## Milestone 3 - Availability & conflict-safe booking
**Goal:** Availability rules engine, slot generation, transactional booking with pessimistic locking.

Deliverables:
- Weekly availability rule CRUD and per-date overrides
- Slot generation utility (date-fns / date-fns-tz) respecting duration, buffer, overrides
- `GET /api/availability` returning available slots for business + service + date
- Booking creation transaction with `SELECT ... FOR UPDATE` / serializable isolation
- Double-booking prevention (concurrent attempts resolve to one success)
- Cancellation endpoint transitioning status to CANCELLED

Done when: slots returned correctly for date+service; concurrent bookings resolve to single success.

## Milestone 4 - Customer-facing UI
**Goal:** Discovery, calendar, booking flow, my bookings with cancellation.

Deliverables:
- Business discovery page (list/search)
- Business detail page with service list
- Availability calendar component with slot picker
- Booking confirmation flow with optimistic UI
- "My bookings" page listing upcoming/past bookings
- Cancellation action with confirmation dialog

Done when: customer completes full booking + cancellation without DB access.

## Milestone 5 - Admin dashboard
**Goal:** Schedule overview, booking management, availability editor, service management.

Deliverables:
- Admin layout with role-guarded routes
- Today's schedule view
- Booking management (list, filter, cancel)
- Availability editor (weekly rules + overrides/block days)
- Service management UI (create/edit/delete)

Done when: owner views today's bookings, blocks a day, edits a service without DB client.

## Milestone 6 - Email notifications
**Goal:** Confirmation/cancellation emails via Resend + React Email, cron reminder.

Deliverables:
- React Email templates (confirmation, cancellation, reminder)
- Resend integration triggered on booking create/cancel
- Emails to both customer and business owner
- Cron endpoint / scheduled job for 24-hour reminders
- Reminder queueing/idempotency handling

Done when: completed booking triggers confirmation to customer + owner; reminders queued correctly.

## Milestone 7 - Hardening & polish
**Goal:** E2E tests, rate limiting, timezone edge cases, optimisation, empty/error states.

Deliverables:
- Playwright E2E suite covering booking + cancellation journey
- Rate limiting on auth and booking endpoints
- Timezone edge-case handling and tests
- Query optimisation (indexes, N+1 fixes)
- Empty/error states throughout UI
- Clean `pnpm test`, `pnpm lint`, `pnpm build`

Done when: `pnpm test`, `pnpm lint`, `pnpm build` all pass cleanly.
