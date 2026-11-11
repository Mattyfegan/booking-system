import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError, MANAGER_ROLES } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: { overrideId: string } };

// Removes an override so the weekly rules apply again on that date.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const override = await prisma.availabilityOverride.findUnique({ where: { id: params.overrideId } });
    if (!override) throw new HttpError(404, "Availability override not found");

    await prisma.availabilityOverride.delete({ where: { id: params.overrideId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
