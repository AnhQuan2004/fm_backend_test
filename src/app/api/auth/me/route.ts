import { NextRequest } from "next/server";
import { verifySession } from "@/lib/jwt";
import { handleOptions, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value || "";
  const payload = verifySession(token);
  if (!payload) return jsonWithCors(req, { ok: false }, { status: 401 });
  return jsonWithCors(req, { ok: true, user: payload });
}
