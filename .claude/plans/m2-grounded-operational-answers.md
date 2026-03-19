# M2: Grounded Operational Answers

## Context

Jarvis has a working voice loop from M1. You can push-to-talk, hear responses, interrupt, and see a transcript. M2 makes the voice loop *useful*: Jarvis can now answer questions about GitHub repos and weather using live data, show evidence for its answers, refuse when it can't verify facts, and persist conversations to a database.

### What M1 built (do not break this):

**Server** (`server/src/`):
- `index.ts` — Fastify entry, registers routes + plugins, starts idle checker
- `config.ts` — `Config` interface: `{ port, openaiApiKey, jwtSecret }`
- `types.ts` — `SessionState` (sessionId, connectedAt, lastActivityAt, turnCount, status), `TokenPayload`
- `routes/ws.ts` — WebSocket upgrade at `/ws/relay` with JWT validation, creates session via `sessionManager.create(connectionId)`
- `routes/auth.ts` — POST `/api/auth/token`
- `routes/health.ts` — GET `/api/health`
- `services/relay.ts` — Core module: `createRelaySession(clientWs, config, session)`. Opens WS to OpenAI, sends `session.update` with GA nested schema (`session.audio.input.format`, `session.audio.output.format`), relays audio/events bidirectionally. Handles: audio relay, commit→response.create, cancel→response.cancel, truncate→conversation.item.truncate. Tracks `response.output_item.added` for item IDs.
- `services/session.ts` — `SessionManager` class, in-memory `Map<string, SessionState>`. Methods: create, get, touch, remove, size.
- `services/auth.ts` — JWT sign/verify via `jose`
- `services/idle.ts` — **Stubbed** placeholder (interval runs but does nothing). Must be wired up in M2.

**Shared** (`shared/src/`):
- `types.ts` — `ClientMessage` (audio|commit|cancel|truncate), `ServerMessage` (audio|transcript|status|response.started|response.done|turn.started|error|session.timeout|session.ready), `SessionStatus`
- `constants.ts` — `AUDIO` (24kHz, PCM16 params), `SESSION` (10min timeout, 30s check, 1hr token)

**Client** (`client/src/`):
- `App.tsx` — Layout with StatusBar, Transcript, PushToTalkButton, SessionControls
- `hooks/useVoiceSession.ts` — Core hook: state machine (idle→connecting→connected→listening→processing→speaking), WS management, turn tracking, interrupt logic
- `hooks/useAudioCapture.ts` — AudioWorklet microphone capture with 48→24kHz downsampling
- `hooks/useAudioPlayback.ts` — Gapless PCM16 playback with position tracking
- `types.ts` — `TranscriptTurn` (id, role, text, timestamp, interrupted?)
- `components/` — StatusBar, PushToTalkButton, Transcript, SessionControls

**Key patterns to preserve:**
- `relay.ts` has a single `switch(event.type)` for OpenAI events — add tool events to it
- `useVoiceSession.ts` has a single `switch(msg.type)` for server messages — add new message types to it
- Shared types use discriminated unions — extend them the same way
- Server uses explicit `send(clientWs, msg)` helper — keep using it
- Config uses `requireEnv()` for required vars — follow the pattern

### Read these before planning:
- `docs/PRD.md` — Sections 3 (Product Contracts), 7 (Scope), 8 (R4-R7, R9, R13), 10 (Evidence Model, Memory Architecture, GitHub Integration)
- `docs/decisions.md` — ADR-001 through ADR-003
- `.claude/rules/stack.md` — Technology choices
- `.claude/rules/immutable.md` — Non-negotiable rules (zero hallucinations, 3-min freshness, no secrets in code)
- The existing M1 source files listed above (understand them before changing them)

---

## Objective

Add grounded operational answering to Jarvis: GitHub repository intelligence, weather data with freshness enforcement, visible evidence in the UI, refusal behavior, conversation persistence in PostgreSQL, and cross-session memory generation.

### M2 delivers:
1. **GitHub read tools** — 5 tools for PRs, issues, merges. Evidence-backed, citation-ready.
2. **Weather tool** — OpenWeatherMap with 3-minute Redis cache and hard freshness enforcement.
3. **Evidence in companion UI** — answers show source, freshness, and tool call details.
4. **Refusal behavior** — Jarvis refuses when evidence is missing/stale instead of fabricating.
5. **Conversation persistence** — all turns saved to PostgreSQL.
6. **Session summaries** — structured summary generated at session end for cross-session memory.
7. **Idle timeout** — wired up (M1 left it stubbed).
8. **Audible acknowledgement** — Jarvis says "let me check" before long tool calls.

### M2 does NOT deliver:
- Cross-session memory *recall* (M3 — M2 generates summaries but M3 queries them)
- Capability self-awareness registry (M3)
- User preferences (M3)
- Fancy tool call visualization or real-time freshness indicator (M3 polish)
- Repo briefing mode or "what changed" summaries (M4)
- Any write actions (P2)

---

## Build Order (Checkpoints)

**Do not proceed past a checkpoint until it is verified working.** If something fails 3 times, STOP and report.

### Checkpoint 1: Database + Redis Infrastructure

Add PostgreSQL (via Drizzle) and Redis. Define the full schema. Verify: can connect, create tables, and query.

**New dependencies** (add to `server/package.json`):
- `drizzle-orm` — ORM
- `postgres` — PostgreSQL driver (the `postgres` npm package, not `pg`)
- `drizzle-kit` — Migration tooling (devDependency)
- `ioredis` — Redis client

**New files:**
```
server/
  drizzle.config.ts         -- Drizzle Kit config
  src/
    db/
      index.ts              -- Drizzle client (connect, export db instance)
      schema.ts             -- Full schema definition
```

**Schema** (`server/src/db/schema.ts`):
Define these tables using Drizzle's pgTable:

```
users
  id          uuid  PK  default gen_random_uuid()
  email       text  unique  not null
  display_name text
  preferences  jsonb  default '{}'
  created_at   timestamptz  default now()

sessions
  id          uuid  PK  default gen_random_uuid()
  user_id     uuid  references users(id)  nullable (M2 uses anonymous sessions)
  started_at  timestamptz  default now()
  ended_at    timestamptz  nullable
  metadata    jsonb  default '{}'

messages
  id          uuid  PK  default gen_random_uuid()
  session_id  uuid  references sessions(id)  not null
  role        text  not null  ('user' | 'assistant' | 'system' | 'tool')
  content     text  not null
  tool_calls  jsonb  nullable
  tool_name   text  nullable
  evidence    jsonb  nullable  -- Evidence[] for grounded answers
  created_at  timestamptz  default now()

session_summaries
  id          uuid  PK  default gen_random_uuid()
  session_id  uuid  references sessions(id)  not null
  topics      text[]  not null
  entities    jsonb  not null  -- { repos: [...], prs: [...], issues: [...] }
  key_facts   jsonb  not null  -- facts discussed
  unresolved  jsonb  not null  -- follow-ups not completed
  created_at  timestamptz  default now()

api_cache
  id          uuid  PK  default gen_random_uuid()
  source      text  not null  -- 'openweathermap'
  cache_key   text  not null  unique
  data        jsonb  not null
  fetched_at  timestamptz  not null
  expires_at  timestamptz  not null

github_cache
  id          uuid  PK  default gen_random_uuid()
  repo_url    text  not null
  query_type  text  not null  -- 'open_prs' | 'issues' | 'recent_merges' etc.
  data        jsonb  not null
  fetched_at  timestamptz  not null
  expires_at  timestamptz  not null
```

Note: Skip `embedding vector(1536)` columns for M2. Those are M3 (semantic recall). Define the tables without them. They can be added via migration in M3.

**Redis setup** (`server/src/services/cache.ts`):
- Create an `ioredis` client
- Simple wrapper: `get(key)`, `set(key, value, ttlSeconds)`, `del(key)`
- Connect on server startup, disconnect on shutdown

**Config updates** (`server/src/config.ts`):
- Add `databaseUrl: requireEnv("DATABASE_URL")`
- Add `redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379"`
- Add `githubToken: requireEnv("GITHUB_TOKEN")`
- Add `openweathermapApiKey: requireEnv("OPENWEATHERMAP_API_KEY")`

**New environment variables:**
```
DATABASE_URL=postgres://user:pass@localhost:5432/jarvis
REDIS_URL=redis://localhost:6379
GITHUB_TOKEN=ghp_...
OPENWEATHERMAP_API_KEY=...
```

**Migration workflow:**
- Use `drizzle-kit push` for development (schema push, no migration files needed for a demo)
- Add a `db:push` script to server/package.json: `"db:push": "drizzle-kit push"`
- The server's `db/index.ts` connects on import — test by running the server

**Verify CP1:**
- `pnpm --filter server db:push` runs without errors
- Server starts, connects to PostgreSQL and Redis
- A simple query (e.g., selecting from sessions) returns empty results
- Existing voice loop still works (no regressions)

---

### Checkpoint 2: Tool Infrastructure in Relay

Build the tool definition and execution system. Extend the relay to handle tool calls from OpenAI. Extend shared types. Verify with a trivial test tool before adding real integrations.

**New shared types** (extend `shared/src/types.ts`):

```typescript
// Add to ServerMessage union:
| { type: "tool.started"; callId: string; name: string; args: Record<string, unknown> }
| { type: "tool.done"; callId: string; name: string; durationMs: number; evidence: Evidence | null }
| { type: "tool.error"; callId: string; name: string; error: string }

// New Evidence type:
export interface Evidence {
  source: string;       // "github" | "openweathermap" | "memory"
  entity: string;       // "repo:facebook/react" | "weather:dallas"
  fetchedAt: string;    // ISO timestamp
  freshnessSec: number; // seconds since fetch
  citationRef: string;  // human-readable reference
}
```

**New file** — `server/src/tools/types.ts`:
```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  output: string;           // JSON string sent back to OpenAI
  evidence: Evidence | null; // evidence metadata sent to client
}
```

**New file** — `server/src/services/tool-registry.ts`:
- `ToolRegistry` class with: `register(tool: ToolDefinition)`, `get(name: string)`, `getOpenAITools()` (returns tool definitions in OpenAI format), `execute(name, args)` (calls the tool's execute function, catches errors)
- Export a singleton `toolRegistry`

**Modify** `server/src/services/relay.ts`:
1. Import the tool registry
2. In the `session.update` message, add `tools: toolRegistry.getOpenAITools()` to the session config
3. Add new cases to the OpenAI event switch:

```typescript
case "response.function_call_arguments.done": {
  const callId = event.call_id as string;
  const name = event.name as string;
  const args = JSON.parse(event.arguments as string);

  // Tell client a tool is executing
  send(clientWs, { type: "tool.started", callId, name, args });

  const startTime = Date.now();
  try {
    const result = await toolRegistry.execute(name, args);
    const durationMs = Date.now() - startTime;

    send(clientWs, { type: "tool.done", callId, name, durationMs, evidence: result.evidence });

    // Send result back to OpenAI
    openai.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: result.output,
      },
    }));
    // Trigger model to respond with the tool result
    openai.send(JSON.stringify({ type: "response.create" }));

  } catch (err) {
    send(clientWs, { type: "tool.error", callId, name, error: err.message });
    // Send error result back to OpenAI so it can respond gracefully
    openai.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({ error: err.message }),
      },
    }));
    openai.send(JSON.stringify({ type: "response.create" }));
  }
  break;
}
```

4. Also handle `response.output_item.added` for function_call items (currently only handles "message" type):
```typescript
case "response.output_item.added": {
  const item = event.item as Record<string, unknown> | undefined;
  if (item?.type === "message" && item?.role === "assistant") {
    send(clientWs, { type: "response.started", itemId: item.id as string });
  }
  // function_call items don't need client-side tracking
  break;
}
```

**Important:** The `switch` case handler for tool execution needs to be `async`. Check if the `openai.on("message")` callback can be async. If not, use a fire-and-forget pattern: `void handleToolCall(...)` that runs the async work outside the callback.

**Verify CP2:**
- Register a trivial test tool (e.g., `echo` that returns its args as a string)
- Ask Jarvis "Please echo the word 'test'" (or however the model interprets the tool)
- The tool executes, the model responds using the result
- Client receives `tool.started` and `tool.done` events
- Remove the test tool after verification
- Existing voice loop still works

---

### Checkpoint 3: GitHub Integration

Implement 5 GitHub tools. Register them. Verify Jarvis can answer grounded GitHub questions.

**New dependencies:** Add `@octokit/rest` to server/package.json.

**New file** — `server/src/tools/github.ts`:

Implement these tools (each is a `ToolDefinition`):

| Tool | Parameters | Returns |
|------|-----------|---------|
| `github_list_open_prs` | owner, repo | Count + last 10 open PRs (number, title, author, created) |
| `github_get_pr_details` | owner, repo, pr_number | Title, body summary, author, status, review state, comment count, files changed |
| `github_list_issues` | owner, repo, labels? | Count + last 10 open issues (number, title, labels, assignee, created) |
| `github_get_issue_details` | owner, repo, issue_number | Title, body, author, labels, comment count, timeline summary |
| `github_get_recent_merges` | owner, repo, count? | Last 10 merged PRs (number, title, author, merged_at) |

Each tool:
1. Calls Octokit with the GitHub PAT from config
2. Returns a `ToolResult` with:
   - `output`: JSON string of the data (this goes back to OpenAI)
   - `evidence`: `{ source: "github", entity: "repo:owner/repo", fetchedAt: new Date().toISOString(), freshnessSec: 0, citationRef: "GitHub API" }`
3. Catches Octokit errors and returns clean error messages. For rate limits (403 with `x-ratelimit-remaining: 0`), return a message including the reset time.

**New file** — `server/src/tools/github-url-parser.ts`:
```typescript
// Parse various GitHub URL formats into { owner, repo, type, number? }
// Supports:
//   github.com/owner/repo
//   github.com/owner/repo/pull/123
//   github.com/owner/repo/issues/456
//   owner/repo (shorthand)
// Returns null for unsupported URL types (commits, blobs, releases, etc.)
```

**Register tools** in `server/src/index.ts` (or a new `server/src/tools/index.ts` that registers all):
```typescript
import { registerGithubTools } from "./tools/github.js";
registerGithubTools(toolRegistry, config);
```

**System prompt update** — modify `SYSTEM_PROMPT` in `relay.ts`:
```
You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct. Keep spoken answers to 1-3 sentences unless the user asks for more detail.

Rules:
- For questions about GitHub repositories, PRs, issues, or merges, you MUST use the appropriate github_ tool. NEVER fabricate repository data, PR numbers, issue counts, or author names.
- When you need to look something up, briefly acknowledge the request first (e.g., "Let me check that for you"), then call the tool.
- When reporting tool results, cite the exact numbers and names from the tool response. Do not round, approximate, or embellish.
- If you don't have a tool to answer a question, say "I don't have that information right now."
- If a tool returns an error, report the error honestly.
```

**Verify CP3:**
- Ask: "What are the open pull requests on facebook/react?" → Jarvis acknowledges, calls tool, speaks grounded answer with PR numbers and titles.
- Ask: "Tell me about the open issues on vercel/next.js" → works with issue data.
- Ask a non-tool question: "What is 2 + 2?" → Jarvis answers without calling a tool.
- Ask about an unsupported URL type: provide a commit URL → Jarvis explains it can't analyze that type.
- Verify client receives `tool.started` and `tool.done` messages.

---

### Checkpoint 4: Weather Integration + Freshness Enforcement

Add OpenWeatherMap with Redis caching and hard 3-minute freshness enforcement.

**New file** — `server/src/tools/weather.ts`:

`weather_get_current` tool:
- Parameters: `location` (string, city name or "city,country_code")
- Implementation: reads from Redis cache first. If cache hit AND `freshnessSec <= 180`: return cached data. If cache miss or stale: fetch from OpenWeatherMap API (`api.openweathermap.org/data/2.5/weather?q={location}&appid={key}&units=imperial`), store in Redis with TTL 180s, return fresh data.
- If fetch fails AND cache is stale: return `{ error: "Weather data is currently unavailable" }` — **never return stale data.**
- ToolResult evidence: `{ source: "openweathermap", entity: "weather:${location}", fetchedAt, freshnessSec, citationRef: "OpenWeatherMap API" }`
- Return data shape: `{ location, temperature_f, feels_like_f, humidity_pct, wind_speed_mph, conditions, fetched_at }`

**New file** — `server/src/services/weather-poller.ts`:
- Background poller that refreshes cached weather data every 3 minutes
- On startup, there's nothing to poll (no cities cached yet). The first request for a city populates the cache. Subsequent polls refresh all previously-requested cities.
- Track a `Set<string>` of requested cities. Every 3 minutes, refresh each.
- If 3 consecutive poll failures for a city, log a warning but don't crash.
- Start in `server/src/index.ts`, stop on shutdown.

**Register tool** alongside GitHub tools.

**System prompt addition:**
```
- For questions about weather, temperature, or conditions at a location, you MUST use the weather_get_current tool. Never guess weather data.
- When reporting weather data, mention how recent the data is (e.g., "based on data from about 30 seconds ago").
```

**Verify CP4:**
- Ask: "What's the weather in Dallas?" → Jarvis acknowledges, calls tool, speaks temperature/conditions with freshness reference.
- Ask again immediately → uses cached data (fast response).
- Manually delete the Redis key, make the API unreachable (e.g., wrong API key), ask again → Jarvis refuses: "Weather data is currently unavailable."
- Verify evidence metadata is sent to client.

---

### Checkpoint 5: Evidence UI + Refusal Behavior

Make trust visible in the companion UI. Evidence cards, tool activity, and clean refusal behavior.

**Extend client types** (`client/src/types.ts`):
```typescript
import type { Evidence } from "@jarvis/shared";

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  interrupted?: boolean;
  evidence?: Evidence[];     // NEW
  toolCalls?: ToolCallInfo[]; // NEW
}

export interface ToolCallInfo {
  callId: string;
  name: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  args?: Record<string, unknown>;
  error?: string;
}
```

**Modify** `client/src/hooks/useVoiceSession.ts`:
- Handle new `tool.started`, `tool.done`, `tool.error` server messages
- On `tool.started`: add a `ToolCallInfo` (status: running) to the current assistant turn
- On `tool.done`: update the ToolCallInfo to done, add the evidence to the turn
- On `tool.error`: update the ToolCallInfo to error

**New component** — `client/src/components/EvidenceCard.tsx`:
- Displays evidence for a grounded answer: source icon/label, entity name, freshness ("fetched 30s ago"), and citation
- Subtle, compact design — sits below or beside the assistant's transcript text
- Color-coded freshness: green (< 2 min), amber (2-3 min), red (> 3 min / stale)

**New component** — `client/src/components/ToolCallIndicator.tsx`:
- Inline indicator showing tool execution: name, status (spinner while running, checkmark when done, X on error), duration
- Shows below the assistant turn that triggered it

**Modify** `client/src/components/Transcript.tsx`:
- Render `EvidenceCard` and `ToolCallIndicator` within assistant turns that have evidence/toolCalls
- Keep the transcript clean — evidence cards are supplementary, not dominant

**Verify CP5:**
- Ask a GitHub question → evidence card appears below the answer showing "Source: GitHub API, fetched 0s ago"
- Ask a weather question → evidence card shows "Source: OpenWeatherMap, fetched Xs ago"
- Ask something Jarvis can't answer → no evidence card, just a clean refusal
- The UI feels coherent, not cluttered

---

### Checkpoint 6: Persistence, Session Summaries, Idle Timeout

Save conversations to the database. Generate structured summaries. Wire up idle timeout.

**New file** — `server/src/services/persistence.ts`:
```typescript
export async function saveMessage(db, sessionDbId: string, msg: {
  role: string;
  content: string;
  toolCalls?: unknown;
  toolName?: string;
  evidence?: unknown;
}): Promise<void>
```
- Inserts a row into the `messages` table.
- Call this from relay.ts at key moments:
  - On `conversation.item.input_audio_transcription.completed` → save user message
  - On `response.audio_transcript.done` or `response.output_audio_transcript.done` → save assistant message
  - On tool execution → save tool message (role: "tool", toolName, content: tool output)

**New file** — `server/src/services/summary.ts`:
- `generateSessionSummary(db, sessionDbId: string, messages: Message[]): Promise<void>`
- After session ends, fetch all messages for that session from the DB
- Call a text model (use the OpenAI chat completions API with `gpt-4o-mini` or similar — NOT the Realtime API) to generate a structured summary:
  ```
  Given this conversation transcript, extract:
  - topics: list of topics discussed
  - entities: { repos: [...], prs: [...], issues: [...], locations: [...] }
  - key_facts: important facts discussed or retrieved
  - unresolved: any questions or follow-ups that weren't completed
  Return as JSON.
  ```
- Parse the response and insert into `session_summaries` table.
- This runs async after WebSocket close — don't block the connection.

**Database session lifecycle:**
- On WebSocket connect (in `routes/ws.ts`): create a database session row (insert into `sessions`). Store the DB session ID in the SessionState.
- On WebSocket close: update `sessions.ended_at`, then trigger summary generation async.

**Modify `server/src/types.ts`** — extend SessionState:
```typescript
export interface SessionState {
  readonly sessionId: string;
  dbSessionId: string;          // NEW — the PostgreSQL sessions row ID
  readonly connectedAt: Date;
  lastActivityAt: Date;
  turnCount: number;
  status: "connected" | "listening" | "processing" | "speaking";
  wsRef?: WebSocket;            // NEW — for idle timeout to close the connection
}
```

**Wire up idle timeout** (`server/src/services/idle.ts`):
- The idle checker interval already runs (from M1). Replace the placeholder body:
- Every 30s, iterate `sessionManager.sessions`. For each: if `now - lastActivityAt > IDLE_TIMEOUT_MS`, send `session.timeout` message to the client via `session.wsRef`, then close the WebSocket.
- `sessionManager` needs to expose its sessions for iteration, or `idle.ts` needs a reference to the session manager.

**Modify `server/src/services/session.ts`:**
- Store `wsRef` on SessionState (set during `createRelaySession`)
- Add a method to iterate active sessions: `forEachSession(fn: (session: SessionState) => void)`

**Modify `server/src/services/relay.ts`:**
- Set `session.wsRef = clientWs` at the start of `createRelaySession`
- Call `saveMessage(...)` on user transcripts, assistant transcripts, and tool results
- On disconnect, trigger summary generation

**Config update** — add `openaiTextApiKey` (can be same key as realtime, but used for chat completions):
Actually, it's the same key. Just use `config.openaiApiKey` for the summary generation call. Add `openai` npm package to server dependencies for the chat completions call (simpler than raw HTTP for text models).

Wait — the M1 prompt said "do not install the openai npm package." That was for the Realtime API (to understand the raw protocol). For text completions (summary generation), the openai package is fine.

**New dependency:** `openai` (for chat completions only, used in summary generation).

**Verify CP6:**
- Have a multi-turn conversation with tool calls.
- Close the session (end session button or close tab).
- Query the database: `SELECT * FROM messages WHERE session_id = '...'` → all turns present.
- Query: `SELECT * FROM session_summaries WHERE session_id = '...'` → summary exists with topics, entities, key_facts.
- Leave a session idle for 10+ minutes → session disconnects with timeout message.

---

## Technical Specifications

### OpenAI Tool Definition Format (for session.update)

```json
{
  "type": "function",
  "name": "github_list_open_prs",
  "description": "List open pull requests for a public GitHub repository",
  "parameters": {
    "type": "object",
    "properties": {
      "owner": { "type": "string", "description": "Repository owner (e.g. 'facebook')" },
      "repo": { "type": "string", "description": "Repository name (e.g. 'react')" }
    },
    "required": ["owner", "repo"]
  }
}
```

Register all tools in the `session.update` message's `tools` array. The existing session.update in relay.ts needs `tools: toolRegistry.getOpenAITools()` added to the session config object.

### Freshness Enforcement Algorithm

```typescript
function checkFreshness(fetchedAt: Date): { fresh: boolean; ageSec: number } {
  const ageSec = Math.floor((Date.now() - fetchedAt.getTime()) / 1000);
  return { fresh: ageSec <= 180, ageSec };
}
```

### GitHub URL Support Matrix (from PRD)

| URL Type | Supported | Tool |
|----------|-----------|------|
| `/owner/repo` | Yes | list_open_prs, list_issues, get_recent_merges |
| `/owner/repo/pull/N` | Yes | get_pr_details |
| `/owner/repo/issues/N` | Yes | get_issue_details |
| Compare, commit, blob, release, discussion | No | Refuse with explanation |

### Environment Variables (complete list for M2)

```
OPENAI_API_KEY=sk-...
JWT_SECRET=<random-string>
DATABASE_URL=postgres://user:pass@localhost:5432/jarvis
REDIS_URL=redis://localhost:6379
GITHUB_TOKEN=ghp_...
OPENWEATHERMAP_API_KEY=...
PORT=3001
```

---

## Handling Unknown-Unknowns

1. **Tool execution in the OpenAI event handler might need to be async.** The `openai.on("message")` callback in relay.ts may not support async directly. If so, wrap tool execution in a `void (async () => { ... })()` fire-and-forget. Log errors from the async block — don't let them silently fail.

2. **The model might not acknowledge before calling tools.** The system prompt says "briefly acknowledge the request first, then call the tool." Test whether the model actually does this. If it calls the tool without speaking first, the UX will have a silent gap while the tool executes. Acceptable for M2 — the `tool.started` indicator in the UI compensates. Can be improved in M3.

3. **OpenAI Realtime might send `response.function_call_arguments.delta` events before `done`.** You can ignore the delta events (they're partial argument streaming). Only act on `.done`.

4. **The model might try to call multiple tools in one response.** Handle this: each `function_call_arguments.done` event has its own `call_id`. Execute each independently. Send each result back. The final `response.create` after the last tool result triggers the model to respond.

5. **GitHub API rate limits.** 5000 req/hr with PAT. Log remaining rate limit from response headers. When exhausted, the tool should return a clear error: "GitHub rate limit reached — try again in X minutes."

6. **PostgreSQL connection in development.** The developer needs PostgreSQL running locally. Add a note in the README or a docker-compose.yml for dev dependencies. If using Railway for managed Postgres, note the connection string format.

7. **Redis might not be running.** The weather tool depends on Redis cache. If Redis is unavailable, the weather tool should still work (just slower — direct API call every time, no caching). Don't crash the server if Redis is down.

8. **Summary generation might fail.** The OpenAI chat completions call could fail (network, rate limit, etc.). Log the error, don't crash. The session row still gets `ended_at` set. Summary can be retried manually later.

9. **Drizzle push might fail if PostgreSQL isn't running.** Make `db:push` a development task, not a server startup dependency. The server should fail fast with a clear error if the database connection fails, but it shouldn't try to run migrations on startup.

10. **The `openai` npm package for summary generation vs raw fetch.** Using the `openai` package is fine for chat completions (it's a simple request-response, not a persistent connection). This is separate from the Realtime API relay which uses raw WebSocket.

---

## What NOT to Do

- **Do not restructure the relay.ts architecture.** Add tool handling to the existing switch statement. Don't refactor what works.
- **Do not add user authentication (email/password).** M2 uses anonymous sessions. The JWT is for session identity only.
- **Do not build cross-session recall.** M2 generates summaries. M3 queries them.
- **Do not add pgvector or embeddings.** That's M3.
- **Do not add the `openai` package for the Realtime API.** Only use it for the text model call in summary generation. The Realtime relay stays as raw WebSocket.
- **Do not build a migration system.** Use `drizzle-kit push` for development. Proper migrations can be added later.
- **Do not over-style the evidence UI.** Functional and readable is enough. M3 polishes the UX.

---

## Success Criteria (End of M2)

Run through this complete sequence:

1. **GitHub Q&A:** Ask "What are the open pull requests on facebook/react?" → Jarvis acknowledges, tool executes, speaks a grounded answer with PR numbers and titles. Evidence card appears in UI showing "GitHub API, fetched 0s ago."

2. **Weather Q&A:** Ask "What's the weather in Dallas?" → Jarvis speaks temperature and conditions with freshness reference. Evidence card shows source and age.

3. **Refusal:** Ask "What's the deployment status of my server?" → Jarvis responds with "I don't have that information right now" or similar. No fabrication.

4. **Stale data refusal:** Disconnect Redis, let the weather cache expire, ask about weather → Jarvis refuses with "Weather data is currently unavailable."

5. **Multi-turn with tools:** Have 3+ turns mixing general conversation and tool questions. All work correctly. Transcript shows full history with evidence.

6. **Interruption still works:** Ask a long question, interrupt mid-response, follow-up is coherent. (Regression test from M1.)

7. **Persistence:** After the conversation, query the database → all turns are saved as messages with correct roles, tool calls have evidence metadata.

8. **Session summary:** End the session → session_summaries row exists with topics, entities, key_facts.

9. **Idle timeout:** Leave idle 10+ minutes → session disconnects with timeout message.

10. **Typecheck + lint:** `pnpm typecheck` and `pnpm lint` pass.
