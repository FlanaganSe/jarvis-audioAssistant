import { and, desc, eq, gte, sql } from "drizzle-orm";
import OpenAI from "openai";
import { sessionSummaries, sessions } from "../db/schema.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function startOfDay(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface SummaryRow {
  sessionId: string;
  startedAt: Date | null;
  endedAt: Date | null;
  topics: string[];
  entities: unknown;
  keyFacts: unknown;
  unresolved: unknown;
}

async function fetchSummaries(
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle Db type
  db: any,
  userId: string,
  timeframe?: string,
): Promise<SummaryRow[]> {
  let dateFilter: Date | null = null;
  let limit = 20;

  switch (timeframe) {
    case "today":
      dateFilter = startOfDay(0);
      break;
    case "yesterday":
      dateFilter = startOfDay(1);
      break;
    case "this_week":
      dateFilter = startOfDay(7);
      break;
    default:
      limit = 20;
  }

  const conditions = [eq(sessions.userId, userId)];
  if (dateFilter) {
    conditions.push(gte(sessions.startedAt, dateFilter));
  }

  const rows = await db
    .select({
      sessionId: sessionSummaries.sessionId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      topics: sessionSummaries.topics,
      entities: sessionSummaries.entities,
      keyFacts: sessionSummaries.keyFacts,
      unresolved: sessionSummaries.unresolved,
    })
    .from(sessionSummaries)
    .innerJoin(sessions, eq(sessionSummaries.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);

  return rows as SummaryRow[];
}

function keywordMatch(summary: SummaryRow, keywords: string[]): boolean {
  const haystack = [
    ...(summary.topics ?? []),
    JSON.stringify(summary.entities ?? {}),
    JSON.stringify(summary.keyFacts ?? []),
    JSON.stringify(summary.unresolved ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return keywords.some((kw) => haystack.includes(kw));
}

function formatSummary(s: SummaryRow): Record<string, unknown> {
  const startDate = s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "unknown date";
  const durationMin =
    s.startedAt && s.endedAt
      ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
      : null;

  return {
    date: startDate,
    duration_minutes: durationMin,
    topics: s.topics,
    entities: s.entities,
    key_facts: s.keyFacts,
    unresolved: s.unresolved,
  };
}

function createMemoryRecall(): ToolDefinition {
  return {
    name: "memory_recall",
    description:
      "Search past conversation summaries for the user. Use when the user asks about previous conversations or what was discussed before.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for in past conversations",
        },
        timeframe: {
          type: "string",
          enum: ["today", "yesterday", "this_week", "all"],
          description: "Time period to search (default: all)",
        },
      },
      required: ["query"],
    },
    async execute(args, context): Promise<ToolResult> {
      if (!context.userId) {
        return {
          output: JSON.stringify({ error: "No user identity — cannot recall past sessions" }),
          evidence: null,
        };
      }

      const query = args.query as string;
      const timeframe = (args.timeframe as string) ?? "all";
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      const summaries = await fetchSummaries(context.db, context.userId, timeframe);

      if (summaries.length === 0) {
        return {
          output: JSON.stringify({ sessions_found: 0, message: "No past sessions found" }),
          evidence: null,
        };
      }

      // Keyword-based matching
      let matched =
        keywords.length > 0 ? summaries.filter((s) => keywordMatch(s, keywords)) : summaries;

      // If keyword search returns nothing, try pgvector if available
      if (matched.length === 0) {
        try {
          matched = await vectorSearch(context.db, context.userId, query, timeframe);
        } catch {
          // Vector search unavailable — fall back to returning most recent
          matched = summaries.slice(0, 3);
        }
      }

      const top = matched.slice(0, 3).map(formatSummary);
      const firstDate = top[0]?.date ?? "unknown";

      return {
        output: JSON.stringify({ sessions_found: top.length, sessions: top }),
        evidence: {
          source: "memory",
          entity: `session:${firstDate}`,
          fetchedAt: new Date().toISOString(),
          freshnessSec: 0,
          citationRef: `Session from ${firstDate}`,
        },
      };
    },
  };
}

async function vectorSearch(
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle Db type
  db: any,
  userId: string,
  query: string,
  timeframe?: string,
): Promise<SummaryRow[]> {
  try {
    const client = new OpenAI();
    const embResponse = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embResponse.data[0]?.embedding;
    if (!queryEmbedding) return [];

    const embStr = `[${queryEmbedding.join(",")}]`;

    // Build parameterized query based on timeframe
    const dateClause =
      timeframe === "today"
        ? sql`AND s.started_at >= CURRENT_DATE`
        : timeframe === "yesterday"
          ? sql`AND s.started_at >= CURRENT_DATE - INTERVAL '1 day'`
          : timeframe === "this_week"
            ? sql`AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'`
            : sql``;

    const rows = await db.execute(
      sql`SELECT ss.session_id, s.started_at, s.ended_at, ss.topics, ss.entities, ss.key_facts, ss.unresolved
          FROM session_summaries ss
          INNER JOIN sessions s ON ss.session_id = s.id
          WHERE s.user_id = ${userId} ${dateClause}
            AND ss.embedding IS NOT NULL
          ORDER BY ss.embedding <=> ${embStr}::vector
          LIMIT 3`,
    );

    return (rows.rows ?? rows) as SummaryRow[];
  } catch {
    return [];
  }
}

export function registerMemoryTools(registry: ToolRegistry): void {
  registry.register(createMemoryRecall());
}
