import { PrismaClient } from "../generated/client";

// Milestone 1 placeholder: the seed script runs cleanly against an empty database.
// Milestone 2 populates it with a business owner, a customer, and sample services.
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  console.log(`Seed: database reachable, ${userCount} user(s) present. Nothing to seed yet.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
