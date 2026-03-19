import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolRegistry", () => {
  it("registers tools, exposes OpenAI tool definitions, and dispatches execution", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "Echo input",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
      async execute(args) {
        return {
          output: JSON.stringify({ value: args.value }),
          evidence: null,
        };
      },
    });

    expect(registry.get("echo")?.name).toBe("echo");
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getOpenAITools()).toEqual([
      {
        type: "function",
        name: "echo",
        description: "Echo input",
        parameters: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
        },
      },
    ]);

    await expect(
      registry.execute(
        "echo",
        { value: "hello" },
        { db: {} as never, sessionId: "session-1", userId: "user-1" },
      ),
    ).resolves.toEqual({
      output: JSON.stringify({ value: "hello" }),
      evidence: null,
    });
  });

  it("throws for unknown tools", async () => {
    const registry = new ToolRegistry();

    await expect(
      registry.execute(
        "missing",
        {},
        { db: {} as never, sessionId: "session-1", userId: "user-1" },
      ),
    ).rejects.toThrow("Unknown tool: missing");
  });
});
