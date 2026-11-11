import type { Metadata } from "next";
import { prisma } from "@booking/db";
import { Badge } from "@booking/ui";
import { BookingPanel } from "@/components/booking-panel";
import { PageShell } from "@/components/skeletons";
import { getBusiness } from "@/lib/business";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  // The root route does not get the layout's title template, so the full title is set here.
  title: { absolute: "Book an appointment | Riverside Barbers" },
  description: "Book your next haircut or shave at Riverside Barbers online.",
};

export const dynamic = "force-dynamic";

// The home page is the booking page: Riverside Barbers is the only business this system serves.
export default async function HomePage() {
  const [business, services, user] = await Promise.all([
    getBusiness(),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, description: true, durationMin: true, priceCents: true, bufferMin: true },
    }),
    getSessionUser(),
  ]);

  const access = !user ? "guest" : user.role === "BUSINESS_OWNER" ? "business-owner" : "customer";

  return (
    <PageShell>
      <header className="mb-8 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{business.name}</h1>
          <Badge>{business.timezone}</Badge>
        </div>
        <p className="max-w-2xl text-gray-600">{business.description ?? "Book your appointment online."}</p>
      </header>

      <BookingPanel
        business={{ name: business.name, timezone: business.timezone }}
        services={services}
        access={access}
        signInHref="/sign-in?callbackUrl=%2F"
      />
    </PageShell>
  );
}
