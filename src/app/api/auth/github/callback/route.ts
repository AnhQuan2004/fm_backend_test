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
  const errorParam = req.nextUrl.searchParams.get("error");
  
  if (errorParam) {
    console.error("OAuth error from provider:", errorParam);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=github`
    );
  }

  if (!code) {
    console.error("No code parameter in callback");
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=github`
    );
  }

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("GitHub OAuth error:", error.message, error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=github`
      );
    }

    const session = data?.session;
    if (!session) {
      console.error("No session returned from exchangeCodeForSession");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=github`
      );
    }

    const email = session?.user?.email;
    const github = resolveGithubUsername(session?.user?.user_metadata);

    console.log("GitHub OAuth success:", { email, github });

    if (email && github) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ github })
        .eq("email", email);
      
      if (updateError) {
        console.error("Failed to update GitHub username:", updateError);
      } else {
        console.log("GitHub username updated successfully");
      }
    } else {
      console.warn("Missing email or github username:", { email, github });
    }
  } catch (error) {
    console.error("Failed to exchange GitHub code:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=github`
    );
  }

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?github=connected`
  );
}

