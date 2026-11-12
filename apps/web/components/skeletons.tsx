import { Card, Skeleton } from "@booking/ui";

// Placeholder layouts shown by app/**/loading.tsx while server data is loading.
// They mirror the real page structure so the page does not jump when content arrives.

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      {children}
    </main>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </PageShell>
  );
}

// Booking page: header, service cards, calendar and time slots.
export function BookingPageSkeleton() {
  return (
    <PageShell>
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="mb-6 flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Card>
            <Skeleton className="h-64" />
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// My bookings: header, then two tables (upcoming and history), each with rows and a pager footer.
export function BookingListSkeleton() {
  return (
    <PageShell>
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-1 w-12" />
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {["Upcoming", "History"].map((title) => (
        <section key={title} className="mb-10 flex flex-col gap-3 last:mb-0">
          <Skeleton className="h-6 w-32" />
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          </div>
        </section>
      ))}
    </PageShell>
  );
}
