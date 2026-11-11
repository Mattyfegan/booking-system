import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, MANAGER_ROLES } from "@/lib/authz";
import { getBusiness } from "@/lib/business";
import { errorResponse, readJson } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { updateBusinessSchema } from "@/lib/validation";

// GET/PATCH the business profile. Owners and ADMIN only.
export async function GET() {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    return NextResponse.json({ business: await getBusiness() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const input = updateBusinessSchema.parse(await readJson(req));
    const current = await getBusiness();

    const business = await prisma.business.update({
      where: { id: current.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
    });
    return NextResponse.json({ business });
  } catch (err) {
    return errorResponse(err);
  }
}
