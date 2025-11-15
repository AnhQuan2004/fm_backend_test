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
  const res = NextResponse.next();

  // Add CORS headers
  res.headers.set("Access-Control-Allow-Origin", "https://first-movers.vercel.app");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/api/:path*"], // áp cho API routes
};
