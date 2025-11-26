import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { z } from "zod";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/auth";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username phải có ít nhất 3 ký tự")
  .max(50, "Username tối đa 50 ký tự")
  .regex(/^[a-zA-Z0-9._-]+$/, "Username chỉ được chứa chữ, số và ._-");

const profileInputSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email không được bỏ trống")
    .email("Email không hợp lệ"),
  walletAddress: z
    .string()
    .trim()
    .min(1, "Wallet address không được bỏ trống"),
  username: usernameSchema.optional(),
  xpPoints: z
    .number()
    .int("XP phải là số nguyên")
    .min(0, "XP phải lớn hơn hoặc bằng 0")
    .optional(),
  github: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),
});

const profileQuerySchema = z.object({
  walletAddress: z.string().trim().min(1, "Wallet address không được bỏ trống").optional(),
  email: z.string().email().optional(),
  all: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
});

const selectColumns =
  "id,email,wallet_address,username,role,xp_points,github,created_at";

type ProfileRow = {
  id: string;
  email: string;
  wallet_address: string;
  username: string | null;
  role: string | null;
  xp_points: number | null;
  github: string | null;
  created_at: string | null;
};

const mapProfile = (row: ProfileRow) => ({
  id: row.id,
  email: row.email,
  walletAddress: row.wallet_address,
  username: row.username ?? "",
  xpPoints: row.xp_points ?? 0,
  role: row.role ?? "user",
  githubUsername: row.github ?? null,
  createdAt: row.created_at,
});

const sanitizeUsername = (value?: string | null) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const sanitizeEmail = (value: string) => value.trim().toLowerCase();
const sanitizeGithubUsername = (value?: string | null) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const parseResult = profileQuerySchema.safeParse({
      walletAddress: req.nextUrl.searchParams.get("walletAddress") ?? undefined,
      email: req.nextUrl.searchParams.get("email") ?? undefined,
      all: req.nextUrl.searchParams.get("all") ?? undefined,
    });

    if (!parseResult.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parseResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { walletAddress, email, all } = parseResult.data;
    const supabase = getSupabaseClient();

    if (all) {
      const { data, error } = await supabase
        .from("users")
        .select(selectColumns)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch profiles: ${error.message}`);
      }

      const profiles = (data as ProfileRow[]).map(mapProfile);
      return jsonWithCors(req, { ok: true, profiles });
    }

    const resolvedWallet = walletAddress?.trim() ?? null;
    let resolvedEmail = email ? sanitizeEmail(email) : null;

    if (!resolvedWallet && !resolvedEmail) {
      const session = await getRequestSession();
      resolvedEmail = session?.email ? sanitizeEmail(session.email) : null;
    }

    if (!resolvedWallet && !resolvedEmail) {
      return jsonWithCors(
        req,
        { ok: false, error: "Missing walletAddress hoặc email" },
        { status: 400 },
      );
    }

    let builder = supabase.from("users").select(selectColumns);
    if (resolvedWallet) {
      builder = builder.eq("wallet_address", resolvedWallet);
    } else if (resolvedEmail) {
      builder = builder.eq("email", resolvedEmail);
    }

    const { data, error } = await builder.maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch user: ${error.message}`);
    }

    const user = data as ProfileRow | null;
    if (!user) {
      return jsonWithCors(req, { ok: false, error: "User not found" }, { status: 404 });
    }

    return jsonWithCors(req, {
      ok: true,
      profile: mapProfile(user),
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = profileInputSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, walletAddress, username, xpPoints, github } = parsed.data;
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedWalletAddress = walletAddress.trim();
    const sanitizedUsername = sanitizeUsername(username);

    const supabase = getSupabaseClient();

    if (sanitizedUsername) {
      const { data: existingUser, error: lookupError } = await supabase
        .from("users")
        .select("email")
        .eq("username", sanitizedUsername)
        .neq("email", sanitizedEmail)
        .maybeSingle();

      if (lookupError) {
        throw new Error(`Failed to check username availability: ${lookupError.message}`);
      }

      if (existingUser) {
        return jsonWithCors(
          req,
          { ok: false, error: { username: ["Username đã được sử dụng"] } },
          { status: 400 },
        );
      }
    }

    const { data: walletOwner, error: walletLookupError } = await supabase
      .from("users")
      .select("email")
      .eq("wallet_address", sanitizedWalletAddress)
      .neq("email", sanitizedEmail)
      .maybeSingle();

    if (walletLookupError) {
      throw new Error(`Failed to check wallet ownership: ${walletLookupError.message}`);
    }

    if (walletOwner) {
      return jsonWithCors(
        req,
        { ok: false, error: { walletAddress: ["Wallet đã thuộc về user khác"] } },
        { status: 400 },
      );
    }

    const payload = {
      email: sanitizedEmail,
      wallet_address: sanitizedWalletAddress,
      username: sanitizedUsername,
      ...(xpPoints !== undefined ? { xp_points: xpPoints } : {}),
      ...(sanitizeGithubUsername(github) ? { github: sanitizeGithubUsername(github) } : {}),
    };

    const { data, error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "email" })
      .select(selectColumns)
      .single();

    if (error) {
      throw new Error(`Failed to save profile: ${error.message}`);
    }

    return jsonWithCors(req, {
      ok: true,
      profile: mapProfile(data as ProfileRow),
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to save profile" }, { status: 500 });
  }
}
