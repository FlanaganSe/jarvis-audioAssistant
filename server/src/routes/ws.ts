import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { verifyToken } from "../services/auth.js";
import { createRelaySession } from "../services/relay.js";
import { sessionManager } from "../services/session.js";

export function registerWsRoute(fastify: FastifyInstance, config: Config): void {
  fastify.get("/ws/relay", { websocket: true }, async (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(4001, "Missing token");
      return;
    }

    const payload = await verifyToken(token, config.jwtSecret);
    if (!payload) {
      socket.close(4001, "Invalid or expired token");
      return;
    }

    // Use a unique connectionId per WebSocket (the JWT sessionId may be reused)
    const connectionId = crypto.randomUUID();
    const session = sessionManager.create(connectionId);
    fastify.log.info({ connectionId }, "WebSocket session started");

    createRelaySession(socket, config, session);

    socket.on("close", () => {
      sessionManager.remove(connectionId);
      fastify.log.info(
        { connectionId, duration: Date.now() - session.connectedAt.getTime() },
        "WebSocket session ended",
      );
    });
  });
}
