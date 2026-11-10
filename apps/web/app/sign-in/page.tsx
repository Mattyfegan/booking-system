import { googleOAuthEnabled } from "@/lib/env";
import { SignInForm } from "@/components/sign-in-form";

export default function SignInPage({ searchParams }: { searchParams: { callbackUrl?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm callbackUrl={safeCallback(searchParams.callbackUrl)} googleEnabled={googleOAuthEnabled} />
      <p className="text-sm text-gray-600">
        No account?{" "}
        <a className="underline" href="/sign-up">
          Create one
        </a>
      </p>
    </main>
  );
}

// Only allow same-site relative paths to avoid open redirects.
function safeCallback(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
