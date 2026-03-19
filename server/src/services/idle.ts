import { SESSION } from "@jarvis/shared";
import type { FastifyBaseLogger } from "fastify";
import WebSocket from "ws";
import { sessionManager } from "./session.js";

export function startIdleChecker(log: FastifyBaseLogger): () => void {
  const interval = setInterval(() => {
    const now = Date.now();
    sessionManager.forEachSession((session) => {
      const idleMs = now - session.lastActivityAt.getTime();
      if (idleMs > SESSION.IDLE_TIMEOUT_MS && session.wsRef) {
        log.info({ sessionId: session.sessionId, idleMs }, "Closing idle session");
        if (session.wsRef.readyState === WebSocket.OPEN) {
          session.wsRef.send(JSON.stringify({ type: "session.timeout" }));
          session.wsRef.close(1000, "Idle timeout");
        }
      }
    });
  }, SESSION.IDLE_CHECK_INTERVAL_MS);

  return () => clearInterval(interval);
}
