import { NextRequest, NextResponse } from "next/server";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getSupabaseClient } from "@/lib/supabase";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { signSession } from "@/lib/jwt";
import { verifySession } from "@/lib/jwt";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

const postSchema = z.object({
    email: z.string().email(),
    otp: z.string().min(6).max(6),
    tokenId: z.string().min(8),
});

// Cho phép verify qua GET (magic link)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email") ?? "";
    const otp = searchParams.get("otp") ?? "";
    const tokenId = searchParams.get("tokenId") ?? "";
    return verifyCore({ email, otp, tokenId }, /*redirectOnSuccess*/ true, req);
}

export async function POST(req: NextRequest) {
    const json = await req.json();
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
        return jsonWithCors(req, { ok: false, error: "Invalid payload" }, { status: 400 });
    }
    return verifyCore(parsed.data, false, req);
}

async function verifyCore(
    data: { email: string; otp: string; tokenId: string },
    redirectOnSuccess: boolean,
    req: NextRequest // Make req required, not optional
) {
    try {
        const supabase = getSupabaseClient();

        const { data: userData, error: userError } = await supabase
            .from("users")
            .select(
                "id,email,username,first_name,last_name,location,skills,socials,github,display_name,bio,role"
            )
            .eq("email", data.email)
            .maybeSingle();
        if (userError) {
            throw new Error(`Failed to look up user: ${userError.message}`);
        }
        const user = userData as {
            id: string;
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
        } | null;
        if (!user) {
            return jsonWithCors(req, { ok: false, error: "Email không tồn tại" }, { status: 400 });
        }

        const { data: tokenData, error: tokenError } = await supabase
            .from("otp_tokens")
            .select("id,user_id,otp_hash,expires_at,attempts_left,status")
            .eq("id", data.tokenId)
            .maybeSingle();
        if (tokenError) {
            throw new Error(`Failed to retrieve OTP token: ${tokenError.message}`);
        }
        const record = tokenData as {
            id: string;
            user_id: string;
            otp_hash: string;
            expires_at: string;
            attempts_left: number;
            status: "PENDING" | "USED" | "EXPIRED";
        } | null;
        if (!record || record.user_id !== user.id) {
            return jsonWithCors(req, { ok: false, error: "Token không hợp lệ" }, { status: 400 });
        }

        if (record.status !== "PENDING") {
            return jsonWithCors(req, { ok: false, error: "OTP đã dùng hoặc không còn hiệu lực" }, { status: 400 });
        }

        const expiresAt = new Date(record.expires_at);
        if (Number.isNaN(expiresAt.getTime()) || new Date() > expiresAt) {
            const { error: expireError } = await supabase
                .from("otp_tokens")
                .update({ status: "EXPIRED" })
                .eq("id", record.id);
            if (expireError) {
                console.error("Failed to expire OTP after timeout:", expireError);
            }
            return jsonWithCors(req, { ok: false, error: "OTP hết hạn" }, { status: 400 });
        }

        if (record.attempts_left <= 0) {
            const { error: expireError } = await supabase
                .from("otp_tokens")
                .update({ status: "EXPIRED" })
                .eq("id", record.id);
            if (expireError) {
                console.error("Failed to expire OTP after attempts exceeded:", expireError);
            }
            return jsonWithCors(req, { ok: false, error: "Đã vượt quá số lần thử" }, { status: 400 });
        }

        const ok = await bcrypt.compare(data.otp, record.otp_hash);
        if (!ok) {
            const nextAttempts = Math.max(record.attempts_left - 1, 0);
            const { error: decrementError } = await supabase
                .from("otp_tokens")
                .update({ attempts_left: nextAttempts })
                .eq("id", record.id);
            if (decrementError) {
                console.error("Failed to decrement OTP attempts:", decrementError);
            }
            return jsonWithCors(req, { ok: false, error: "OTP sai" }, { status: 400 });
        }

        // Thành công → đánh dấu USED
        const { error: markUsedError } = await supabase
            .from("otp_tokens")
            .update({ status: "USED" })
            .eq("id", record.id);
        if (markUsedError) {
            throw new Error(`Failed to update OTP status: ${markUsedError.message}`);
        }

        // Tạo session cookie
        const token = signSession({ userId: user.id, email: user.email });
        (await cookies()).set("session", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 ngày
        });
        const sessionData = verifySession(token);
        if (redirectOnSuccess) {
            // Điều hướng về trang chủ hoặc dashboard
            const redirectUrl = new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
            const response = NextResponse.redirect(redirectUrl);
            
            // Add CORS headers to the redirect response
            const origin = req.headers.get("origin") || "*";
            response.headers.set("Access-Control-Allow-Origin", origin);
            response.headers.set("Access-Control-Allow-Credentials", "true");
            
            return response;
        }

        return jsonWithCors(req, {
            ok: true,
            user: {
                email: user.email,
                userId: sessionData?.userId,
                username: user.username ?? null,
                firstName: user.first_name ?? null,
                lastName: user.last_name ?? null,
                location: user.location ?? null,
                skills: user.skills ?? [],
                socials: user.socials ?? null,
                github: user.github ?? null,
                displayName: user.display_name ?? null,
                bio: user.bio ?? null,
                role: user.role ?? "user",
            },
        });
    } catch (e: unknown) {
        console.error(e);
        const message = e instanceof Error ? e.message : "Verify error";
        return jsonWithCors(req, { ok: false, error: message }, { status: 400 });
    }
}