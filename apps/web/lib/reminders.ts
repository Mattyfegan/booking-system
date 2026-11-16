import { addHours } from "date-fns";
import { BookingStatus, prisma } from "@booking/db";
import { sendBookingReminder } from "./notifications";

// Reminder queue. A booking is "queued" while it is CONFIRMED, starts within the next 24 hours, and has no
// reminderSentAt. The cron run claims each booking with a conditional update before sending, so overlapping or
// repeated runs send at most one reminder per booking.

export const REMINDER_LEAD_HOURS = 24;
const BATCH_SIZE = 200;

export type ReminderRunResult = { due: number; sent: number; skipped: number; failed: number };

// Bookings made inside the reminder window get no separate reminder: the confirmation email already covers them.
export function needsReminder(startAt: Date, now: Date): boolean {
  return startAt.getTime() - now.getTime() > REMINDER_LEAD_HOURS * 60 * 60 * 1000;
}

export async function sendDueReminders(now = new Date()): Promise<ReminderRunResult> {
  const due = await prisma.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      reminderSentAt: null,
      startAt: { gt: now, lte: addHours(now, REMINDER_LEAD_HOURS) },
    },
    select: { id: true },
    orderBy: { startAt: "asc" },
    take: BATCH_SIZE,
  });

  const result: ReminderRunResult = { due: due.length, sent: 0, skipped: 0, failed: 0 };

  for (const { id } of due) {
    // Claim: only the run that flips reminderSentAt from null proceeds. A cancelled booking is never claimed.
    const { count } = await prisma.booking.updateMany({
      where: { id, status: BookingStatus.CONFIRMED, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (count === 0) {
      result.skipped++;
      continue;
    }

    try {
      await sendBookingReminder(id);
      result.sent++;
    } catch (err) {
      // Release the claim so the next run retries this booking.
      await prisma.booking.updateMany({
        where: { id, reminderSentAt: now },
        data: { reminderSentAt: null },
      });
      result.failed++;
      console.error(`[reminders] failed to send reminder for booking ${id}:`, err);
    }
  }

  return result;
}
