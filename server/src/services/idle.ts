import { SESSION } from "@jarvis/shared";
import type { FastifyBaseLogger } from "fastify";

export function startIdleChecker(_log: FastifyBaseLogger): () => void {
  // Idle timeout checking will be wired up in CP5 when WebSocket refs are available
  const interval = setInterval(() => {
    // Placeholder — will check session.lastActivityAt in CP5
  }, SESSION.IDLE_CHECK_INTERVAL_MS);

  return () => clearInterval(interval);
}
