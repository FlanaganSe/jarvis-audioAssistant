import type { Evidence } from "@jarvis/shared";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  output: string;
  evidence: Evidence | null;
}
