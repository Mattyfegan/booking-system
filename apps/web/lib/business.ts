import { prisma } from "@booking/db";

// The one business this system serves. The row is seeded by `pnpm db:seed` and holds profile settings.
export async function getBusiness() {
  const business = await prisma.business.findFirst();
  if (!business) throw new Error("Business settings row is missing. Run `pnpm db:seed`.");
  return business;
}
