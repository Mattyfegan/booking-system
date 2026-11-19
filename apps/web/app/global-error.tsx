"use client";

// Last-resort boundary for failures in the root layout. It replaces the whole document, so it carries its own
// <html> and <body> and cannot rely on the app's styles or components.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error(error);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ color: "#4b5563" }}>The site could not be displayed. Please try again.</p>
        {error.digest && <p style={{ color: "#9ca3af", fontSize: "0.75rem" }}>Reference: {error.digest}</p>}
        <button
          type="button"
          onClick={() => reset()}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem", borderRadius: "0.375rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
