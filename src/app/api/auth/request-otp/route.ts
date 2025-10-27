import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { addSeconds, generateNumericOTP, safeNumberEnv } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mailer";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { email } = bodySchema.parse(json);

    const supabase = getSupabaseClient();

    // Tìm hoặc tạo user theo email
    const { data: existingUser, error: fetchUserError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (fetchUserError) {
      throw new Error(`Failed to look up user: ${fetchUserError.message}`);
    }

    let userId = existingUser?.id as string | undefined;
    if (!userId) {
      const { data: createdUser, error: createUserError } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .single();
      if (createUserError || !createdUser) {
        throw new Error(`Failed to create user: ${createUserError?.message ?? "unknown error"}`);
      }
      userId = createdUser.id as string;
    }

    const OTP_TTL_SECONDS = safeNumberEnv("OTP_TTL_SECONDS", 300);
    const OTP_MAX_ATTEMPTS = safeNumberEnv("OTP_MAX_ATTEMPTS", 5);

    // Tạo OTP & tokenId
    const otp = generateNumericOTP(6);
    const otpHash = await bcrypt.hash(otp, 10);

    // (Tuỳ chọn) Có thể vô hiệu hoá các OTP cũ còn PENDING cho user này tại đây
    const { error: expireError } = await supabase
      .from("otp_tokens")
      .update({ status: "EXPIRED" })
      .eq("user_id", userId)
      .eq("status", "PENDING");
    if (expireError) {
      throw new Error(`Failed to expire old OTPs: ${expireError.message}`);
    }

    // Lưu OTP
    const expiresAt = addSeconds(new Date(), OTP_TTL_SECONDS).toISOString();
    const { data: otpRecord, error: createOtpError } = await supabase
      .from("otp_tokens")
      .insert({
        user_id: userId,
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempts_left: OTP_MAX_ATTEMPTS,
        status: "PENDING",
      })
      .select("id")
      .single();
    if (createOtpError || !otpRecord) {
      throw new Error(`Failed to store OTP: ${createOtpError?.message ?? "unknown error"}`);
    }

    // Gửi mail
    const tokenId = otpRecord.id as string;
    await sendOtpEmail(email, otp, tokenId);

    return NextResponse.json({ ok: true, tokenId });
  } catch (e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Bad Request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
