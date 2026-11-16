import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError, MANAGER_ROLES } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { assertNoRuleOverlap } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/session";
import { updateAvailabilityRuleSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ ruleId: string }> };

async function loadRule(ruleId: string) {
  const rule = await prisma.availabilityRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new HttpError(404, "Availability rule not found");
  return rule;
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const { ruleId } = await params;
    const existing = await loadRule(ruleId);
    const input = updateAvailabilityRuleSchema.parse(await readJson(req));

    const merged = {
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
    };
    if (merged.startTime >= merged.endTime) throw new HttpError(400, "endTime must be after startTime");
    await assertNoRuleOverlap(merged.dayOfWeek, merged, ruleId);

    const rule = await prisma.availabilityRule.update({ where: { id: ruleId }, data: merged });
    return NextResponse.json({ rule });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const { ruleId } = await params;
    await loadRule(ruleId);
    await prisma.availabilityRule.delete({ where: { id: ruleId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
