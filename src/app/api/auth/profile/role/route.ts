import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { verifySession } from "@/lib/jwt";

const roleEnum = z.enum(["user", "partner", "admin"]);

const updateRoleSchema = z.object({
  email: z.string().email(),
  role: roleEnum,
});

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const session = verifySession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const json = await req.json();
    const parsed = updateRoleSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
      .eq("email", parsed.data.email)
      .select("email, role, updated_at")
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update role: ${updateError.message}`);
    }

    const updatedRecord = updated as { email: string; role: string | null; updated_at: string | null } | null;

    if (!updatedRecord) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        email: updatedRecord.email,
        role: updatedRecord.role ?? "user",
        updatedAt: updatedRecord.updated_at,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed to update role" }, { status: 500 });
  }
}
