import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function connectDb(databaseUrl: string): ReturnType<typeof drizzle<typeof schema>> {
  if (db) return db;
  sql = postgres(databaseUrl);
  db = drizzle(sql, { schema });
  return db;
}

export async function disconnectDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) throw new Error("Database not connected — call connectDb() first");
  return db;
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;
