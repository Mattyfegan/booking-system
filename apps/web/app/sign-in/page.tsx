import type { Metadata } from "next";
import Link from "next/link";
import { googleOAuthEnabled } from "@/lib/env";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: { searchParams: { callbackUrl?: string } }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm callbackUrl={safeCallback(searchParams.callbackUrl)} googleEnabled={googleOAuthEnabled} />
      <p className="text-sm text-gray-600">
        No account?{" "}
        <Link className="underline" href="/sign-up">
          Create one
        </Link>
      </p>
    </main>
  );
}

// Only allow same-site relative paths to avoid open redirects.
function safeCallback(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
