export type SessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "processing"
  | "speaking";

/** Client → Server WebSocket messages */
export type ClientMessage =
  | { type: "audio"; data: string }
  | { type: "commit" }
  | { type: "cancel" }
  | { type: "truncate"; itemId: string; audioEndMs: number };

/** Server → Client WebSocket messages */
export type ServerMessage =
  | { type: "audio"; data: string }
  | { type: "transcript"; role: "user" | "assistant"; text: string; delta: boolean }
  | { type: "status"; status: SessionStatus }
  | { type: "response.started"; itemId: string }
  | { type: "response.done" }
  | { type: "turn.started" }
  | { type: "error"; message: string; code?: string }
  | { type: "session.timeout" }
  | { type: "session.ready" };
