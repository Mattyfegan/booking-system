"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Alert, Button, Input } from "@booking/ui";

// Self-service accounts are customers. Staff access for Riverside Barbers is provisioned separately.
export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: String(form.get("name") ?? ""), email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setPending(false);
      setError(body?.error ?? "Could not create account");
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    setPending(false);
    if (result?.error) {
      setError("Account created, but sign-in failed. Try signing in.");
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input name="name" label="Name" required autoComplete="name" />
      <Input name="email" type="email" label="Email" required autoComplete="email" />
      <Input
        name="password"
        type="password"
        label="Password"
        hint="8 to 72 characters"
        required
        minLength={8}
        maxLength={72}
        autoComplete="new-password"
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
