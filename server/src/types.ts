import type { WebSocket } from "ws";

export interface SessionState {
  readonly sessionId: string;
  dbSessionId: string;
  readonly connectedAt: Date;
  lastActivityAt: Date;
  turnCount: number;
  status: "connected" | "listening" | "processing" | "speaking";
  wsRef?: WebSocket;
}

export interface TokenPayload {
  readonly sessionId: string;
  readonly iat: number;
  readonly exp: number;
}
