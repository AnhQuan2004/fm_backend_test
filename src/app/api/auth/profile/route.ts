import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/jwt";
import { handleOptions, withCors } from "@/lib/cors";

const profileInputSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .trim()
    .min(3, "Username phải có ít nhất 3 ký tự")
    .max(50, "Username tối đa 50 ký tự")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username chỉ được chứa chữ, số và ._-")
    .optional(),
  firstName: z
    .string()
    .trim()
    .max(60, "First name tối đa 60 ký tự")
    .optional(),
  lastName: z
    .string()
    .trim()
    .max(60, "Last name tối đa 60 ký tự")
    .optional(),
  location: z
    .string()
    .trim()
    .max(120, "Location tối đa 120 ký tự")
    .optional(),
  skills: z
    .array(z.string().trim().min(1, "Kỹ năng không được để trống").max(40, "Tên kỹ năng quá dài"))
    .max(25, "Tối đa 25 kỹ năng")
    .optional(),
  socials: z
    .string()
    .trim()
    .max(200, "Link socials tối đa 200 ký tự")
    .optional(),
  github: z
    .string()
    .trim()
    .max(100, "GitHub username tối đa 100 ký tự")
    .optional(),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name phải có ít nhất 2 ký tự")
    .max(80, "Display name tối đa 80 ký tự")
    .optional(),
  bio: z
    .string()
    .trim()
    .min(3, "Bio phải có ít nhất 3 ký tự")
    .max(280, "Bio tối đa 280 ký tự")
    .optional(),
});

const emailQuerySchema = z.object({
  email: z.string().email().optional(),
});

async function resolveEmail(req: NextRequest): Promise<string | null> {
  const parsedQuery = emailQuerySchema.safeParse({
    email: req.nextUrl.searchParams.get("email") ?? undefined,
  });

  if (parsedQuery.success && parsedQuery.data.email) {
    return parsedQuery.data.email;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) {
    return null;
  }

  const session = verifySession(sessionCookie.value);
  return session?.email ?? null;
}

function jsonWithCors(req: NextRequest, body: unknown, init?: ResponseInit) {
  return withCors(req, NextResponse.json(body, init));
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const email = await resolveEmail(req);
    if (!email) {
      return jsonWithCors(req, { ok: false, error: "Missing email" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select(
        "email,username,first_name,last_name,location,skills,socials,github,display_name,bio,role,updated_at",
      )
      .eq("email", email)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch user: ${error.message}`);
    }

    const user = data as {
      email: string;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      location: string | null;
      skills: string[] | null;
      socials: string | null;
      github: string | null;
      display_name: string | null;
      bio: string | null;
      role: string | null;
      updated_at: string | null;
    } | null;

    if (!user) {
      return jsonWithCors(req, { ok: false, error: "User not found" }, { status: 404 });
    }

    return jsonWithCors(req, {
      ok: true,
      profile: {
        email: user.email,
        username: user.username ?? "",
        firstName: user.first_name ?? "",
        lastName: user.last_name ?? "",
        location: user.location ?? "",
        skills: user.skills ?? [],
        socials: user.socials ?? "",
        github: user.github ?? "",
        displayName: user.display_name ?? "",
        bio: user.bio ?? "",
        role: user.role ?? "user",
        updatedAt: user.updated_at,
      },
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

    const {
      email,
      displayName,
      bio,
      username,
      firstName,
      lastName,
      location,
      skills,
      socials,
      github,
    } = parsed.data;

    const sanitize = (value?: string) => {
      if (value === undefined) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const sanitizedUsername = sanitize(username);
    const sanitizedFirstName = sanitize(firstName);
    const sanitizedLastName = sanitize(lastName);
    const sanitizedLocation = sanitize(location);
    const sanitizedSocials = sanitize(socials);
    const sanitizedGithub = sanitize(github);
    const sanitizedDisplayName = sanitize(displayName);
    const sanitizedBio = sanitize(bio);

    const normalizedSkills =
      skills?.map(skill => skill.trim()).filter(skill => skill.length > 0) ?? [];

    const supabase = getSupabaseClient();
    const payload = {
      email,
      username: sanitizedUsername,
      first_name: sanitizedFirstName,
      last_name: sanitizedLastName,
      location: sanitizedLocation,
      socials: sanitizedSocials,
      github: sanitizedGithub,
      display_name: sanitizedDisplayName,
      bio: sanitizedBio,
      skills: normalizedSkills,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "email" })
      .select(
        "email,username,first_name,last_name,location,skills,socials,github,display_name,bio,role,updated_at",
      )
      .single();

    if (error) {
      throw new Error(`Failed to save profile: ${error.message}`);
    }

    const profile = data as {
      email: string;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      location: string | null;
      skills: string[] | null;
      socials: string | null;
      github: string | null;
      display_name: string | null;
      bio: string | null;
      role: string | null;
      updated_at: string | null;
    };

    return jsonWithCors(req, {
      ok: true,
      profile: {
        email: profile.email,
        username: profile.username ?? "",
        firstName: profile.first_name ?? "",
        lastName: profile.last_name ?? "",
        location: profile.location ?? "",
        skills: profile.skills ?? [],
        socials: profile.socials ?? "",
        github: profile.github ?? "",
        displayName: profile.display_name ?? "",
        bio: profile.bio ?? "",
        role: profile.role ?? "user",
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to save profile" }, { status: 500 });
  }
}
