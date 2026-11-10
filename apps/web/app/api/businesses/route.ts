import { NextResponse } from "next/server";
import { prisma } from "@booking/db";
import { assertRole, HttpError } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { createBusinessSchema, slugify } from "@/lib/validation";

// GET: ADMIN sees all businesses; BUSINESS_OWNER sees only their own.
export async function GET() {
  try {
    const user = assertRole(await getSessionUser(), ["BUSINESS_OWNER", "ADMIN"]);
    const businesses = await prisma.business.findMany({
      where: user.role === "ADMIN" ? {} : { ownerId: user.id },
      include: { services: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ businesses });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST: create the caller's business. Each owner has exactly one business (Business.ownerId is unique).
export async function POST(req: Request) {
  try {
    const user = assertRole(await getSessionUser(), ["BUSINESS_OWNER"]);
    const input = createBusinessSchema.parse(await readJson(req));

    const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });
    if (existing) throw new HttpError(409, "You already have a business");

    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new HttpError(400, "Could not derive a slug from the name; provide one explicitly");

    const business = await prisma.business.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        timezone: input.timezone,
        ownerId: user.id,
      },
    });
    return NextResponse.json({ business }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
