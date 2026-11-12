"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@booking/ui";

export function SignOutButton() {
  return (
    <Button type="button" variant="secondary" className="gap-2" onClick={() => signOut({ callbackUrl: "/" })}>
      <LogOut size={16} aria-hidden="true" />
      Sign out
    </Button>
  );
}
