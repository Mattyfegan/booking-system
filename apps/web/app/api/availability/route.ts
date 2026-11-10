import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getAvailableSlots } from "@/lib/scheduling";
import { availabilityQuerySchema } from "@/lib/validation";

// Public: customers need to see free slots before they sign in to book.
export const dynamic = "force-dynamic";

// GET /api/availability?businessId=&serviceId=&date=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const query = availabilityQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const result = await getAvailableSlots(query.businessId, query.serviceId, query.date);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
