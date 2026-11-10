"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@booking/ui";

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
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email,
        password,
        role: form.get("role"),
      }),
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
    window.location.assign(form.get("role") === "BUSINESS_OWNER" ? "/dashboard" : "/");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password (8+ characters)
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className="rounded border px-3 py-2"
        />
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1">I am a</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="role" value="CUSTOMER" defaultChecked /> Customer
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="role" value="BUSINESS_OWNER" /> Business owner
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
