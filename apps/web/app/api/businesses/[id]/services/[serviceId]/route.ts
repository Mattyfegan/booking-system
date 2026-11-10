import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { loadManagedBusiness, getSessionUser } from "@/lib/session";
import { updateServiceSchema } from "@/lib/validation";

type Ctx = { params: { id: string; serviceId: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

// Loads a service and confirms it belongs to the business in the URL (prevents cross-business access).
async function loadService(businessId: string, serviceId: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, businessId } });
  if (!service) throw new HttpError(404, "Service not found");
  return service;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const service = await loadService(params.id, params.serviceId);
    return NextResponse.json({ service });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    await loadService(params.id, params.serviceId);
    const input = updateServiceSchema.parse(await readJson(req));

    const service = await prisma.service.update({
      where: { id: params.serviceId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.durationMin !== undefined && { durationMin: input.durationMin }),
        ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
        ...(input.bufferMin !== undefined && { bufferMin: input.bufferMin }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return NextResponse.json({ service });
  } catch (err) {
    return errorResponse(err);
  }
}

// Hard-deletes services with no bookings. Services with booking history are deactivated instead,
// so existing bookings keep a valid service reference.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    await loadService(params.id, params.serviceId);

    const bookingCount = await prisma.booking.count({ where: { serviceId: params.serviceId } });
    if (bookingCount > 0) {
      const service = await prisma.service.update({
        where: { id: params.serviceId },
        data: { isActive: false },
      });
      return NextResponse.json({ service, deleted: false, reason: "Service has bookings and was deactivated" });
    }

    await prisma.service.delete({ where: { id: params.serviceId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
