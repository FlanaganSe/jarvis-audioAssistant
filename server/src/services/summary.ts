import { eq } from "drizzle-orm";
import OpenAI from "openai";
import type { Db } from "../db/index.js";
import { messages, sessionSummaries } from "../db/schema.js";

const SUMMARY_PROMPT = `Given this conversation transcript, extract a structured summary as JSON:
{
  "topics": ["list of topics discussed"],
  "entities": { "repos": [], "prs": [], "issues": [], "locations": [] },
  "key_facts": ["important facts discussed or retrieved"],
  "unresolved": ["questions or follow-ups that weren't completed"]
}

Only return valid JSON. If a field has no entries, use an empty array.`;

export async function generateSessionSummary(
  db: Db,
  sessionDbId: string,
  openaiApiKey: string,
): Promise<void> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionDbId))
    .orderBy(messages.createdAt);

  if (rows.length === 0) return;

  const transcript = rows.map((r) => `${r.role}: ${r.content}`).join("\n");

  const client = new OpenAI({ apiKey: openaiApiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: transcript },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty summary response");

  const summary = JSON.parse(raw) as {
    topics: string[];
    entities: Record<string, unknown>;
    key_facts: unknown[];
    unresolved: unknown[];
  };

  await db.insert(sessionSummaries).values({
    sessionId: sessionDbId,
    topics: summary.topics ?? [],
    entities: summary.entities ?? {},
    keyFacts: summary.key_facts ?? [],
    unresolved: summary.unresolved ?? [],
  });
}
