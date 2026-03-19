import type { Evidence } from "@jarvis/shared";
import type { Db } from "../db/index.js";

export interface ToolContext {
  userId?: string;
  sessionId: string;
  db: Db;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolResult {
  output: string;
  evidence: Evidence | null;
}
