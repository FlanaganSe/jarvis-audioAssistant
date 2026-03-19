import { SESSION } from "@jarvis/shared";
import { SignJWT, jwtVerify } from "jose";
import type { TokenPayload } from "../types.js";

export async function signToken(secret: string, userId?: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const key = new TextEncoder().encode(secret);

  const payload: Record<string, unknown> = { sessionId };
  if (userId) {
    payload.userId = userId;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION.TOKEN_EXPIRY_S}s`)
    .sign(key);
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}
