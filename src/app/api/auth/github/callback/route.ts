import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const resolveGithubUsername = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata) return null;
  return (
    (typeof metadata.login === "string" && metadata.login.trim()) ||
    (typeof metadata.user_name === "string" && metadata.user_name.trim()) ||
    (typeof metadata.preferred_username === "string" && metadata.preferred_username.trim()) ||
    null
  );
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect("/profile");
  }

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("GitHub OAuth error", error);
      return NextResponse.redirect("/profile?error=github");
    }

    const session = data?.session;
    const email = session?.user?.email;
    const github = resolveGithubUsername(session?.user?.user_metadata);

    if (email && github) {
      await supabase
        .from("users")
        .update({ github })
        .eq("email", email);
    }
  } catch (error) {
    console.error("Failed to exchange GitHub code", error);
  }

  return NextResponse.redirect("/profile?github=connected");
}

