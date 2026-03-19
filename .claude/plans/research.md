# Jarvis Polish Pass — Deep Research

**Date:** 2026-03-19
**Scope:** Full repo audit, code-path tracing, risk inventory, and prioritized findings for a "serious demo polish" pass.
**Method:** Read every source file, ran all CI commands, traced every execution path, compared docs to code.

---

## 1. Verification Results (Actual Commands Run)

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm install` | Pass (470ms) | Lockfile up to date |
| `pnpm typecheck` | Pass | All 3 workspace packages clean |
| `pnpm lint` | Pass | 62 files checked, no issues |
| `pnpm build` | Pass | Server tsc + Client vite build (496ms, 218KB gzip 69KB) |
| `pnpm test` | **Vacuous pass** | No test runner installed, no test files exist. Script runs `pnpm -r test` which matches 3 packages, none define a `test` script. Outputs nothing. |
| `pnpm ci` | **Fails** | `pnpm ci` invokes pnpm's built-in (unimplemented) `ci` command, NOT the package.json script. Must use `pnpm run ci`. |
| `pnpm run ci` | Pass | Runs typecheck → lint → test. Passes because test is vacuous. |

**Critical finding:** The `ci` script in root `package.json` is named `"ci"` which collides with pnpm's built-in `ci` command. `pnpm ci` fails with `ERR_PNPM_CI_NOT_IMPLEMENTED`. You must use `pnpm run ci`. This means any GitHub Actions workflow using `pnpm ci` will fail.

---

## 2. Findings by Area

### 2.1 Workspace Structure

**Layout (3 packages):**
```
shared/    → @jarvis/shared   — types + constants, consumed as TS source (no build step)
server/    → @jarvis/server   — Fastify backend (56 files, ~2,700 LOC)
client/    → @jarvis/client   — React + Vite companion UI (18 files, ~1,800 LOC)
```

**Observations:**
- Clean separation. Shared is type-only, no runtime code. Good.
- `pnpm-workspace.yaml` correctly lists all three packages.
- `onlyBuiltDependencies` includes `@biomejs/biome` and `esbuild` — correct.
- Root `package.json` has appropriate workspace-level scripts.
- No `.npmrc` file (fine for a private monorepo, but could pin settings).

### 2.2 TypeScript Configuration

**Base config (`tsconfig.base.json`):**
- `target: ES2023`, `module: ESNext`, `moduleResolution: bundler` — modern and correct.
- `strict: true` — good.
- `noUncheckedIndexedAccess: true` — excellent, prevents unsafe array/object access.
- `noUnusedLocals: true`, `noUnusedParameters: true` — strict by default.

**Per-package overrides:**
- Server and client both set `noUnusedLocals: false`, `noUnusedParameters: false` — relaxing the base. This allows dead code to accumulate silently. The server has `_context` parameters in tool execute functions to satisfy the `ToolDefinition` interface.
- Shared keeps the strict defaults — correct since it's the contract package.

**Issue:** Server `tsconfig.json` has `outDir: "./dist"` and `rootDir: "./src"` but the build script is just `tsc`, which compiles to `dist/`. The `start` script runs `node dist/index.js`, but `.js` extension imports in source (e.g., `import { loadConfig } from "./config.js"`) mean the compiled output works. This is correct.

### 2.3 Biome Configuration

- `biome.json` at root covers the entire repo.
- `ignores: ["node_modules", "dist", "build", "coverage", "spike", ".claude"]` — good.
- `noDefaultExport: "off"` — needed for Vite config and React components, though conventions doc says "named exports over default exports." The relaxation is correct because Vite/React ecosystem requires some default exports.
- `noUnusedImports: "warn"`, `noUnusedVariables: "warn"` — these are warnings, not errors. Lint passes even with unused code.
- Formatter: 2-space indent, 100-char line width, double quotes, semicolons — consistent throughout.

### 2.4 Environment Configuration

**Root `.env.example`:**
```
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://user:pass@localhost:5432/jarvis
GITHUB_TOKEN=ghp_...
OPENWEATHERMAP_API_KEY=...
PORT=3001 (optional)
REDIS_URL=redis://localhost:6379 (optional)
JWT_SECRET= (optional, auto-generated if missing)
```

**Server `.env.example`:**
```
OPENAI_API_KEY=sk-your-key-here
JWT_SECRET=change-this-to-a-random-string-at-least-32-chars
PORT=3001
```

**Issue:** Two `.env.example` files exist (root and server) with overlapping but inconsistent content. Root `.env.example` lists all 7 vars with good comments. Server `.env.example` only lists 3 vars (OPENAI_API_KEY, JWT_SECRET, PORT) and omits DATABASE_URL, GITHUB_TOKEN, OPENWEATHERMAP_API_KEY, REDIS_URL. The README says `cp .env.example server/.env` — this would copy the root version, but the server version is misleading if someone finds it independently. **Recommendation:** Remove `server/.env.example` and keep only the root one, or make them identical.

**Config validation (`server/src/config.ts`):**
- 4 required env vars throw on missing: OPENAI_API_KEY, DATABASE_URL, GITHUB_TOKEN, OPENWEATHERMAP_API_KEY.
- 3 optional with defaults: PORT (3001), REDIS_URL (redis://localhost:6379), JWT_SECRET (auto-generated UUID pair with warning).
- Config is loaded once at startup, returned as a frozen-shape `Config` interface.
- **Good pattern:** JWT_SECRET auto-generation with console.warn is appropriate for demo — sessions just won't survive restarts.

### 2.5 Test Infrastructure

**Status: No tests exist. Zero test coverage.**

- Vitest is named in the stack docs but is NOT installed in any package.json.
- No `vitest.config.ts` anywhere.
- No `*.test.ts` or `*.spec.ts` files.
- `pnpm test` runs `pnpm -r test` which matches no test scripts — silent success.
- `pnpm run ci` passes entirely because the test step is a no-op.

**This is the single biggest gap.** The CI pipeline creates false confidence — it shows green while testing nothing.

**High-value test targets (prioritized):**
1. `auth.ts` — JWT sign/verify round-trip
2. `tool-registry.ts` — registration, lookup, execution dispatch, error handling
3. `weather.ts` — freshness enforcement (cache fresh → returns, cache stale → fetches, fetch fails → refuses)
4. `memory.ts` — keyword matching, timeframe filtering
5. `config.ts` — required var validation, optional var defaults
6. `persistence.ts` — message save/retrieve
7. Client: `useVoiceSession` message dispatch, status transitions (would need JSDOM or React Testing Library)

### 2.6 CI / GitHub Actions

**Status: No GitHub Actions workflows exist.** Zero automation.

- `.github/workflows/` directory does not exist.
- No CI pipeline runs on push/PR.
- The `pnpm run ci` script exists locally but is never triggered automatically.

**Required workflow should:**
1. Checkout + setup Node 22 + pnpm
2. `pnpm install --frozen-lockfile`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm test` (after tests are added)
6. `pnpm build`

### 2.7 Server — Entry Point and Boot Sequence

**`server/src/index.ts` (56 lines):**
1. Load env via dotenv
2. Connect PostgreSQL (synchronous init, throws on bad URL)
3. Connect Redis (lazy, non-blocking, `.catch()` logs warning)
4. Register all 14 tools
5. Start weather poller (3-min interval)
6. Register Fastify plugins (CORS, WebSocket)
7. Register routes (health, auth, preferences, sessions, ws)
8. Start idle checker (30s interval)
9. Listen on 0.0.0.0:PORT

**Shutdown handler (`SIGINT`/`SIGTERM`):**
- Clears idle checker interval
- Stops weather poller
- `Promise.allSettled([disconnectRedis(), disconnectDb(), fastify.close()])`
- `process.exit(0)`

**Issue — Shutdown race:** `process.exit(0)` is called immediately after `allSettled` resolves, but there may be in-flight summary generation (fire-and-forget `void (async () => { ... })()` in `relay.ts:416-424`). These summaries will be silently dropped. This is documented in `product-overview.md` gotchas. For a demo this is acceptable. For production, in-flight operations should be tracked.

### 2.8 Server — WebSocket Relay (`relay.ts`, 428 lines)

**This is the core of the system.** Bridges client WS ↔ OpenAI Realtime WS.

**Code path tracing:**

1. `createRelaySession(clientWs, config, session)` called from `routes/ws.ts` after JWT verification.
2. Opens a new WebSocket to `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini`.
3. On OpenAI `open`: builds system prompt (with user preferences injected), sends `session.update` with instructions, tool definitions, audio config (PCM16 24kHz, no turn_detection, transcription model `gpt-4o-mini-transcribe`, voice `ash`).
4. Dispatches OpenAI events via switch statement (17 case labels + default).
5. Client messages dispatched via second switch (4 types: audio, commit, cancel, truncate).

**Tool execution flow:**
1. OpenAI emits `response.function_call_arguments.done` with `call_id`, `name`, `arguments`.
2. `handleToolCall()` parses args, sends `tool.started` to client, creates `ToolContext`, calls `toolRegistry.execute()`.
3. On success: sends `tool.done` (with evidence) to client, checks for proposal data, persists tool message to DB, sends `function_call_output` to OpenAI, triggers `response.create`.
4. On error: sends `tool.error` to client, persists error, sends error output to OpenAI.

**Dual event schema handling:**
- `response.audio.delta` / `response.output_audio.delta` — both handled
- `response.audio_transcript.delta` / `response.output_audio_transcript.delta` — both handled
- `response.audio_transcript.done` / `response.output_audio_transcript.done` — both handled
- This dual handling is correct for the beta→GA transition period.

**Issue — No status message sent:** The shared types define a `{ type: "status"; status: SessionStatus }` ServerMessage, but the server never sends this message type. The client derives status from other events. This is a dead type variant — not harmful but slightly confusing.

### 2.9 Server — Tool Registry (`tool-registry.ts`, 46 lines)

Clean singleton pattern:
- `register(tool)`: Stores by name, warns on duplicate.
- `get(name)`: Lookup.
- `getAll()`: Returns all tools (used for self-awareness).
- `getOpenAITools()`: Maps to `{ type: "function", name, description, parameters }` format.
- `execute(name, args, context)`: Lookup + call, throws on unknown tool.

**14 tools registered in `tools/index.ts`:**
- 5 GitHub core (list PRs, PR details, list issues, issue details, recent merges)
- 1 GitHub briefing (parallel aggregation)
- 1 GitHub changes (memory-aware diff)
- 1 GitHub proposals (GPT-4o-mini analysis)
- 1 Weather (cache-first + freshness)
- 3 Preferences (set, list, delete)
- 1 Memory recall (keyword + pgvector)
- 1 Capabilities (self-reporting)

**Tools create new Octokit/OpenAI instances per registration call.** The GitHub tools, briefing tools, changes tools, and proposal tools each create their own `new Octokit({ auth: config.githubToken })`. This means 4 separate Octokit instances exist. Not a bug (they're stateless), but a mild code smell.

### 2.10 Server — Database Schema (`db/schema.ts`, 57 lines)

4 tables via Drizzle:
- `users`: id (uuid PK), email (unique), displayName, preferences (jsonb), createdAt
- `sessions`: id (uuid PK), userId (FK → users), startedAt, endedAt, metadata (jsonb)
- `messages`: id (uuid PK), sessionId (FK → sessions), role, content, toolCalls, toolName, evidence (jsonb), createdAt
- `sessionSummaries`: id (uuid PK), sessionId (FK → sessions), topics (text[]), entities/keyFacts/unresolved (jsonb), embedding (vector 1536), createdAt

**No migration files.** Uses `drizzle-kit push` (schema-first approach). This is appropriate for a demo — migrations add complexity for a schema that's still evolving.

**Issue — No `userId` column on `messages` table.** Messages link to sessions via `sessionId`, and sessions link to users via `userId`. Cross-user message lookup requires a join. The `session_summaries` table also lacks a direct `userId` column — the memory recall tool joins `session_summaries → sessions` to filter by user. This works but adds query complexity. For a demo, this is fine.

**Issue — The PRD data model (section 11) includes `ApiCache` and `GitHubCache` tables that don't exist in the schema.** The actual implementation uses Redis for weather caching and no GitHub caching table. This is a doc/code divergence.

### 2.11 Server — Auth

**JWT flow:**
1. Client calls `POST /api/auth/register` with empty body → creates demo user with random email (`demo-{uuid}@jarvis.local`), returns `userId`.
2. Client calls `POST /api/auth/token` with `{ userId }` → returns signed JWT with `sessionId` (random UUID) and `userId`.
3. Client opens WebSocket with `?token=JWT` → server verifies via `jose.jwtVerify()`.

**Auth gaps (documented, acceptable for demo):**
- `POST /api/auth/register` has no rate limiting — anyone can create unlimited users.
- `POST /api/auth/token` issues a token for any `userId` without verifying identity — no password, no email verification.
- REST endpoints (`GET /api/preferences`, `GET /api/sessions/recent`, `DELETE /api/preferences/:index`) accept bare `userId` query parameter without JWT verification.
- WebSocket route properly verifies JWT. This is the only authenticated endpoint.
- These are all acceptable for a demo but should be noted in docs.

### 2.12 Server — Redis Graceful Degradation

**Verified:** Redis is truly optional.
- `connectRedis()` uses `lazyConnect: true`, retries up to 5 times, stops on failure.
- `getRedis()` returns `null` if not connected.
- `cacheGet()`, `cacheSet()`, `cacheDel()` all guard `if (!redis) return null/void`.
- `weather.ts` falls through to direct API fetch when cache miss.
- `weather-poller.ts` also handles null redis (won't cache but will still poll).

**This is well-implemented.** The system degrades gracefully without Redis.

### 2.13 Server — Session Summary Generation

**`summary.ts` (78 lines):**
1. Triggered asynchronously on client WS close (`relay.ts:416-424`).
2. Fetches all messages for the session from DB.
3. Formats as transcript, sends to GPT-4o-mini with JSON mode.
4. Extracts topics, entities, key_facts, unresolved.
5. Generates pgvector embedding via `text-embedding-3-small` (graceful degradation if embedding API fails).
6. Inserts into `session_summaries` table.

**Issue — Summary generation creates a new OpenAI client instance** with the raw `openaiApiKey` string. The proposal tool also creates its own OpenAI client. Multiple client instances exist — not a bug but could be consolidated.

### 2.14 Client — Component Hierarchy

```
App
├── StatusBar (connection status, timer, error badge)
├── Transcript (scrollable turn feed)
│   ├── Turn bubbles (user/assistant)
│   │   ├── ToolCallIndicator[] (status dot + name + duration)
│   │   ├── EvidenceCard[] (source icon + entity + freshness)
│   │   └── ProposalCard (fix plan / PR outline / comment draft)
├── PushToTalkButton (80px circle, audio level ring)
├── SessionControls (turn count, end/reconnect)
└── InfoDrawer (preferences + session history tabs)
```

### 2.15 Client — State Management

Single `useVoiceSession()` hook manages ALL session state. No external state library. State flows unidirectionally via props. This is appropriate for a single-screen app.

**State machine (verified):**
```
disconnected → connecting → connected ↔ listening ↔ processing ↔ speaking
                                                                    ↓
                                                              disconnected / error
```

Key transitions:
- `connect()`: disconnected → connecting → connected (on `session.ready`)
- `startListening()`: connected/speaking → listening (with interrupt if speaking)
- `stopListening()`: listening → processing (if audio > MIN_COMMIT_BYTES, else → connected)
- First `audio` arrives: processing → speaking
- `response.done`: speaking/processing → connected (300ms delay to drain audio)
- WebSocket close: any → disconnected
- `session.timeout`: any → disconnected + error message

### 2.16 Client — Audio Pipeline

**Capture (`useAudioCapture.ts`):**
- AudioWorklet-based capture → PCM16 Int16 → base64.
- Handles browser sample rate mismatch (48kHz→24kHz via integer stride downsampling).
- Posts audio level every ~50ms for visualization.
- Echo cancellation and noise suppression enabled.

**Playback (`useAudioPlayback.ts`):**
- Decodes base64 → Int16 → Float32.
- Schedules AudioBufferSourceNode chains for gapless playback.
- 50ms initial buffer to prevent gaps.
- Returns elapsed playback time on `stop()` for interrupt truncation.

**Worklet (`audio-worklet-processor.ts`):**
- Runs in AudioWorklet thread.
- Converts Float32 input to Int16 (PCM16).
- Posts ArrayBuffer to main thread.
- Posts RMS level every 4 frames.

**Issue — Non-integer sample rate ratio:** If the browser provides a sample rate that isn't an exact multiple of 24kHz (e.g., 44.1kHz), the integer stride downsampling will produce incorrect results. Most browsers provide 48kHz (2x) or 24kHz (1x), so this works in practice. But 44.1kHz would give ratio 1.8375, truncated to stride 1, producing 44.1kHz output labeled as 24kHz. This would cause pitch/speed distortion. **Risk: low** (Chrome on macOS/Windows typically uses 48kHz).

### 2.17 Client — Error Handling

**Good patterns:**
- WebSocket message parsing wrapped in try/catch.
- Microphone access failure creates error state and cleans up orphaned user turn.
- Short audio (<150ms) is discarded rather than sent.
- Audio capture failure doesn't crash the app.

**Gaps:**
- `InfoDrawer` swallows all fetch errors silently (empty catch blocks). Preferences and session history fail without any user feedback.
- No automatic reconnection on WebSocket close. User must click "Reconnect" manually.
- `ProposalCard` assumes `data` keys exist without null guards. Could throw on malformed proposal data.

### 2.18 Client — UX Polish Assessment

**What works well:**
- Push-to-talk button with clear state-dependent colors and labels.
- Audio level ring animation provides live feedback during recording.
- Evidence cards with freshness indicators (green/amber/red dots + age text).
- Tool call status dots with duration.
- Dark theme is cohesive and professional.
- StatusBar with connection timer.

**What's rough:**
- User turn shows "…" until transcription arrives. If transcription fails, "…" stays permanently.
- No loading state while fetching preferences or sessions in InfoDrawer.
- No error display in InfoDrawer when API calls fail.
- Proposal "Approve" button shows "Coming soon" — functional stub. This is intentional but could confuse demo viewers.
- No visual indicator of audio playback (no waveform or volume level for assistant speech).
- Scrollbar styling is webkit-only (Firefox shows default scrollbar).
- No favicon or page title change to reflect session state.

### 2.19 Deployment Readiness

**Current state:**
- No Dockerfile.
- No railway.toml / railway.json.
- No Procfile.
- No health check beyond `GET /api/health` (returns `{ status: "ok", timestamp }`).
- Server listens on `0.0.0.0:PORT` — correct for container deployment.
- Build produces: `server/dist/` (Node.js) + `client/dist/` (static assets).

**What's needed for Railway deployment:**
1. A way to serve client static assets (either from Fastify or a separate static service).
2. The server currently doesn't serve the client build. Vite dev proxy handles this in development.
3. For production: either add `@fastify/static` to serve `client/dist/`, or deploy client to a CDN/static host with proxy config.
4. `DATABASE_URL`, `REDIS_URL` would come from Railway add-ons.
5. `pnpm build && pnpm --filter server start` would be the start command.

### 2.20 Documentation Assessment

**Existing docs:**
| Doc | Status | Accuracy |
|-----|--------|----------|
| `README.md` | Present, covers basics | Setup instructions correct but sparse. No demo walkthrough, no architecture explanation, no limitations section. |
| `docs/requirements.md` | Original stakeholder brief | Accurate (source of truth) |
| `docs/PRD.md` | Comprehensive (766 lines) | Mostly accurate. Data model section mentions ApiCache/GitHubCache tables that don't exist. Milestone status needs updating (M4 says "Showcase Layer" but some items are complete, some aren't). |
| `docs/research.md` | Technology research synthesis | Accurate historical record. Some recommendations differ from actual implementation (e.g., research recommends Temporal, implementation doesn't use it). |
| `docs/research-providers.md` | Provider comparison | Historical reference, not actionable |
| `docs/decisions.md` | ADR log (7 entries) | Accurate, matches implementation |
| `docs/SYSTEM.md` | Domain model + gotchas | Accurate, concise, valuable |
| `docs/product-overview.md` | Comprehensive codebase guide | Very accurate and thorough |
| `CLAUDE.md` | AI assistant instructions | Correct |

**Missing docs:**
- `docs/DEVELOPMENT.md` — Local setup details, debugging tips
- `docs/TESTING.md` — Test strategy, what's covered
- `docs/DEPLOYMENT.md` — Railway/production deployment guide
- `CONTRIBUTING.md` — How to contribute
- `.env.example` documentation could be more detailed

---

## 3. Key Patterns to Follow

1. **Named exports, `.js` extensions in imports, ESM throughout.** Every file uses this pattern. New code must match.

2. **Tool registration pattern.** Each tool category has a `register*Tools(registry, config?)` function that creates `ToolDefinition` objects with `name`, `description`, `parameters` (JSON Schema), and `execute(args, context)`. New tools should follow this exactly.

3. **Evidence threading.** Every tool that provides operational data returns `{ output: string, evidence: Evidence | null }`. Evidence flows to client via `tool.done` message, to DB via `persistMessage`, and to OpenAI via `function_call_output`. Never return operational data without evidence.

4. **Graceful degradation.** Redis operations guard against null. Embedding generation catches errors. Summary generation is fire-and-forget. New code should follow this "degrade, don't crash" pattern.

5. **Inline styles with token objects.** Client uses `styles.ts` tokens for all styling. No CSS modules, no styled-components. New components should import from `styles.ts`.

---

## 4. Risks & Unknowns (Ranked by Likelihood of Causing Problems)

### High Risk

1. **No tests exist.** The CI pipeline is a lie — `pnpm run ci` passes by running zero tests. Any change could break the system without detection. This is the #1 issue for repo credibility.

2. **`pnpm ci` vs `pnpm run ci` naming collision.** Any GitHub Actions workflow using `pnpm ci` will fail. This blocks CI automation.

3. **Client doesn't serve in production.** No mechanism to serve `client/dist/` from the Fastify server. The Vite dev proxy handles this in development, but production deployment needs either `@fastify/static` or a separate static host.

4. **Summary generation dropped on shutdown.** The fire-and-forget async summary can be interrupted by `process.exit(0)`. In a demo, abrupt shutdown could lose the last session's summary.

### Medium Risk

5. **Two `.env.example` files with different content.** Confusing for new developers. Root version is correct, server version is incomplete.

6. **REST endpoints have no auth.** Preferences and sessions endpoints accept bare `userId` without JWT verification. Documented but could surprise a reviewer.

7. **Preference indexing inconsistency.** REST API uses 0-based index, voice tool uses 1-based index. Could cause off-by-one errors.

8. **`ServerMessage` type `status` is defined but never sent.** Dead type variant. Not harmful but could confuse someone reading the types.

9. **PRD mentions ApiCache and GitHubCache tables that don't exist.** Doc/code divergence.

10. **Multiple Octokit/OpenAI client instances.** 4 Octokit instances and 2+ OpenAI instances created at startup/runtime. Wasteful but not buggy.

### Low Risk

11. **Non-integer sample rate ratio (44.1kHz browsers).** Would cause audio distortion but almost never occurs in practice.

12. **Audio sources in playback could leak if `onended` doesn't fire.** The generation counter mitigates this during interrupts, but edge cases may exist.

13. **`dbSessionId` initialization race window.** Messages during the first few milliseconds of a session are silently dropped. Documented and intentional.

---

## 5. Recommended Investigation (Things I Could Not Fully Verify)

1. **OpenAI Realtime API event schema stability.** The dual event handling (beta vs GA) is implemented, but I couldn't verify which schema the current API version actually sends. The beta API is scheduled for retirement 2026-05-07. After that date, the beta event names may stop being emitted.

2. **pgvector extension availability.** The schema uses `vector(1536)` type, which requires the pgvector extension to be installed in PostgreSQL. If a new developer sets up a fresh PostgreSQL without pgvector, `db:push` will fail. This should be documented.

3. **Weather poller behavior when Redis is unavailable.** The poller calls `cacheSet()` which no-ops without Redis, and `fetchFromApi()` which works. But the weather tool checks `cacheGet()` first (returns null), then falls through to direct API fetch. This works but means every weather request hits the API directly — no caching. At demo scale this is fine (OpenWeatherMap free tier: 60 calls/min).

4. **Audio worklet module loading in production build.** The worklet is loaded via `new URL("../lib/audio-worklet-processor.ts", import.meta.url)`. Vite transforms this during build. I couldn't verify the production build correctly bundles and serves the worklet as a separate file.

5. **Production WebSocket URL construction.** The client constructs `${protocol}//${window.location.host}/ws/relay?token=${token}`. This works when the server and client are on the same host. If deployed to separate hosts (e.g., static client on CDN, server on Railway), the URL would need to point to the server host. The Vite proxy handles this in dev, but production would need either same-origin deployment or a configurable API base URL.

---

## 6. Doc-vs-Code Divergences

| Claim in docs | Reality |
|---------------|---------|
| PRD section 11 lists `ApiCache` and `GitHubCache` tables | These tables don't exist. Weather uses Redis cache, GitHub has no caching table. |
| PRD section 1 says audio format is "Opus client↔server" | ADR-002 decided PCM16 throughout. PRD section 10 was updated but the architecture diagram in section 2 still says "Opus audio + JSON events." |
| README says `pnpm ci` | Should be `pnpm run ci` due to pnpm built-in collision. |
| Stack section says "Vitest" for tests | Vitest is not installed and no tests exist. |
| PRD M4 says "Audio level visualization (P1)" | Audio level visualization IS implemented (audio ring on push-to-talk button during recording). It's not a standalone waveform but it exists. |
| SYSTEM.md says "Weather poller runs on a 3-minute interval independently of requests" | Correct, but also: the weather tool can trigger a direct API fetch for uncached cities, which then adds the city to the poller's LRU list. |

---

## 7. Priority Buckets

### Must Fix Before Demo

1. **Add GitHub Actions CI workflow** — currently zero automation. A reviewer seeing no CI will question repo quality.
2. **Rename `ci` script** to avoid pnpm collision (e.g., `check` or `validate`), or use `pnpm run ci` in all docs.
3. **Add at minimum a handful of critical-path tests** — JWT auth, tool registry, freshness enforcement. Even 5-10 tests change the perception from "untested" to "selectively tested."
4. **Production static file serving** — the client build has no serving mechanism. Add `@fastify/static` or document the deployment split.
5. **Fix README `pnpm ci` reference.**

### Should Improve for Repo Quality

6. **Consolidate `.env.example` files** (remove or sync server copy).
7. **Add Vitest to server package.json** and create vitest config.
8. **Remove dead `status` variant from `ServerMessage` type** or implement it.
9. **Add loading/error states to InfoDrawer** fetch operations.
10. **Document pgvector requirement** in README prerequisites.
11. **Update PRD data model** to match actual schema (remove ApiCache/GitHubCache, or note they're deferred).
12. **Add Node.js / pnpm version hints** (`.nvmrc`, `engines` field).
13. **Improve README** with demo walkthrough, architecture diagram, known limitations.

### Later / Roadmap / Intentionally Deferred

14. Consolidate Octokit/OpenAI client instances.
15. Add comprehensive client-side tests (React Testing Library).
16. Implement proposal approval workflow.
17. Add automatic WebSocket reconnection.
18. Track in-flight summaries for graceful shutdown.
19. Add auth middleware to REST endpoints.
20. Handle non-integer sample rate ratios.
21. Add Dockerfile / Railway config.
22. Add observability (OpenTelemetry + Langfuse as per PRD).
