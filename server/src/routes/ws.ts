import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { getDb } from "../db/index.js";
import { verifyToken } from "../services/auth.js";
import { createDbSession } from "../services/persistence.js";
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

    // Associate userId from JWT
    if (payload.userId) {
      session.userId = payload.userId;
    }

    // Create a DB session row
    try {
      const db = getDb();
      session.dbSessionId = await createDbSession(db, payload.userId);
    } catch (err) {
      fastify.log.warn({ connectionId, err }, "Failed to create DB session (non-fatal)");
    }

    fastify.log.info({ connectionId, userId: payload.userId }, "WebSocket session started");

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
