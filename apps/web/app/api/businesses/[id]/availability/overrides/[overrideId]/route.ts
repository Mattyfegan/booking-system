import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { getSessionUser, loadManagedBusiness } from "@/lib/session";

type Ctx = { params: { id: string; overrideId: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

// Removes an override so the weekly rules apply again on that date.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);

    const override = await prisma.availabilityOverride.findFirst({
      where: { id: params.overrideId, businessId: params.id },
    });
    if (!override) throw new HttpError(404, "Availability override not found");

    await prisma.availabilityOverride.delete({ where: { id: params.overrideId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
