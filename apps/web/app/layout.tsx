import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/session";
import { SiteNavbar } from "@/components/site-navbar";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: {
    default: "Riverside Barbers",
    template: "%s | Riverside Barbers",
  },
  description: "Book your appointment at Riverside Barbers online.",
};

// Session is read on every request so the navbar always reflects the signed-in user.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-gray-50 text-gray-900 antialiased">
        <SiteNavbar user={user ? { role: user.role } : null} />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
