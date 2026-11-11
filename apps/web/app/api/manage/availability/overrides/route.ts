import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, MANAGER_ROLES } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { availabilityOverrideSchema } from "@/lib/validation";

// Overrides are keyed by calendar date (stored as a DATE, so midnight UTC represents the day).
const dateKey = (date: string) => new Date(`${date}T00:00:00.000Z`);

export async function GET() {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const overrides = await prisma.availabilityOverride.findMany({ orderBy: { date: "asc" } });
    return NextResponse.json({ overrides });
  } catch (err) {
    return errorResponse(err);
  }
}

// Upsert: setting an override for a date that already has one replaces it.
export async function POST(req: Request) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const input = availabilityOverrideSchema.parse(await readJson(req));

    const values = {
      isClosed: input.isClosed,
      startTime: input.isClosed ? null : (input.startTime ?? null),
      endTime: input.isClosed ? null : (input.endTime ?? null),
    };
    const override = await prisma.availabilityOverride.upsert({
      where: { date: dateKey(input.date) },
      create: { date: dateKey(input.date), ...values },
      update: values,
    });
    return NextResponse.json({ override });
  } catch (err) {
    return errorResponse(err);
  }
}
