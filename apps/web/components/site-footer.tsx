import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} Riverside Barbers. Bookings by Booking System.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/" className="hover:text-gray-900">
            Book
          </Link>
          <Link href="/my-bookings" className="hover:text-gray-900">
            My bookings
          </Link>
          <Link href="/sign-in" className="hover:text-gray-900">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
