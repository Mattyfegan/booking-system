import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { assertNoRuleOverlap } from "@/lib/scheduling";
import { getSessionUser, loadManagedBusiness } from "@/lib/session";
import { updateAvailabilityRuleSchema } from "@/lib/validation";

type Ctx = { params: { id: string; ruleId: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

// Confirms the rule exists and belongs to the business in the URL (prevents cross-business edits).
async function loadRule(businessId: string, ruleId: string) {
  const rule = await prisma.availabilityRule.findFirst({ where: { id: ruleId, businessId } });
  if (!rule) throw new HttpError(404, "Availability rule not found");
  return rule;
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const existing = await loadRule(params.id, params.ruleId);
    const input = updateAvailabilityRuleSchema.parse(await readJson(req));

    const merged = {
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
    };
    if (merged.startTime >= merged.endTime) throw new HttpError(400, "endTime must be after startTime");
    await assertNoRuleOverlap(params.id, merged.dayOfWeek, merged, params.ruleId);

    const rule = await prisma.availabilityRule.update({ where: { id: params.ruleId }, data: merged });
    return NextResponse.json({ rule });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    await loadRule(params.id, params.ruleId);
    await prisma.availabilityRule.delete({ where: { id: params.ruleId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
