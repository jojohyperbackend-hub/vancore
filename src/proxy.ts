import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/dashboard"];
const AUTH_ONLY  = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("session")?.value ?? "";

  if (AUTH_ONLY.some(p => pathname.startsWith(p))) {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (PROTECTED.some(p => pathname.startsWith(p))) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};