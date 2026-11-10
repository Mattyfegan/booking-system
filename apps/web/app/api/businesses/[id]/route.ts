import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { loadManagedBusiness, getSessionUser } from "@/lib/session";
import { updateBusinessSchema } from "@/lib/validation";

type Ctx = { params: { id: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    const business = await loadManagedBusiness(params.id, user);
    const withServices = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      include: { services: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ business: withServices });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const input = updateBusinessSchema.parse(await readJson(req));

    const business = await prisma.business.update({
      where: { id: params.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
    });
    return NextResponse.json({ business });
  } catch (err) {
    return errorResponse(err);
  }
}

// Refuses to delete a business that has bookings: Booking.business has no cascade, and deleting
// would destroy booking history. Owners must cancel or complete bookings first.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);

    const bookingCount = await prisma.booking.count({ where: { businessId: params.id } });
    if (bookingCount > 0) {
      throw new HttpError(409, `Business has ${bookingCount} booking(s) and cannot be deleted`);
    }

    // Services, availability rules and overrides cascade via the schema.
    await prisma.business.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
