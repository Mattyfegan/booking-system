import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@booking/db";
import { HttpError } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { registerSchema } from "@/lib/validation";

const BCRYPT_ROUNDS = 12;

// Self-service signup only creates CUSTOMER accounts. Owners and admins are provisioned by seed or DB.
export async function POST(req: Request) {
  try {
    const input = registerSchema.parse(await readJson(req));

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, "An account with that email already exists");

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        role: "CUSTOMER",
      },
      select: { id: true, email: true, role: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
