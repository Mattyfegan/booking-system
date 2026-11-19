import { NextResponse } from "next/server";
import { assertRole, CUSTOMER_ROLES } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { notifyBookingConfirmed } from "@/lib/notifications";
import { assertWithinRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createBooking } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/session";
import { createBookingSchema } from "@/lib/validation";

// POST /api/bookings: books a slot for the signed-in customer. Conflicts return 409, too many attempts 429.
export async function POST(req: Request) {
  try {
    const user = assertRole(await getSessionUser(), CUSTOMER_ROLES);
    assertWithinRateLimit(`booking:${user.id}`, RATE_LIMITS.booking);
    const input = createBookingSchema.parse(await readJson(req));

    const booking = await createBooking({
      customerId: user.id,
      serviceId: input.serviceId,
      startAt: new Date(input.startAt),
      notes: input.notes ?? null,
    });
    // Best-effort: failures are logged inside, so the booking response is never held up by email errors.
    await notifyBookingConfirmed(booking.id);
    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
