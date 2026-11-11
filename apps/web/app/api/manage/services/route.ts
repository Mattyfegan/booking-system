import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, MANAGER_ROLES } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { createServiceSchema } from "@/lib/validation";

// GET: every service, including inactive ones. POST: create a service.
export async function GET() {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const services = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ services });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertRole(await getSessionUser(), MANAGER_ROLES);
    const input = createServiceSchema.parse(await readJson(req));

    const service = await prisma.service.create({
      data: {
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
