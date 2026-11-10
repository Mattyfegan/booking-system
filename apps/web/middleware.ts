import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Coarse gate at the edge. Route handlers and server components re-check roles; this layer
// is defence in depth and keeps unauthenticated traffic away from protected pages and APIs.
const MANAGER_ROLES = ["BUSINESS_OWNER", "ADMIN"];

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (!token) {
    if (isApi) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  if (!MANAGER_ROLES.includes(token.role as string)) {
    if (isApi) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/businesses/:path*"],
};
