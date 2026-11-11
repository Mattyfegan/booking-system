import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, MANAGER_ROLES } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { assertNoRuleOverlap } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/session";
import { createAvailabilityRuleSchema } from "@/lib/validation";

export async function GET() {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const rules = await prisma.availabilityRule.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json({ rules });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const input = createAvailabilityRuleSchema.parse(await readJson(req));

    await assertNoRuleOverlap(input.dayOfWeek, input);
    const rule = await prisma.availabilityRule.create({
      data: { dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
