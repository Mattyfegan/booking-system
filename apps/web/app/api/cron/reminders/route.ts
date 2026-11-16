import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/http";
import { sendDueReminders } from "@/lib/reminders";

// Cron entry point: send 24-hour reminders for upcoming bookings. Run hourly by the platform scheduler, e.g.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reminders
// Not covered by the middleware matcher, so the bearer token is the only gate. Requests are compared by hash
// so the check runs in constant time regardless of input length.

function isAuthorised(header: string | null, secret: string): boolean {
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(header ?? "").digest();
  return timingSafeEqual(expected, received);
}

async function handle(req: Request) {
  try {
    const secret = env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
    }
    if (!isAuthorised(req.headers.get("authorization"), secret)) {
      return NextResponse.json({ error: "Invalid cron token" }, { status: 401 });
    }

    const result = await sendDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = handle;
export const POST = handle;
