import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { loadManagedBusiness, getSessionUser } from "@/lib/session";
import { createServiceSchema } from "@/lib/validation";

type Ctx = { params: { id: string } };

const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"] as const;

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const services = await prisma.service.findMany({
      where: { businessId: params.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ services });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = assertRole(await getSessionUser(), MANAGER_ROLES);
    await loadManagedBusiness(params.id, user);
    const input = createServiceSchema.parse(await readJson(req));

    const service = await prisma.service.create({
      data: {
        businessId: params.id,
        name: input.name,
        description: input.description ?? null,
        durationMin: input.durationMin,
        priceCents: input.priceCents,
        bufferMin: input.bufferMin,
      },
    });
    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
