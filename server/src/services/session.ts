import type { SessionState } from "../types.js";

class SessionManager {
  private readonly sessions = new Map<string, SessionState>();

  create(sessionId: string): SessionState {
    const session: SessionState = {
      sessionId,
      dbSessionId: "",
      connectedAt: new Date(),
      lastActivityAt: new Date(),
      turnCount: 0,
      status: "connected",
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  forEachSession(fn: (session: SessionState) => void): void {
    for (const session of this.sessions.values()) {
      fn(session);
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();
