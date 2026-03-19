export type SessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "processing"
  | "speaking";

/** Evidence metadata for grounded answers */
export interface Evidence {
  source: string;
  entity: string;
  fetchedAt: string;
  freshnessSec: number;
  citationRef: string;
}

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
  | { type: "session.ready" }
  | {
      type: "tool.started";
      callId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool.done";
      callId: string;
      name: string;
      durationMs: number;
      evidence: Evidence | null;
    }
  | { type: "tool.error"; callId: string; name: string; error: string };
