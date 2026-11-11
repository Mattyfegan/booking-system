import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@booking/db";
import { Badge, Card } from "@booking/ui";
import { SignOutButton } from "@/components/sign-out-button";
import { getBusiness } from "@/lib/business";
import { getSessionUser } from "@/lib/session";
import { formatDurationMin, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Owner/admin overview of Riverside Barbers: profile and services. Editing and the schedule view arrive in Milestone 5.
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");
  if (user.role === "CUSTOMER") redirect("/");

  const [business, services] = await Promise.all([
    getBusiness(),
    prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <SignOutButton />
      </header>

      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{business.name}</h2>
          <Badge>{business.timezone}</Badge>
        </div>
        <p className="text-sm text-gray-600">{business.description ?? "No description yet."}</p>
      </Card>

      <section aria-labelledby="services-heading" className="flex flex-col gap-3">
        <h2 id="services-heading" className="text-lg font-semibold">
          Services
        </h2>
        <ul className="divide-y rounded-lg border border-gray-200 bg-white">
          {services.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className={s.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>{s.name}</span>
              <span className="text-sm text-gray-600">
                {formatDurationMin(s.durationMin)} · {formatPrice(s.priceCents)}
                {!s.isActive && " · inactive"}
              </span>
            </li>
          ))}
          {services.length === 0 && <li className="p-3 text-sm text-gray-600">No services yet. Run the seed script.</li>}
        </ul>
      </section>
    </main>
  );
}
