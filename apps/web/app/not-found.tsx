import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@booking/ui";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card className="flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-bold text-brand-green">Page not found</h1>
        <p className="text-sm text-gray-600">The page you are looking for does not exist or has moved.</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
        >
          Back to booking
        </Link>
      </Card>
    </main>
  );
}
