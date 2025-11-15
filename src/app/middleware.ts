import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/jwt";

const PROTECTED_PREFIXES: string[] = []; // ví dụ

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const cookie = req.cookies.get("session")?.value;
    if (!cookie || !verifySession(cookie)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"], // áp cho API routes
};
