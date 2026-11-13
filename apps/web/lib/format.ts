import { formatInTimeZone } from "date-fns-tz";

// Display helpers shared by server and client components. Times are always shown in the business timezone.

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(cents / 100);
}

export function formatDayInZone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "EEE d MMM yyyy");
}

export function formatTimeInZone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "h:mm a");
}

export function formatDurationMin(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes} min`;
}
