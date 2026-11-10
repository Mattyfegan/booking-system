import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./authz";

// Maps thrown errors to JSON responses. Unknown errors are logged server-side and returned as a generic 500.
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: err.flatten() }, { status: 400 });
  }
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002") {
    return NextResponse.json({ error: "A record with that value already exists" }, { status: 409 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}
