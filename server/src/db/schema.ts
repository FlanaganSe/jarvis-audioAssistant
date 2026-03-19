import { customType, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    const str = String(value);
    return str.replace(/[[\]]/g, "").split(",").map(Number);
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  displayName: text("display_name"),
  preferences: jsonb("preferences").default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  metadata: jsonb("metadata").default("{}"),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  toolName: text("tool_name"),
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sessionSummaries = pgTable("session_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
  topics: text("topics").array().notNull(),
  entities: jsonb("entities").notNull(),
  keyFacts: jsonb("key_facts").notNull(),
  unresolved: jsonb("unresolved").notNull(),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
