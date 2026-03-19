import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { signToken } from "../services/auth.js";

export function registerAuthRoute(fastify: FastifyInstance, config: Config): void {
  fastify.post("/api/auth/register", async (request, reply) => {
    const body = request.body as { userId?: string } | undefined;
    const db = getDb();

    // Idempotent: if userId provided and exists, return it
    if (body?.userId) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, body.userId))
        .limit(1);
      if (existing) {
        return reply.send({ userId: existing.id });
      }
    }

    // Create a new demo user
    const email = `demo-${crypto.randomUUID()}@jarvis.local`;
    const [row] = await db
      .insert(users)
      .values({ email, displayName: "Demo User", preferences: [] })
      .returning({ id: users.id });

    if (!row) throw new Error("Failed to create user");
    return reply.send({ userId: row.id });
  });

  fastify.post("/api/auth/token", async (request, reply) => {
    const body = request.body as { userId?: string } | undefined;
    const token = await signToken(config.jwtSecret, body?.userId);
    return reply.send({ token });
  });
}
