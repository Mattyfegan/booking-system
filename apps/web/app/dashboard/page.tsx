import { redirect } from "next/navigation";
import { prisma } from "@booking/db";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Minimal owner view for Milestone 2: shows the business and its services.
// Full schedule and management UI arrives in Milestone 5.
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");
  if (user.role === "CUSTOMER") redirect("/");

  const business = await prisma.business.findUnique({
    where: { ownerId: user.id },
    include: { services: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <SignOutButton />
      </header>

      {!business ? (
        <p className="text-gray-700">You have not created a business yet. Use POST /api/businesses to create one.</p>
      ) : (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold">{business.name}</h2>
            <p className="text-sm text-gray-600">
              /{business.slug} · {business.timezone}
            </p>
          </div>
          <ul className="divide-y rounded border">
            {business.services.map((s) => (
              <li key={s.id} className="flex items-center justify-between p-3">
                <span className={s.isActive ? "" : "text-gray-400 line-through"}>{s.name}</span>
                <span className="text-sm text-gray-600">
                  {s.durationMin} min · {formatPrice(s.priceCents)}
                  {!s.isActive && " · inactive"}
                </span>
              </li>
            ))}
            {business.services.length === 0 && <li className="p-3 text-sm text-gray-600">No services yet.</li>}
          </ul>
        </section>
      )}
    </main>
  );
}
