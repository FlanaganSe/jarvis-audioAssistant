export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  interrupted?: boolean;
}
