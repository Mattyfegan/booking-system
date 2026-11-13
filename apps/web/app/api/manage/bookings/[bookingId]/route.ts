import { NextResponse } from "next/server";
import { assertRole, HttpError, MANAGER_ROLES } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { setBookingOutcome } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/session";
import { bookingOutcomeSchema } from "@/lib/validation";

type Ctx = { params: { bookingId: string } };

// PATCH /api/manage/bookings/:id: record COMPLETED or NO_SHOW for a booking that has started. Owners and ADMIN only.
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    if (!params.bookingId) throw new HttpError(400, "Booking id is required");
    const input = bookingOutcomeSchema.parse(await readJson(req));
    const booking = await setBookingOutcome(params.bookingId, input.status);
    return NextResponse.json({ booking });
  } catch (err) {
    return errorResponse(err);
  }
}
