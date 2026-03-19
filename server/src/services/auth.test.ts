import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./auth.js";

describe("auth", () => {
  it("signs and verifies a token with a user id", async () => {
    const secret = "test-secret";
    const token = await signToken(secret, "user-123");
    const payload = await verifyToken(token, secret);

    expect(payload?.userId).toBe("user-123");
    expect(payload?.sessionId).toEqual(expect.any(String));
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken("secret-a", "user-123");
    const payload = await verifyToken(token, "secret-b");

    expect(payload).toBeNull();
  });
});
