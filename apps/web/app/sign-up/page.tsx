import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Create an account</h1>
      <SignUpForm />
      <p className="text-sm text-gray-600">
        Already registered?{" "}
        <Link className="underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </main>
  );
}
