/**
 * Seeds a demo user and a prior session summary for reliable demo walkthroughs.
 * Idempotent — safe to run multiple times.
 *
 * Usage: pnpm --filter server seed-demo
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";

const DEMO_EMAIL = "demo@jarvis.local";
const DEMO_SESSION_MARKER = "demo-seed-session";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });

  try {
    // 1. Ensure demo user exists
    let [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, DEMO_EMAIL))
      .limit(1);

    if (!user) {
      const [inserted] = await db
        .insert(schema.users)
        .values({ email: DEMO_EMAIL, displayName: "Demo User", preferences: [] })
        .returning({ id: schema.users.id });
      user = inserted;
      console.log(`Created demo user: ${user?.id}`);
    } else {
      console.log(`Demo user already exists: ${user.id}`);
    }

    const userId = user?.id;
    if (!userId) throw new Error("Failed to resolve demo user ID");

    // 2. Check if seed session with summary already exists
    let hasSeedSession = false;
    const existingSessions = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
      .limit(5);

    for (const s of existingSessions) {
      const summaries = await db
        .select({ id: schema.sessionSummaries.id })
        .from(schema.sessionSummaries)
        .where(eq(schema.sessionSummaries.sessionId, s.id))
        .limit(1);
      if (summaries.length > 0) {
        hasSeedSession = true;
        break;
      }
    }

    if (hasSeedSession) {
      console.log("Seed session already exists — skipping");
    } else {
      // 3. Create a prior session (ended yesterday)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(14, 30, 0, 0);

      const sessionEnd = new Date(yesterday);
      sessionEnd.setMinutes(sessionEnd.getMinutes() + 12);

      const [session] = await db
        .insert(schema.sessions)
        .values({
          userId,
          startedAt: yesterday,
          endedAt: sessionEnd,
          metadata: { marker: DEMO_SESSION_MARKER },
        })
        .returning({ id: schema.sessions.id });

      // 4. Add messages to the session
      const sessionId = session?.id;
      if (!sessionId) throw new Error("Failed to create seed session");
      await db.insert(schema.messages).values([
        {
          sessionId,
          role: "user",
          content: "What are the open pull requests on facebook/react?",
        },
        {
          sessionId,
          role: "tool",
          content: JSON.stringify({
            total_shown: 5,
            open_prs: [{ number: 31444, title: "Fix useEffect cleanup timing", author: "acdlite" }],
          }),
          toolName: "github_list_open_prs",
          evidence: {
            source: "github",
            entity: "repo:facebook/react",
            fetchedAt: yesterday.toISOString(),
            freshnessSec: 0,
            citationRef: "GitHub API",
          },
        },
        {
          sessionId,
          role: "assistant",
          content:
            "Facebook React currently has several open pull requests. The most recent one is PR #31444 by acdlite about fixing useEffect cleanup timing.",
        },
        {
          sessionId,
          role: "user",
          content: "Are there any performance-related issues?",
        },
        {
          sessionId,
          role: "assistant",
          content:
            "Let me check the issues for performance labels. I found a few issues related to React performance, including discussions about concurrent rendering optimizations.",
        },
      ]);

      // 5. Create session summary
      await db.insert(schema.sessionSummaries).values({
        sessionId,
        topics: ["open pull requests", "react performance", "facebook/react"],
        entities: { repos: ["facebook/react"], prs: ["31444"], issues: [], locations: [] },
        keyFacts: [
          "Reviewed open PRs on facebook/react",
          "PR #31444 by acdlite about useEffect cleanup timing",
          "Discussed performance-related issues in React",
        ],
        unresolved: ["Follow up on concurrent rendering optimizations"],
      });

      console.log(`Created seed session: ${sessionId} (dated ${yesterday.toLocaleDateString()})`);
    }

    console.log(`\nDemo user ID: ${userId}`);
    console.log(`Set this in your browser: localStorage.setItem('jarvis_userId', '${userId}')`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
