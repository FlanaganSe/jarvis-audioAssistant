import { describe, expect, it } from "vitest";
import { signToken } from "./auth.js";
import { authenticateBearerToken, getBearerToken } from "./http-auth.js";

describe("http-auth", () => {
  it("extracts a bearer token from the authorization header", () => {
    expect(getBearerToken("Bearer abc123")).toBe("abc123");
    expect(getBearerToken("bearer abc123")).toBe("abc123");
  });

  it("rejects malformed authorization headers", () => {
    expect(getBearerToken(undefined)).toBeNull();
    expect(getBearerToken("Token abc123")).toBeNull();
    expect(getBearerToken("Bearer")).toBeNull();
  });

  it("authenticates a bearer token with a user id", async () => {
    const secret = "test-secret";
    const token = await signToken(secret, "user-123");
    const payload = await authenticateBearerToken(`Bearer ${token}`, secret);

    expect(payload?.userId).toBe("user-123");
  });

  it("rejects tokens that do not carry a user id", async () => {
    const secret = "test-secret";
    const token = await signToken(secret);
    const payload = await authenticateBearerToken(`Bearer ${token}`, secret);

    expect(payload).toBeNull();
  });
});
