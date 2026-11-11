import { BookingPageSkeleton } from "@/components/skeletons";

// Fallback for any route without its own loading.tsx. The root route is the booking page, so this matches it.
export default function Loading() {
  return <BookingPageSkeleton />;
}
