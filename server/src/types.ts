export interface SessionState {
  readonly sessionId: string;
  readonly connectedAt: Date;
  lastActivityAt: Date;
  turnCount: number;
  status: "connected" | "listening" | "processing" | "speaking";
}

export interface TokenPayload {
  readonly sessionId: string;
  readonly iat: number;
  readonly exp: number;
}
