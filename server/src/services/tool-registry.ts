import type { ToolContext, ToolDefinition, ToolResult } from "../tools/types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ReadonlyArray<ToolDefinition> {
    return [...this.tools.values()];
  }

  getOpenAITools(): ReadonlyArray<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return [...this.tools.values()].map((t) => ({
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(args, context);
  }
}

export const toolRegistry = new ToolRegistry();
