import { NextResponse } from "next/server";
import { assertRole, HttpError } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { notifyBookingCancelled } from "@/lib/notifications";
import { cancelBooking } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: { id: string } };

// POST /api/bookings/:id/cancel: sets status to CANCELLED. Customer, business owner, or ADMIN only.
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), ["CUSTOMER", "BUSINESS_OWNER", "ADMIN"]);
    if (!params.id) throw new HttpError(400, "Booking id is required");
    const booking = await cancelBooking(params.id, user);
    // Best-effort, as with confirmations: never fails the cancellation.
    await notifyBookingCancelled(booking.id);
    return NextResponse.json({ booking });
  } catch (err) {
    return errorResponse(err);
  }
}
