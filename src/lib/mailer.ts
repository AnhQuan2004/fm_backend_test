import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

export async function sendOtpEmail(to: string, otp: string, tokenId: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto;line-height:1.6">
      <h2>Mã xác thực đăng nhập</h2>
      <p>Mã OTP của bạn là:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>
      <p>Mã có hiệu lực trong 5 phút.</p>

      <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />

      <p>Nếu muốn xác thực nhanh, bạn có thể nhấp “Magic Link” (tùy chọn):</p>
      <p>
        <a href="${appUrl}/api/auth/verify-otp?email=${encodeURIComponent(to)}&otp=${otp}&tokenId=${tokenId}"
           style="display:inline-block;background:#0ea5e9;color:white;padding:10px 16px;border-radius:8px;text-decoration:none">
          Đăng nhập nhanh
        </a>
      </p>

      <p style="color:#6b7280">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: "Mã OTP đăng nhập",
    html,
  });
}
