"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Role } from "@booking/db";
import { Button } from "@booking/ui";
import { Logo } from "./logo";

export type NavUser = { role: Role } | null;

type NavLink = { href: string; label: string };

function linksFor(user: NavUser): NavLink[] {
  const links: NavLink[] = [{ href: "/", label: "Book" }];
  if (user && (user.role === "CUSTOMER" || user.role === "ADMIN")) {
    links.push({ href: "/my-bookings", label: "My bookings" });
  }
  if (user && (user.role === "BUSINESS_OWNER" || user.role === "ADMIN")) {
    links.push({ href: "/dashboard", label: "Dashboard" });
  }
  return links;
}

const linkClass = "rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900";

// Desktop: inline links. Below md: a menu button toggles a stacked panel.
export function SiteNavbar({ user }: { user: NavUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const links = linksFor(user);

  // Collapse the mobile menu after navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const authLinks = user ? (
    <Button type="button" variant="secondary" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
      Sign out
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/sign-in" className={linkClass}>
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Sign up
      </Link>
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`${linkClass} ${isActive(link.href) ? "bg-gray-100 font-medium text-gray-900" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">{authLinks}</div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-800 hover:bg-gray-100 md:hidden"
          aria-controls="mobile-menu"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <div id="mobile-menu" hidden={!menuOpen} className="border-t border-gray-200 md:hidden">
        <nav aria-label="Mobile" className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className="rounded-md px-3 py-3 text-base text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-gray-100 pt-3">
            {user ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/sign-in" className="rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium">
                  Sign in
                </Link>
                <Link href="/sign-up" className="rounded-md bg-black px-4 py-2 text-center text-sm font-medium text-white">
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
