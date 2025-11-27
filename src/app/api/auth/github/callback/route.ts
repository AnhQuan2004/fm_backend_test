import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { signSession } from "@/lib/jwt";
import { handleOptions, jsonWithCors } from "@/lib/cors";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return jsonWithCors(
        req,
        { ok: false, error: "Missing code parameter" },
        { status: 400 }
      );
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      console.error("Missing GitHub OAuth credentials");
      return jsonWithCors(
        req,
        { ok: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Step 1: Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Failed to exchange code for token:", tokenResponse.statusText);
      return jsonWithCors(
        req,
        { ok: false, error: "Failed to authenticate with GitHub" },
        { status: 401 }
      );
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("GitHub OAuth error:", tokenData.error_description || tokenData.error);
      return jsonWithCors(
        req,
        { ok: false, error: tokenData.error_description || "GitHub authentication failed" },
        { status: 401 }
      );
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error("No access token in response");
      return jsonWithCors(
        req,
        { ok: false, error: "Failed to get access token" },
        { status: 401 }
      );
    }

    // Step 2: Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userResponse.ok) {
      console.error("Failed to get user info from GitHub:", userResponse.statusText);
      return jsonWithCors(
        req,
        { ok: false, error: "Failed to get user information" },
        { status: 401 }
      );
    }

    const githubUser = await userResponse.json();

    let userEmail = githubUser.email;
    const githubUsername = githubUser.login;
    const githubId = githubUser.id;

    if (!userEmail) {
      // Try to get email from GitHub API (requires user:email scope)
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: { primary: boolean }) => e.primary);
        if (primaryEmail) {
          userEmail = primaryEmail.email;
        } else if (emails.length > 0) {
          // Use first email if no primary found
          userEmail = emails[0].email;
        }
      }
    }

    if (!userEmail) {
      return jsonWithCors(
        req,
        { ok: false, error: "Email not available from GitHub. Please ensure your email is public or grant email access." },
        { status: 400 }
      );
    }

    // Step 3: Create or update user in database
    const supabase = getSupabaseClient();

    // Check if user exists
    const { data: existingUser, error: lookupError } = await supabase
      .from("users")
      .select("id, email, wallet_address")
      .eq("email", userEmail)
      .maybeSingle();

    if (lookupError && lookupError.code !== "PGRST116") {
      console.error("Failed to lookup user:", lookupError);
      return jsonWithCors(
        req,
        { ok: false, error: "Database error" },
        { status: 500 }
      );
    }

    let userId: string;
    let walletAddress: string;

    if (existingUser) {
      // Update existing user with GitHub info
      userId = existingUser.id;
      walletAddress = existingUser.wallet_address || "";

      const { error: updateError } = await supabase
        .from("users")
        .update({ github: githubUsername })
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to update GitHub username:", updateError);
        // Continue anyway, not critical
      }
    } else {
      // Create new user
      // Don't set wallet_address if empty to avoid unique constraint violation
      // User can add wallet later
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          email: userEmail,
          // wallet_address: not included, will be NULL in database
          github: githubUsername,
          username: githubUsername, // Use GitHub username as default
        })
        .select("id, wallet_address")
        .single();

      if (createError) {
        console.error("Failed to create user:", createError);
        return jsonWithCors(
          req,
          { ok: false, error: "Failed to create user account" },
          { status: 500 }
        );
      }

      userId = newUser.id;
      walletAddress = newUser.wallet_address || "";
    }

    // Step 4: Create JWT session
    const sessionToken = signSession({
      userId,
      email: userEmail,
    });

    // Step 5: Create response with session cookie
    const response = jsonWithCors(
      req,
      {
        ok: true,
        session: sessionToken,
        user: {
          id: userId,
          email: userEmail,
          githubUsername,
          walletAddress,
        },
      },
      { status: 200 }
    );

    // Set session cookie
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    return jsonWithCors(
      req,
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

