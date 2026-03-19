import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";

export function registerHealthRoute(fastify: FastifyInstance): void {
  fastify.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/api/health/ready", async (_request, reply) => {
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      return { status: "ready", timestamp: new Date().toISOString() };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(503).send({ status: "unavailable", error: message });
    }
  });
}
