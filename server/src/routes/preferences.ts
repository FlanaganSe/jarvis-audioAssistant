import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";

function getPrefsArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  return [];
}

export function registerPreferencesRoute(fastify: FastifyInstance): void {
  fastify.get("/api/preferences", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) return reply.status(400).send({ error: "userId required" });

    const db = getDb();
    const [user] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return reply.send({ preferences: user ? getPrefsArray(user.preferences) : [] });
  });

  fastify.delete("/api/preferences/:index", async (request, reply) => {
    const { index } = request.params as { index: string };
    const { userId } = request.query as { userId?: string };
    if (!userId) return reply.status(400).send({ error: "userId required" });

    const idx = Number.parseInt(index, 10);
    if (Number.isNaN(idx)) return reply.status(400).send({ error: "Invalid index" });

    const db = getDb();
    const [user] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return reply.status(404).send({ error: "User not found" });

    const prefs = getPrefsArray(user.preferences);
    if (idx < 0 || idx >= prefs.length)
      return reply.status(400).send({ error: "Index out of range" });

    const removed = prefs.splice(idx, 1)[0];
    await db.update(users).set({ preferences: prefs }).where(eq(users.id, userId));

    return reply.send({ removed, preferences: prefs });
  });
}
