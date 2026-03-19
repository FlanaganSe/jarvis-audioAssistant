# Milestone: Polish Pass — Review, Test, Ship

You are implementing a two-part polish milestone for the Jarvis voice assistant. Read this entire prompt before writing any code.

---

## Context

Jarvis is a real-time voice assistant monorepo (shared/server/client). A prior Codex pass left ~726 lines of uncommitted changes that pass all checks. Your job is to:

1. Review and commit those changes with one small fix (Part A)
2. Add targeted tests and production static serving (Part B)

**Read before acting:**
- `.claude/plans/plan.md` — the full plan with rationale
- `.claude/plans/research.md` — the codebase audit with verified findings

---

## Part A: Review and commit the Codex changes

### What exists as uncommitted changes

Run `git status` to see the full list. Key changes:
- CI workflow (`.github/workflows/ci.yml`), `.nvmrc`, `vitest.config.ts`
- Bearer auth for REST routes (`server/src/services/http-auth.ts`, modified route files)
- Graceful shutdown (`server/src/services/summary-jobs.ts`, modified `index.ts` and `relay.ts`)
- 4 test files with 10 tests
- 4 new docs (`architecture.md`, `DEVELOPMENT.md`, `TESTING.md`, `DEPLOYMENT.md`)
- Client auto-connect, UI polish, rewritten README
- Deleted stale `server/.env.example`

### Steps

1. **Run `pnpm verify`** to confirm the current state passes. Do not proceed if it fails. This runs typecheck + lint + test + build.

2. **Remove the dead `status` variant from `ServerMessage`** in `shared/src/types.ts`. The line to remove is:
   ```
   | { type: "status"; status: SessionStatus }
   ```
   This variant is never sent by the server and never handled by the client. Grep for `type: "status"` in the server and client to confirm before removing. Do NOT remove the `SessionStatus` type itself — only the `ServerMessage` union member that uses it.

3. **Run `pnpm verify` again** to confirm the type removal doesn't break anything.

4. **Commit all changes** (both the Codex modifications and your type fix) as a single commit. Use a message like:
   ```
   feat: polish pass — CI, tests, bearer auth, auto-connect, docs, UX improvements
   ```

---

## Part B: Additional tests + production static serving

### B1: Add weather freshness tests

**File:** `server/src/tools/weather.test.ts` (new, co-located with `weather.ts`)

**What to test:** The freshness enforcement logic is a core trust guarantee. The weather tool has three code paths:
1. Cache hit with fresh data (age <= 180s) → returns cached data with evidence
2. Cache hit with stale data (age > 180s) → falls through to API fetch
3. API fetch fails → returns error, never returns stale data

**How to test:** Use `vi.mock()` to mock `../services/cache.js` (cacheGet/cacheSet) and `global.fetch`. The weather tool is created via `createWeatherTool(config)` inside `registerWeatherTools()`, but the tool definition is not directly exported. You have two options:
- **Option A (preferred):** Register the tool on a fresh `ToolRegistry` instance via `registerWeatherTools(registry, config)`, then call `registry.execute("weather_get_current", args, context)`. This tests through the real registration path.
- **Option B:** If option A is too coupled, extract the freshness check into a testable helper.

**Test cases (minimum):**
- Fresh cache hit returns data and evidence with correct `freshnessSec`
- Stale cache falls through to fetch, returns fresh data
- Fetch failure returns error output with `evidence: null`
- Successful fetch calls `cacheSet` with 180s TTL and `addPolledCity`

**Pattern to follow:** Look at `server/src/services/auth.test.ts` and `tool-registry.test.ts` for the existing test style. Use `describe`/`it`/`expect`. Keep tests focused and readable.

**Important:** The `ToolContext` passed to `execute` needs `{ userId: "test", sessionId: "test", db: {} as any }`. The weather tool doesn't use the db, so a stub is fine.

### B2: Add memory keyword matching tests

**File:** `server/src/tools/memory.test.ts` (new, co-located with `memory.ts`)

**What to test:** The `keywordMatch` function and `startOfDay`/`formatSummary` helpers are pure functions that can be tested without mocking the database.

**Required change to production code:** Export `keywordMatch`, `startOfDay`, and `formatSummary` from `server/src/tools/memory.ts`. These are pure functions — exporting them doesn't change behavior and improves testability. Add the `export` keyword to their function declarations. Do NOT change any other logic.

**Test cases (minimum):**
- `keywordMatch` returns true when a keyword appears in topics
- `keywordMatch` returns true when a keyword appears in entities JSON
- `keywordMatch` returns false when no keywords match
- `keywordMatch` filters out short keywords (< 3 chars) — wait, that filtering happens in the tool's execute function, not in keywordMatch. Test accordingly.
- `startOfDay(0)` returns today at midnight
- `startOfDay(1)` returns yesterday at midnight
- `formatSummary` returns correctly shaped object with date and duration

### B3: Add config validation tests

**File:** `server/src/config.test.ts` (new, co-located with `config.ts`)

**What to test:** The `loadConfig()` function validates env vars.

**How to test:** Save and restore `process.env` in beforeEach/afterEach. Set the 4 required vars, then test:
- All required vars present → returns Config object with correct values
- Missing `OPENAI_API_KEY` → throws with message containing "OPENAI_API_KEY"
- Missing `DATABASE_URL` → throws with message containing "DATABASE_URL"
- Optional `PORT` defaults to 3001 when not set
- Optional `JWT_SECRET` auto-generates when not set (check that `process.env.JWT_SECRET` gets set)

**Important:** `loadConfig()` mutates `process.env.JWT_SECRET` if it's missing. Clean up after each test by restoring the original env snapshot.

### B4: Add production static file serving

**Install:** `pnpm --filter server add @fastify/static`

**File to modify:** `server/src/index.ts`

**What to add:** After registering other plugins, conditionally serve the client build:

```typescript
import { fileURLToPath } from "node:url";
import path from "node:path";
import fastifyStatic from "@fastify/static";

// Serve client build if it exists (production)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

// In production (node dist/index.js), __dirname is server/dist,
// so ../../client/dist resolves correctly.
// In dev (tsx src/index.ts), __dirname is server/src,
// so ../../client/dist also resolves correctly.
// Both paths work because the monorepo layout is fixed.

import { existsSync } from "node:fs";
if (existsSync(clientDistPath)) {
  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: "/",
    wildcard: false, // Don't intercept API/WS routes
  });

  // SPA fallback: serve index.html for non-API routes
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/ws/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}
```

**Critical details:**
- The `wildcard: false` option prevents static serving from intercepting `/api/*` and `/ws/*` routes.
- The SPA fallback ensures client-side routing works (if added later).
- `existsSync` check means this no-ops in dev mode when `client/dist/` doesn't exist.
- Register static AFTER API routes so API routes take precedence.
- Import `@fastify/static` with the ESM import pattern. The package name is `@fastify/static`, the import is `import fastifyStatic from "@fastify/static"` — this is a default export, which is fine (Biome's `noDefaultExport` rule is off).

### B5: Fix doc/code divergences

1. **`docs/PRD.md`** — In section 11 (Data Model), the schema block lists `ApiCache` and `GitHubCache` tables. These were never implemented. Add a note below the schema block:
   ```
   > **Implementation note:** `ApiCache` and `GitHubCache` tables are not yet implemented. Weather caching uses Redis (180s TTL). GitHub data is fetched on demand without a caching layer.
   ```
   Do NOT delete the tables from the PRD — they may be built later. Just clarify current state.

2. **`.env.example`** — Add a comment about pgvector:
   ```
   DATABASE_URL=postgres://user:pass@localhost:5432/jarvis  # PostgreSQL with pgvector extension required
   ```

3. **`docs/TESTING.md`** — Update the "What is covered" section to include the new test files you added (weather freshness, memory keyword matching, config validation).

### B6: Final verification and commit

1. Run `pnpm verify` — must pass with all new tests.
2. Run `pnpm test` separately and confirm the new test count (should be ~16-20 tests total, up from 10).
3. Commit with a message like:
   ```
   feat: add critical-path tests, production static serving, doc fixes
   ```

---

## Conventions you MUST follow

- **Named exports** for all new functions. No default exports except where required (fastifyStatic import is fine).
- **`.js` extensions** in all import paths (ESM convention used throughout this repo).
- **Co-located tests:** `foo.ts` → `foo.test.ts` in the same directory.
- **Inline styles with token objects** from `client/src/styles.ts` if you touch any client code.
- **Evidence pattern:** If you somehow need to modify a tool, every tool returns `{ output: string, evidence: Evidence | null }`. Never break this contract.
- **Graceful degradation:** Never throw from a path that should degrade (Redis, embeddings, etc.).

## Safety rules

- **Do NOT modify the relay logic** (`server/src/services/relay.ts`) beyond what Codex already changed. The relay is the critical path and is working.
- **Do NOT change the OpenAI session.update schema** or audio configuration. These are verified working.
- **Do NOT add dependencies** beyond `@fastify/static` and `vitest` (already added).
- **Do NOT restructure the project layout.** Keep the shared/server/client boundary.
- **Run `pnpm verify` after every significant change,** not just at the end. If it fails 3 times after fixes, stop and report.
- **Do NOT modify any tool's execute logic.** You are only adding tests for existing behavior and exporting pure helpers.
- **When mocking in tests**, mock at the module boundary (`vi.mock("../services/cache.js")`), not by monkey-patching objects. Restore mocks in `afterEach`.

## Quality bar

When done, these should be true:
- `pnpm verify` passes (typecheck + lint + 16+ tests + build)
- Every new test file has a clear `describe` block and tests real behavior, not implementation details
- No test depends on network, database, or external API
- The server can serve the client build via `pnpm build && node server/dist/index.js`
- Git log shows two clean, well-messaged commits on top of the existing history
- No regressions: everything that worked before still works
