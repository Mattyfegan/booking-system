import { getServerSession } from "next-auth";
import { prisma } from "@booking/db";
import { authOptions } from "./auth-options";
import { assertCanManageBusiness, HttpError, type SessionUser } from "./authz";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { id: session.user.id, role: session.user.role };
}

// Loads a business and confirms the caller may manage it. Returns 404 for missing, 403 for not-owner.
export async function loadManagedBusiness(businessId: string, user: SessionUser) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new HttpError(404, "Business not found");
  assertCanManageBusiness(user, business);
  return business;
}
