import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";
import { sessionSummaries, sessions } from "../db/schema.js";

export function registerSessionsRoute(fastify: FastifyInstance): void {
  fastify.get("/api/sessions/recent", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) return reply.status(400).send({ error: "userId required" });

    const db = getDb();
    const rows = await db
      .select({
        sessionId: sessions.id,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        topics: sessionSummaries.topics,
        entities: sessionSummaries.entities,
      })
      .from(sessions)
      .leftJoin(sessionSummaries, eq(sessionSummaries.sessionId, sessions.id))
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.startedAt))
      .limit(10);

    return reply.send({ sessions: rows });
  });
}
