import type { FastifyInstance } from "fastify";

export function registerHealthRoute(fastify: FastifyInstance): void {
  fastify.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
