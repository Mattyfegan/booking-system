import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { getSessionUser, loadManagedBusiness } from "@/lib/session";
import { availabilityOverrideSchema } from "@/lib/validation";

type Ctx = { params: { id: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

// Overrides are keyed by business + calendar date (stored as a DATE, so midnight UTC represents the day).
const dateKey = (date: string) => new Date(`${date}T00:00:00.000Z`);

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const overrides = await prisma.availabilityOverride.findMany({
      where: { businessId: params.id },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({ overrides });
  } catch (err) {
    return errorResponse(err);
  }
}

// Upsert: setting an override for a date that already has one replaces it.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const input = availabilityOverrideSchema.parse(await readJson(req));

    const values = {
      isClosed: input.isClosed,
      startTime: input.isClosed ? null : (input.startTime ?? null),
      endTime: input.isClosed ? null : (input.endTime ?? null),
    };
    const override = await prisma.availabilityOverride.upsert({
      where: { businessId_date: { businessId: params.id, date: dateKey(input.date) } },
      create: { businessId: params.id, date: dateKey(input.date), ...values },
      update: values,
    });
    return NextResponse.json({ override });
  } catch (err) {
    return errorResponse(err);
  }
}
