import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { getDb } from "../db/index.js";
import { sessionSummaries, sessions } from "../db/schema.js";
import { authenticateBearerToken } from "../services/http-auth.js";

export function registerSessionsRoute(fastify: FastifyInstance, config: Config): void {
  fastify.get("/api/sessions/recent", async (request, reply) => {
    const payload = await authenticateBearerToken(request.headers.authorization, config.jwtSecret);
    if (!payload?.userId) {
      return reply.status(401).send({ error: "Missing or invalid bearer token" });
    }

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
      .where(eq(sessions.userId, payload.userId))
      .orderBy(desc(sessions.startedAt))
      .limit(10);

    return reply.send({ sessions: rows });
  });
}
