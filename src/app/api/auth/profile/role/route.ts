import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { getRequestSession, isAuthBypassEnabled } from "@/lib/auth";
import { handleOptions, jsonWithCors } from "@/lib/cors";

const roleEnum = z.enum(["user", "organizer", "admin"]);

const updateRoleSchema = z.object({
  walletAddress: z.string().trim().min(1, "Wallet address không được bỏ trống"),
  role: roleEnum,
});

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getRequestSession();
    if (!session && !isAuthBypassEnabled()) {
      return jsonWithCors(req, { ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const json = await req.json();
    const parsed = updateRoleSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ role: parsed.data.role })
      .eq("wallet_address", parsed.data.walletAddress)
      .select("wallet_address, role")
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update role: ${updateError.message}`);
    }

    const updatedRecord = updated as { wallet_address: string; role: string | null } | null;

    if (!updatedRecord) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    return jsonWithCors(req, {
      ok: true,
      user: {
        walletAddress: updatedRecord.wallet_address,
        role: updatedRecord.role ?? "user",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to update role" }, { status: 500 });
  }
}
