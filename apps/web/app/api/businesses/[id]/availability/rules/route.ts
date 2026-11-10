import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { assertNoRuleOverlap } from "@/lib/scheduling";
import { getSessionUser, loadManagedBusiness } from "@/lib/session";
import { createAvailabilityRuleSchema } from "@/lib/validation";

type Ctx = { params: { id: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const rules = await prisma.availabilityRule.findMany({
      where: { businessId: params.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json({ rules });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const input = createAvailabilityRuleSchema.parse(await readJson(req));

    await assertNoRuleOverlap(params.id, input.dayOfWeek, input);
    const rule = await prisma.availabilityRule.create({
      data: { businessId: params.id, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
