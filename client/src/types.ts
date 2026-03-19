import type { Evidence } from "@jarvis/shared";

export interface ToolCallInfo {
  callId: string;
  name: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  args?: Record<string, unknown>;
  error?: string;
}

export interface ProposalInfo {
  type: "fix_plan" | "pr_outline" | "comment_draft";
  title: string;
  issueRef: string;
  data: Record<string, unknown>;
}

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  interrupted?: boolean;
  evidence?: Evidence[];
  toolCalls?: ToolCallInfo[];
  proposal?: ProposalInfo;
}
