import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PaginationProps = {
  label: string; // accessible name for the nav, e.g. "Upcoming bookings pages"
  page: number; // 1-based, already clamped to the valid range
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
};

const linkBase =
  "inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold";
const enabled = `${linkBase} border-brand-green bg-white text-brand-green hover:bg-brand-gold-soft`;
const disabled = `${linkBase} cursor-not-allowed border-gray-200 text-gray-300`;

// Server-rendered pager. Plain links, so it works without client JavaScript. Renders nothing for a single page.
export function Pagination({ label, page, pageSize, total, hrefFor }: PaginationProps) {
  if (total <= pageSize) return null;

  const totalPages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium text-brand-green">{from}</span>&ndash;
        <span className="font-medium text-brand-green">{to}</span> of{" "}
        <span className="font-medium text-brand-green">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} scroll={false} className={enabled} aria-label="Previous page">
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={disabled}>
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </span>
        )}

        <span className="px-2 text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>

        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} scroll={false} className={enabled} aria-label="Next page">
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={disabled}>
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
