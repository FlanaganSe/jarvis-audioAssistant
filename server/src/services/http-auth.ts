import type { TokenPayload } from "../types.js";
import { verifyToken } from "./auth.js";

export function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function authenticateBearerToken(
  authorization: string | undefined,
  secret: string,
): Promise<TokenPayload | null> {
  const token = getBearerToken(authorization);
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token, secret);
  if (!payload?.userId) {
    return null;
  }

  return payload;
}
