import crypto from "crypto";

export function generateNumericOTP(length = 6) {
  // OTP số, tránh leading-zero bị mất: padStart
  const num = (Math.floor(Math.random() * 10 ** length)).toString().padStart(length, "0");
  return num;
}

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

export function safeNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function randomTokenId() {
  return crypto.randomBytes(16).toString("hex");
}
