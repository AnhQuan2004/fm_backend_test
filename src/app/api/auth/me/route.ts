import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value || "";
  const payload = verifySession(token);
  if (!payload) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, user: payload });
}
