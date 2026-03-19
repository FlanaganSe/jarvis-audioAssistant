import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { signToken } from "../services/auth.js";

export function registerAuthRoute(fastify: FastifyInstance, config: Config): void {
  fastify.post("/api/auth/token", async (_request, reply) => {
    const token = await signToken(config.jwtSecret);
    return reply.send({ token });
  });
}
