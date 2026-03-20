# Product Overview

## What this is

Jarvis is a real-time voice assistant for frontline workers — an operational voice copilot, not a general chatbot. Users hold a push-to-talk button, ask questions grounded in live GitHub repos, weather APIs, and conversation memory, and receive spoken answers backed by verifiable evidence. Every factual claim is either sourced from a tool call or the system explicitly refuses.

This is a demo project built to showcase best-practice architecture for tool-grounded voice AI. The codebase is designed for continued iteration toward production features (mobile, write actions, multi-tenant scaling).

## Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Runtime | Node.js 22, TypeScript 5.x | End-to-end type safety |
| Server | Fastify 5 | HTTP, WebSocket, plugin ecosystem |
| Client | React 19, Vite | Companion web UI |
| Voice | OpenAI Realtime API (`gpt-realtime-mini`) | Speech-to-speech via WebSocket relay |
| Database | PostgreSQL + pgvector | Users, sessions, messages, summaries, semantic search |
| Cache | Redis (ioredis) | Weather data cache, optional (graceful degradation) |
| ORM | Drizzle | Type-safe SQL, native pgvector support |
| GitHub | Octokit (`@octokit/rest`) | Repo data, PRs, issues, merges |
| Auth | jose (JWT) | WebSocket-compatible token auth |
| Linting | Biome | Formatting + linting in one tool |
| Package manager | pnpm workspaces | Monorepo with shared, server, client packages |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Push-to- │  │Transcript│  │ Evidence   │  │  Proposal    │  │
│  │ Talk Btn │  │  Feed    │  │ Cards      │  │  Cards       │  │
│  └────┬─────┘  └──────────┘  └────────────┘  └──────────────┘  │
│       │ PCM16 24kHz audio chunks (base64 over JSON)              │
└───────┼──────────────────────────────────────────────────────────┘
        │ WebSocket (ws://host/ws/relay?token=JWT)
┌───────┼──────────────────────────────────────────────────────────┐
│  Fastify Server                                                   │
│       │                                                           │
│  ┌────▼─────────────────────────────────────────────────┐        │
│  │  Relay (relay.ts)                                     │        │
│  │  - Bridges client WS ←→ OpenAI WS                    │        │
│  │  - Dispatches tool calls via ToolRegistry             │        │
│  │  - Threads evidence from tools → client               │        │
│  │  - Persists messages to PostgreSQL                    │        │
│  └────┬──────────────┬──────────────────────────────────┘        │
│       │              │                                            │
│  ┌────▼────┐    ┌────▼──────────────────────────────────┐        │
│  │ OpenAI  │    │  Tool Registry (14 tools)              │        │
│  │Realtime │    │  ┌────────┐ ┌────────┐ ┌───────────┐  │        │
│  │  API    │    │  │ GitHub │ │Weather │ │ Memory    │  │        │
│  │  (WS)   │    │  │ (8)   │ │  (1)   │ │ Prefs (3) │  │        │
│  └─────────┘    │  └────────┘ └────────┘ │ Caps (1)  │  │        │
│                 │                         │ Recall(1) │  │        │
│                 │                         └───────────┘  │        │
│                 └────────────────────────────────────────┘        │
│                          │                                        │
│         ┌────────────────┼────────────────┐                      │
│    ┌────▼────┐     ┌─────▼─────┐    ┌─────▼─────┐               │
│    │PostgreSQL│    │   Redis    │    │  GitHub   │               │
│    │+pgvector │    │  (cache)   │    │   API     │               │
│    └──────────┘    └───────────┘    └───────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

### How a voice turn flows

1. User holds push-to-talk button. Client captures PCM16 24kHz audio via AudioWorklet, base64-encodes each chunk, sends as `{ type: "audio", data }` over WebSocket.
2. Server relays each chunk to OpenAI as `input_audio_buffer.append`.
3. User releases button. Client sends `{ type: "commit" }`. Server sends `input_audio_buffer.commit` + `response.create` to OpenAI.
4. OpenAI transcribes user audio, decides whether to call tools or respond directly.
5. If tool call: OpenAI emits `response.function_call_arguments.done`. Server executes the tool, sends evidence to client, sends tool output back to OpenAI, triggers `response.create` for the model to speak the result.
6. OpenAI streams audio + transcript back. Server relays audio chunks to client, which queues them for gapless playback.
7. On response completion, the turn's transcript is persisted to PostgreSQL.

### Interruption flow

If the user presses talk while the assistant is speaking, the client stops playback (recording elapsed time), sends `cancel` and `truncate` messages. The server forwards these to OpenAI, which halts generation. The assistant turn is marked as interrupted in the UI.

## Directory structure

```
shared/           Shared types and constants consumed by server and client
  src/
    types.ts      SessionStatus, DisplayStatus, Evidence, ClientMessage, ServerMessage
    constants.ts  AUDIO (sample rate, bytes/ms), SESSION (timeouts, token expiry)

server/           Fastify backend
  src/
    index.ts      Entry point — boot sequence, plugin registration, shutdown
    config.ts     Environment variable loading with validation
    db/
      index.ts    Drizzle connection management (connectDb, getDb, Db type)
      schema.ts   4 tables: users, sessions, messages, session_summaries
    routes/
      ws.ts       WebSocket upgrade — JWT verification, session creation, relay init
      auth.ts     POST /api/auth/register, POST /api/auth/token
      health.ts   GET /api/health
      preferences.ts  GET/DELETE /api/preferences
      sessions.ts     GET /api/sessions/recent
    services/
      relay.ts    The core — bridges client WS ↔ OpenAI WS, dispatches tools
      session.ts  In-memory session state management (SessionManager singleton)
      tool-registry.ts  Tool registration, OpenAI schema generation, dispatch
      persistence.ts    saveMessage, createDbSession, endDbSession
      summary.ts  GPT-4o-mini session summarization with embedding generation
      summary-jobs.ts  Async promise queue for in-flight summaries (tracked at shutdown)
      auth.ts     JWT sign/verify via jose
      http-auth.ts  Bearer token extraction + verification for HTTP routes
      cache.ts    Redis wrapper (fail-safe — all ops no-op if Redis unavailable)
      idle.ts     30-second interval checking for 10-minute idle sessions
      weather-poller.ts  3-minute background refresh for tracked weather cities
    tools/
      index.ts    registerAllTools — calls all 8 registration functions
      types.ts    ToolDefinition, ToolResult, ToolContext interfaces
      github.ts   5 tools: list PRs, PR details, list issues, issue details, recent merges
      github-briefing.ts  1 tool: aggregated repo snapshot (4 parallel API calls)
      github-changes.ts   1 tool: diff since last conversation about this repo
      github-proposals.ts 1 tool: analyze issue → fix plan / PR outline / comment draft
      weather.ts  1 tool: current weather with cache-first + freshness enforcement
      preferences.ts  3 tools: set, list, delete standing instructions
      memory.ts   1 tool: keyword + pgvector search across session summaries
      capabilities.ts  1 tool: self-describing capability manifest
    types.ts      SessionState interface

client/           React + Vite companion UI
  public/
    audio-worklet-processor.js  PCM16 capture processor (must be static file, not data: URL)
  src/
    main.tsx      Entry point — StrictMode + createRoot
    App.tsx       Root layout — StatusBar, Transcript, PushToTalkButton, SessionControls, InfoDrawer
    hooks/
      useVoiceSession.ts  State machine, WS lifecycle, message dispatch, turn management
      useAudioCapture.ts  AudioWorklet-based mic capture → PCM16 → base64
      useAudioPlayback.ts Gapless AudioBuffer queue for assistant audio
    components/
      StatusBar.tsx       Connection status with color-coded dot
      PushToTalkButton.tsx  80px circle with audio level ring animation
      Transcript.tsx      Chat bubble feed with auto-scroll
      SessionControls.tsx  Turn count, reconnect/end session buttons
      InfoDrawer.tsx      Side panel — preferences management + session history
      EvidenceCard.tsx    Inline badge: source icon, entity, freshness indicator
      ToolCallIndicator.tsx  Status badge: running/done/error with duration
      ProposalCard.tsx    Structured card: fix plan / PR outline / comment draft
    lib/
      audio-worklet.d.ts  TypeScript declarations for AudioWorkletProcessor
    styles.ts     Design system tokens (colors, spacing, radii, fonts, font sizes)
    types.ts      TranscriptTurn, ToolCallInfo, ProposalInfo
    index.css     Global resets, keyframe animations, scrollbar styling

docs/             Product documentation
  requirements.md       Original requirements brief from stakeholder
  PRD.md                Full product requirements document
  research.md           Architecture research synthesis
  research-providers.md Detailed provider comparisons and benchmarks
  decisions.md          Architectural decision records (ADR-001 through ADR-008)
  SYSTEM.md             Domain model, constraints, key patterns, gotchas
  architecture.md       System design — runtime shape, trust boundaries, reliability
  DEPLOYMENT.md         Railway production deployment guide
  DEVELOPMENT.md        Local setup and daily commands
  TESTING.md            Test strategy and coverage map

.github/
  workflows/
    ci.yml        GitHub Actions CI — typecheck → lint → test → build on push/PR
```

## Core concepts

### Evidence

The central abstraction enforcing the zero-hallucination guarantee. Every tool returns `{ output: string, evidence: Evidence | null }`. The `Evidence` type carries:

```typescript
{ source: string, entity: string, fetchedAt: string, freshnessSec: number, citationRef: string }
```

Evidence flows through three paths simultaneously: (1) back to OpenAI as the tool output string so the model speaks grounded facts, (2) to the client for rendering evidence badges, (3) to PostgreSQL alongside the message for audit.

### Tool registry

Tools self-register during server boot. Each tool is a `ToolDefinition` with a name, description, JSON Schema parameters, and an async `execute(args, context)` function. The registry transforms these into OpenAI's function-calling format and handles dispatch. The relay calls `toolRegistry.execute()` when OpenAI requests a function call.

`ToolContext` provides `userId`, `sessionId`, and a `db` handle — tools have full database access for querying preferences, session history, and summaries.

### Session lifecycle

1. **Connect**: client registers or reuses a demo user, fetches a JWT, then opens WebSocket to `/ws/relay`.
2. **Handshake**: server verifies JWT, creates in-memory `SessionState`, creates DB session row, opens a second WebSocket to OpenAI Realtime API, sends `session.update` with system prompt + tool definitions.
3. **Turns**: audio flows bidirectionally. Each commit increments `turnCount` and touches `lastActivityAt`.
4. **Idle timeout**: background checker closes sessions idle >10 minutes.
5. **Disconnect**: server closes OpenAI WS, marks DB session `ended_at`, generates summary asynchronously via GPT-4o-mini (topics, entities, key facts, unresolved items + embedding vector).

### Proposals

A read-only pattern for agentic actions. The `github_propose_action` tool analyzes a GitHub issue and generates a structured plan (fix plan, PR outline, or comment draft) using GPT-4o-mini. The result is sent to the client as a `proposal` message, rendered as a review card. Approval execution is intentionally not implemented yet — this is the hook for future write-action workflows.

## Key patterns and conventions

### File organization
- Co-located by feature: all GitHub tools in `tools/github*.ts`, all services in `services/`.
- Named exports exclusively — no default exports (enforced by Biome rule).
- `.js` extensions in imports (TypeScript with ESM resolution).

### Styling
- Inline styles using JS token objects from `styles.ts`. No CSS framework, no CSS modules, no styled-components.
- Global CSS only for resets and keyframe animations.
- Dark theme with Tailwind-derived color palette used as raw hex values.

### Error handling
- Tools catch errors and return structured error JSON — the model speaks the error to the user.
- Redis is entirely optional: every cache operation guards against null and returns gracefully.
- Shutdown uses `Promise.allSettled` so one failing cleanup step doesn't block the others.
- Client JSON.parse of WebSocket messages is wrapped in try/catch.

### Type safety
- Strict TypeScript with `noUncheckedIndexedAccess` in the base config.
- Shared wire protocol types (`ClientMessage`, `ServerMessage`) are discriminated unions.
- Drizzle provides type-safe SQL queries with schema inference.

### State management
- Server: in-memory `SessionManager` (Map) for live sessions, PostgreSQL for durable state.
- Client: React `useState` + mutable refs for the voice session hook. No external state library. Status tracked in both state (for rendering) and ref (for avoiding stale closures in callbacks).

## Data layer

### PostgreSQL schema (4 tables)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Identity + preferences | `id` (uuid), `email`, `preferences` (jsonb string[]) |
| `sessions` | One row per WS connection | `user_id` (FK), `started_at`, `ended_at` |
| `messages` | Every utterance and tool result | `session_id` (FK), `role`, `content`, `evidence` (jsonb) |
| `session_summaries` | AI-generated session distillation | `topics` (text[]), `entities`, `key_facts`, `unresolved` (jsonb), `embedding` (vector 1536) |

Summaries are generated asynchronously on session close. The embedding enables pgvector cosine similarity search for cross-session memory recall.

### Redis

Used exclusively for weather data caching. Keys follow `weather:<city>` with 180-second TTL. A background poller refreshes tracked cities every 3 minutes. Redis is not required — the system degrades gracefully to direct API calls.

## API surface

### REST endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | None | Liveness check |
| GET | `/api/health/ready` | None | Readiness check (verifies DB connectivity) |
| POST | `/api/auth/register` | None | Create demo user, returns `userId` |
| POST | `/api/auth/token` | None | Exchange `userId` for JWT |
| GET | `/api/preferences` | Bearer JWT | List user preferences |
| DELETE | `/api/preferences/:index` | Bearer JWT | Remove preference by index |
| GET | `/api/sessions/recent` | Bearer JWT | Recent sessions with summaries |

### WebSocket

| Path | Auth | Protocol |
|------|------|----------|
| `GET /ws/relay?token=JWT` | JWT query param | Bidirectional JSON + base64 audio |

**Client -> Server**: `audio` (PCM16 chunk), `commit` (end of speech), `cancel` (interrupt), `truncate` (how much audio was played before interrupt).

**Server -> Client**: `session.ready`, `audio`, `transcript` (delta or final), `response.started`, `response.done`, `tool.started`, `tool.done` (with evidence), `tool.error`, `proposal`, `session.timeout`, `error`.

### Tools (14 registered)

| Tool | Category | What it does |
|------|----------|-------------|
| `github_list_open_prs` | GitHub | Lists up to 10 open PRs |
| `github_get_pr_details` | GitHub | Full PR details with reviews and file changes |
| `github_list_issues` | GitHub | Lists open issues, optional label filter |
| `github_get_issue_details` | GitHub | Full issue details with comments count |
| `github_get_recent_merges` | GitHub | Recently merged PRs |
| `github_repo_briefing` | GitHub | Aggregated repo snapshot (4 parallel API calls) |
| `github_repo_changes` | GitHub + Memory | What changed since last conversation about this repo |
| `github_propose_action` | GitHub + Analysis | Generates fix plan / PR outline / comment draft |
| `weather_get_current` | Weather | Current conditions with cache-first + freshness enforcement |
| `preference_set` | Preferences | Store a standing instruction |
| `preference_list` | Preferences | List all preferences |
| `preference_delete` | Preferences | Remove by index or keyword |
| `memory_recall` | Memory | Keyword + pgvector search across past sessions |
| `jarvis_capabilities` | Self-awareness | Returns structured capability manifest |

## Environment and config

### Required environment variables
```
OPENAI_API_KEY        OpenAI API key (used for Realtime API, summaries, embeddings)
DATABASE_URL          PostgreSQL connection string
GITHUB_TOKEN          GitHub personal access token (read-only)
OPENWEATHERMAP_API_KEY  OpenWeatherMap API key (free tier sufficient)
```

### Optional (with defaults)
```
PORT=3001             Server port
REDIS_URL=redis://localhost:6379  Redis connection (optional — graceful degradation)
JWT_SECRET=           Auto-generated if missing (sessions won't survive restarts)
```

### Running locally
```bash
pnpm install
cp .env.example server/.env    # Fill in API keys
pnpm --filter server db:push   # Push schema to PostgreSQL
pnpm dev                       # Starts server + client concurrently
```

The Vite dev server proxies `/api` and `/ws` to `localhost:3001`.

### Deployment (Railway)

The production deployment runs on Railway as a single web service serving the API, WebSocket relay, and SPA from one origin.

```
git push → GitHub Actions CI (verify) → Railway auto-deploys on commit status pass
```

**Infrastructure**:
- **Build**: RAILPACK builder — `pnpm install --frozen-lockfile && pnpm build`
- **Start**: `node server/dist/index.js` (serves built client from `client/dist/` as static files)
- **Pre-deploy**: `drizzle-kit migrate` runs database migrations automatically
- **Health check**: `GET /api/health/ready` verifies DB connectivity (120s timeout for cold starts)
- **Restart policy**: ON_FAILURE, max 5 retries

**Constraints**:
- Single replica only — in-memory `SessionManager` is not shared across instances
- WebSocket keepalive pings every 25s to prevent Railway's 60s idle disconnect
- Server binds to `::` (IPv6 dual-stack) for Railway's networking layer
- PostgreSQL requires manual `CREATE EXTENSION vector` for pgvector
- Redis is optional (Railway Redis add-on or omit entirely)

See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for the full setup guide.

## Testing

Server-side unit tests use Vitest, co-located next to source files. No client-side tests exist yet.

| Test file | What it covers |
|-----------|---------------|
| `config.test.ts` | Env var loading, required var validation, default fallbacks |
| `services/auth.test.ts` | JWT sign/verify round-trip, reject wrong secret |
| `services/http-auth.test.ts` | Bearer token extraction, malformed header rejection, userId validation |
| `services/tool-registry.test.ts` | Tool registration, OpenAI schema export, dispatch, unknown tool error |
| `services/summary-jobs.test.ts` | Promise queue settling, timeout behavior for in-flight jobs |
| `tools/weather.test.ts` | Cache-first logic, stale fallback to API, TTL enforcement, polling integration |
| `tools/memory.test.ts` | Keyword matching, date boundary helpers, summary formatting |

```bash
pnpm test             # Vitest run (server + shared)
pnpm test:watch       # Vitest watch mode
pnpm verify           # Full pipeline: typecheck → lint → test → build
```

Not yet tested: relay message handling, audio encoding/decoding, end-to-end session lifecycle, client hooks.

## Important decisions and tradeoffs

See [docs/decisions.md](decisions.md) for the full ADR log. Key decisions:

**WebSocket relay over WebRTC (ADR-001)**: The server sits in the audio path. This adds ~50-100ms latency but dramatically simplifies debugging, deployment, and observation. Transport accounts for <5% of total voice-to-voice latency — the LLM is the bottleneck.

**Push-to-talk over VAD (ADR-005)**: Server VAD is disabled (`turn_detection: null`). The client explicitly controls turn boundaries. This prevents false triggers in noisy environments, which is critical for frontline workers. The tradeoff is that users must hold the button.

**Tool-first for zero hallucinations (ADR-004)**: The system prompt forbids answering operational questions without a tool call. This is a structural guarantee, not a prompt-engineering hope. The tradeoff is added latency for every factual answer.

**Session summaries over raw transcript storage (ADR-006)**: GPT-4o-mini distills each session into structured summaries with pgvector embeddings. This is more compact and searchable than raw transcripts. The tradeoff is that the summary is lossy — nuance from the original conversation may be lost.

**PCM16 throughout (ADR-002)**: No Opus transcoding for the MVP. Higher bandwidth (~384 kbps vs ~32 kbps) but zero codec complexity. Acceptable for demo/LAN conditions.

**Redis is optional**: Every Redis operation is guarded. The system works without Redis — weather calls go directly to the API (slower but functional). This avoids a hard infrastructure dependency for demo/dev setups.

**Preferences as jsonb array on users table**: Simple and adequate at current scale. Avoids a separate preferences table. The tradeoff is a TOCTOU race on concurrent modifications (acceptable for a single-user demo).

**No React state library**: The voice session hook manages all state via `useState` + refs. The app is a single screen with no routing. External state management would be over-engineering at this scale.

**Railway auto-deploy via CI (ADR-008)**: GitHub Actions runs the full `verify` pipeline; Railway's "Wait for CI" feature auto-deploys when commit status passes. No deploy step in the CI workflow itself — Railway watches the commit status.

## Gotchas

- **`dbSessionId` initialization race**: The DB session is created asynchronously. `session.dbSessionId` is initialized as `""` (falsy). During the brief window before the DB insert resolves, `persistMessage` checks `if (!session.dbSessionId)` and silently drops messages. This is intentional — the first few audio chunks don't need persistence.

- **Two OpenAI event schemas**: The Realtime API has coexisting event names from the beta and GA versions (e.g., `response.audio.delta` vs `response.output_audio.delta`). The relay's switch statement handles both patterns. If you add new event handling, check whether both naming conventions apply.

- **Weather poller is independent of requests**: The poller refreshes its LRU city list every 3 minutes regardless of user activity. The weather tool reads from Redis cache, not the API directly. A fresh `weather_get_current` call for a new city will fetch from the API and add the city to the poller's LRU list for future background refreshes.

- **Audio sample rate mismatch handling**: Many browsers ignore the `sampleRate: 24000` constraint on `getUserMedia` and capture at 48kHz instead. The AudioWorklet detects this and performs integer-ratio downsampling (skip every other sample). If the mismatch is not an integer ratio, audio quality degrades.

- **Shutdown with in-flight summaries**: The server tracks pending summary jobs via `summary-jobs.ts` and waits up to 5 seconds at shutdown. If summaries are still in-flight after the timeout, they are abandoned. Check `summaryWait.timedOut` in the shutdown handler if you need to extend this window.

- **AudioWorklet must be a static file**: The `audio-worklet-processor.js` is served from `client/public/`, not bundled or inlined. `audioWorklet.addModule()` rejects `data:` URLs and blob URLs in most browsers. If you move this file, the capture pipeline will silently break.

- **WebSocket keepalive pings**: The relay sends a ping to the client every 25 seconds. Without this, Railway's load balancer closes idle WebSocket connections after 60 seconds, killing the session mid-conversation.

- **Effect dependency stabilization**: The `useVoiceSession` hook's `useEffect` for WebSocket setup depends on memoized callbacks (`play`, `captureStart`, `captureStop`, `stopPlayback`). If these aren't stable (via `useCallback`), the effect re-runs and closes/reopens the WebSocket during bootstrap. This was a real bug that caused immediate disconnects on mount.
