import { SignUpForm } from "@/components/sign-up-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Create an account</h1>
      <SignUpForm />
      <p className="text-sm text-gray-600">
        Already registered?{" "}
        <a className="underline" href="/sign-in">
          Sign in
        </a>
      </p>
    </main>
  );
}
