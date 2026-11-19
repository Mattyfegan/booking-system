"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Card } from "@booking/ui";

// Route-level error boundary. Shown when a page or server component throws; the layout stays rendered.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card className="flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-bold text-brand-green">Something went wrong</h1>
        <p className="text-sm text-gray-600">
          We could not load this page. Please try again. If the problem continues, come back in a few minutes.
        </p>
        {error.digest && <p className="text-xs text-gray-400">Reference: {error.digest}</p>}
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button type="button" variant="brand" onClick={() => reset()}>
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-brand-green bg-white px-4 py-2 text-sm font-medium text-brand-green transition-colors hover:bg-brand-gold-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
          >
            Back to booking
          </Link>
        </div>
      </Card>
    </main>
  );
}
