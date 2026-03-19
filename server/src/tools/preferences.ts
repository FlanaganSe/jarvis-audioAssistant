import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

const MAX_PREFERENCES = 20;

function getPrefsArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  return [];
}

function createPreferenceSet(): ToolDefinition {
  return {
    name: "preference_set",
    description:
      "Store a standing instruction or preference for the user. Use when the user says 'remember that...', 'from now on...', or 'always/never...'",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "The preference or standing instruction to remember",
        },
      },
      required: ["instruction"],
    },
    async execute(args, context): Promise<ToolResult> {
      if (!context.userId) {
        return {
          output: JSON.stringify({ error: "No user identity — cannot save preferences" }),
          evidence: null,
        };
      }

      const instruction = args.instruction as string;
      const [user] = await context.db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);

      if (!user) {
        return { output: JSON.stringify({ error: "User not found" }), evidence: null };
      }

      const prefs = getPrefsArray(user.preferences);

      if (prefs.length >= MAX_PREFERENCES) {
        return {
          output: JSON.stringify({
            error: `You've reached the maximum of ${MAX_PREFERENCES} preferences. Please remove one first.`,
          }),
          evidence: null,
        };
      }

      prefs.push(instruction);
      await context.db
        .update(users)
        .set({ preferences: prefs })
        .where(eq(users.id, context.userId));

      return {
        output: JSON.stringify({ saved: true, instruction, total: prefs.length }),
        evidence: null,
      };
    },
  };
}

function createPreferenceList(): ToolDefinition {
  return {
    name: "preference_list",
    description: "List all stored preferences for the user",
    parameters: { type: "object", properties: {} },
    async execute(_args, context): Promise<ToolResult> {
      if (!context.userId) {
        return { output: JSON.stringify({ preferences: [] }), evidence: null };
      }

      const [user] = await context.db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);

      const prefs = user ? getPrefsArray(user.preferences) : [];
      return {
        output: JSON.stringify({ preferences: prefs, total: prefs.length }),
        evidence: null,
      };
    },
  };
}

function createPreferenceDelete(): ToolDefinition {
  return {
    name: "preference_delete",
    description:
      "Remove a preference by index (1-based) or by keyword substring match. Use when the user says 'forget that' or 'stop doing X'",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number", description: "1-based index of the preference to remove" },
        keyword: {
          type: "string",
          description: "Keyword to match against preferences (case-insensitive)",
        },
      },
    },
    async execute(args, context): Promise<ToolResult> {
      if (!context.userId) {
        return { output: JSON.stringify({ error: "No user identity" }), evidence: null };
      }

      const [user] = await context.db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);

      if (!user) {
        return { output: JSON.stringify({ error: "User not found" }), evidence: null };
      }

      const prefs = getPrefsArray(user.preferences);
      const index = args.index as number | undefined;
      const keyword = args.keyword as string | undefined;

      let removed: string | null = null;

      if (typeof index === "number") {
        const idx = index - 1; // Convert 1-based to 0-based
        if (idx >= 0 && idx < prefs.length) {
          removed = prefs.splice(idx, 1)[0] ?? null;
        }
      } else if (keyword) {
        const lower = keyword.toLowerCase();
        const matchIdx = prefs.findIndex((p) => p.toLowerCase().includes(lower));
        if (matchIdx >= 0) {
          removed = prefs.splice(matchIdx, 1)[0] ?? null;
        }
      }

      if (!removed) {
        return {
          output: JSON.stringify({ error: "No matching preference found" }),
          evidence: null,
        };
      }

      await context.db
        .update(users)
        .set({ preferences: prefs })
        .where(eq(users.id, context.userId));

      return {
        output: JSON.stringify({ removed, remaining: prefs.length }),
        evidence: null,
      };
    },
  };
}

export function registerPreferenceTools(registry: ToolRegistry): void {
  registry.register(createPreferenceSet());
  registry.register(createPreferenceList());
  registry.register(createPreferenceDelete());
}
