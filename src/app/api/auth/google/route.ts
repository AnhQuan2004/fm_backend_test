import { NextRequest } from "next/server";
import { z } from "zod";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getSupabaseClient } from "@/lib/supabase";
import { signSession } from "@/lib/jwt";
import { cookies } from "next/headers";

const bodySchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  name: z.string().trim().optional(),
  sub: z.string().trim().optional(), // Google user id (optional, not stored)
  emailVerified: z.boolean().optional(),
});

const selectColumns = "id,email,username,role,wallet_address,xp_points,created_at";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const supabase = getSupabaseClient();

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select(selectColumns)
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      throw new Error(`Failed to look up user: ${userError.message}`);
    }

    let user = userData as {
      id: string;
      email: string;
      username: string | null;
      role: string | null;
      wallet_address: string | null;
      xp_points: number | null;
      created_at: string | null;
    } | null;

    if (!user) {
      const { data: createdUser, error: createError } = await supabase
        .from("users")
        .insert({ email, role: "user", xp_points: 0 })
        .select(selectColumns)
        .single();
      if (createError) {
        throw new Error(`Failed to create user from Google login: ${createError.message}`);
      }
      user = createdUser as typeof user;
    }

    const token = signSession({ userId: user!.id, email: user!.email });
    (await cookies()).set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return jsonWithCors(req, {
      ok: true,
      user: {
        email: user!.email,
        userId: user!.id,
        username: user!.username ?? null,
        role: user!.role ?? "user",
        walletAddress: user!.wallet_address ?? null,
        xpPoints: user!.xp_points ?? 0,
        createdAt: user!.created_at ?? null,
      },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to upsert Google user";
    return jsonWithCors(req, { ok: false, error: message }, { status: 400 });
  }
}
