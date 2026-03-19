import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { messages, sessions } from "../db/schema.js";

export async function createDbSession(db: Db, userId?: string): Promise<string> {
  const [row] = await db
    .insert(sessions)
    .values(userId ? { userId } : {})
    .returning({ id: sessions.id });
  if (!row) throw new Error("Failed to create session row");
  return row.id;
}

export async function endDbSession(db: Db, sessionId: string): Promise<void> {
  await db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function saveMessage(
  db: Db,
  sessionDbId: string,
  msg: {
    role: string;
    content: string;
    toolCalls?: unknown;
    toolName?: string;
    evidence?: unknown;
  },
): Promise<void> {
  await db.insert(messages).values({
    sessionId: sessionDbId,
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls ?? null,
    toolName: msg.toolName ?? null,
    evidence: msg.evidence ?? null,
  });
}
