import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/jwt";
import { verifySession } from "@/lib/jwt";
import { getSupabaseClient } from "@/lib/supabase";

const allowBypass = process.env.ALLOW_UNAUTHENTICATED === "true";

function normalizeEnv(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

const envBypassUserId =
  normalizeEnv(process.env.BYPASS_USER_ID) ?? normalizeEnv(process.env.TEST_USER_ID);
const envBypassUserEmail =
  normalizeEnv(process.env.BYPASS_USER_EMAIL) ?? normalizeEnv(process.env.TEST_USER_EMAIL);

let cachedBypassSession: SessionPayload | null | undefined;

async function resolveBypassSession(): Promise<SessionPayload | null> {
  if (!allowBypass) {
    return null;
  }

  if (cachedBypassSession !== undefined) {
    return cachedBypassSession;
  }

  if (envBypassUserId && envBypassUserEmail) {
    cachedBypassSession = { userId: envBypassUserId, email: envBypassUserEmail };
    return cachedBypassSession;
  }

  if (envBypassUserEmail) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("email", envBypassUserEmail)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.id) {
        cachedBypassSession = { userId: data.id, email: envBypassUserEmail };
        return cachedBypassSession;
      }
    } catch (error) {
      console.error("Failed to resolve bypass user", error);
    }
  }

  cachedBypassSession = null;
  return null;
}

export type RequestSession = SessionPayload & { isBypassed: boolean };

export function isAuthBypassEnabled() {
  return allowBypass;
}

export async function getRequestSession(): Promise<RequestSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (sessionCookie) {
    const session = verifySession(sessionCookie.value);
    if (session) {
      return { ...session, isBypassed: false };
    }
  }

  if (allowBypass) {
    const bypassSession = await resolveBypassSession();
    if (bypassSession) {
      return {
        ...bypassSession,
        isBypassed: true,
      };
    }
  }

  return null;
}
