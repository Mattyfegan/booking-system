import { prisma, Role } from "@booking/db";
import {
  BookingCancellationEmail,
  BookingConfirmationEmail,
  BookingReminderEmail,
  type BookingEmailDetails,
} from "@/emails/booking-emails";
import { getBusiness } from "./business";
import { sendEmail } from "./email";
import { env } from "./env";
import { formatDayInZone, formatPrice, formatTimeInZone } from "./format";

// Builds booking emails. Confirmation and cancellation are best-effort: a mail failure is logged and never
// fails the booking request. Reminders throw on failure so the cron job can release its claim and retry.

const appUrl = (env.NEXT_PUBLIC_APP_URL ?? env.NEXTAUTH_URL).replace(/\/$/, "");

async function loadBookingContext(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: true, customer: true },
  });
  if (!booking) throw new Error(`Booking ${bookingId} not found for notification`);

  const business = await getBusiness();
  const owner = await prisma.user.findFirst({
    where: { role: Role.BUSINESS_OWNER },
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true },
  });

  const details: BookingEmailDetails = {
    businessName: business.name,
    customerName: booking.customer.name ?? booking.customer.email,
    serviceName: booking.service.name,
    day: formatDayInZone(booking.startAt, business.timezone),
    time: formatTimeInZone(booking.startAt, business.timezone),
    durationMin: booking.service.durationMin,
    priceLabel: formatPrice(booking.service.priceCents),
    bookingId: booking.id,
    appUrl,
  };

  return {
    details,
    customerEmail: booking.customer.email,
    ownerEmail: owner?.email ?? null,
  };
}

function logFailure(kind: string, bookingId: string, err: unknown) {
  console.error(`[notifications] ${kind} failed for booking ${bookingId}:`, err);
}

// Sends the confirmation to the customer and the business owner. Never throws.
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const { details, customerEmail, ownerEmail } = await loadBookingContext(bookingId);
    const results = await Promise.allSettled([
      sendEmail({
        to: customerEmail,
        subject: `Booking confirmed: ${details.serviceName} on ${details.day}`,
        react: BookingConfirmationEmail({ ...details, audience: "customer" }),
      }),
      ownerEmail
        ? sendEmail({
            to: ownerEmail,
            subject: `New booking: ${details.serviceName} on ${details.day} at ${details.time}`,
            react: BookingConfirmationEmail({ ...details, audience: "owner" }),
          })
        : Promise.resolve("skipped" as const),
    ]);
    for (const r of results) if (r.status === "rejected") logFailure("confirmation", bookingId, r.reason);
  } catch (err) {
    logFailure("confirmation", bookingId, err);
  }
}

// Sends the cancellation notice to the customer and the business owner. Never throws.
export async function notifyBookingCancelled(bookingId: string): Promise<void> {
  try {
    const { details, customerEmail, ownerEmail } = await loadBookingContext(bookingId);
    const results = await Promise.allSettled([
      sendEmail({
        to: customerEmail,
        subject: `Booking cancelled: ${details.serviceName} on ${details.day}`,
        react: BookingCancellationEmail({ ...details, audience: "customer" }),
      }),
      ownerEmail
        ? sendEmail({
            to: ownerEmail,
            subject: `Booking cancelled: ${details.customerName}, ${details.day} at ${details.time}`,
            react: BookingCancellationEmail({ ...details, audience: "owner" }),
          })
        : Promise.resolve("skipped" as const),
    ]);
    for (const r of results) if (r.status === "rejected") logFailure("cancellation", bookingId, r.reason);
  } catch (err) {
    logFailure("cancellation", bookingId, err);
  }
}

// Sends the 24-hour reminder to the customer only. Throws on failure so the caller can retry later.
export async function sendBookingReminder(bookingId: string): Promise<void> {
  const { details, customerEmail } = await loadBookingContext(bookingId);
  await sendEmail({
    to: customerEmail,
    subject: `Reminder: ${details.serviceName} tomorrow at ${details.time}`,
    react: BookingReminderEmail(details),
  });
}
