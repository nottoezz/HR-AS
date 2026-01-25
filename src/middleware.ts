import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = ["/employees", "/departments"];
const LOGIN_PATH = "/login";
const DEFAULT_AUTH_REDIRECT = "/employees";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname, search } = nextUrl;

  // Edge-safe auth check (does NOT import Prisma/db)
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const isLoggedIn = !!token;

  const isLoginRoute = pathname === LOGIN_PATH || pathname === "/";
  const isProtectedRoute = PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );

  // Logged out -> protected pages => login (with callback)
  if (!isLoggedIn && isProtectedRoute) {
    const loginUrl = new URL(LOGIN_PATH, nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Logged in -> "/" or "/login" => go to default app page
  if (isLoggedIn && isLoginRoute) {
    return NextResponse.redirect(
      new URL(DEFAULT_AUTH_REDIRECT, nextUrl.origin),
    );
  }

  // Logged out -> "/" => login
  if (!isLoggedIn && pathname === "/") {
    return NextResponse.redirect(new URL(LOGIN_PATH, nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/employees/:path*", "/departments/:path*"],
};
