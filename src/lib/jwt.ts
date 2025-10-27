import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export type SessionPayload = {
  userId: string;
  email: string;
};

export function signSession(payload: SessionPayload, maxAgeSec = 60 * 60 * 24 * 7) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: maxAgeSec });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
