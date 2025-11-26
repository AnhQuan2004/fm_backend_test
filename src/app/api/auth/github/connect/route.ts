import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

const resolveGithubUsername = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata) return null;
  return (
    (typeof metadata.login === "string" && metadata.login.trim()) ||
    (typeof metadata.user_name === "string" && metadata.user_name.trim()) ||
    (typeof metadata.preferred_username === "string" && metadata.preferred_username.trim()) ||
    null
  );
};

export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    
    if (!access_token) {
      return NextResponse.json(
        { error: "Missing access_token" },
        { status: 400 }
      );
    }

    // Create a Supabase client with the access token
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    // Create client with access token
    const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    });

    // Get user info using the access token
    const { data: { user }, error: userError } = await supabaseWithToken.auth.getUser(access_token);
    
    if (userError || !user) {
      console.error("Failed to get user from access token:", userError);
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    const email = user.email;
    const github = resolveGithubUsername(user.user_metadata);
    
    // Use the service client to update database
    const supabase = getSupabaseClient();

    if (!email) {
      return NextResponse.json(
        { error: "Missing email" },
        { status: 400 }
      );
    }

    if (github) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ github })
        .eq("email", email);
      
      if (updateError) {
        console.error("Failed to update GitHub username:", updateError);
        return NextResponse.json(
          { error: "Failed to update GitHub username" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, github });
  } catch (error) {
    console.error("Failed to connect GitHub:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

