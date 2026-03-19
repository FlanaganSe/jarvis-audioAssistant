# Jarvis Audio Assistant -- Product Requirements Document

**Version:** 2.0
**Date:** 2026-03-18
**Status:** Draft -- unified from prior PRD iterations
**Primary Inputs:** `docs/requirements.md`, `docs/research.md`, `docs/research-providers.md`, `.claude/rules/*.md`

---

## 1. Context and Problem

No product exists today. Jarvis is a greenfield build from a requirements brief provided by Frontier Audio (`docs/requirements.md`). Comprehensive technology research has been completed (`docs/research.md`, `docs/research-providers.md`).

**The problem:** Frontline workers make time-critical decisions and cannot stop to use screens or keyboards. They need instant, accurate, spoken answers grounded in live operational data and GitHub repository state. No existing voice assistant guarantees factual accuracy -- they either fabricate answers or lack the integrations to answer at all.

**The tension:** Natural conversational speed and zero-hallucination accuracy are fundamentally at odds. Solving this requires a tool-first architecture where every factual claim is backed by fresh evidence or the system explicitly refuses.

**The opportunity:** No product on the market combines natural voice interaction, zero-hallucination grounding against live APIs, GitHub repository intelligence, and cross-session memory. The closest competitors (VoiceLine, aiOla) focus on structured data capture and workflow triggers -- not interactive conversational Q&A.

This is a **demo project** intended to be shown to stakeholders. It must demonstrate best-practice architecture, high-quality voice UX, and genuinely useful functionality. The codebase must be flexible enough for continued iteration.

> **North-star user story:** As a technical frontline operator working in a time-constrained environment, I want to ask Jarvis what changed, what matters right now, and what I should do next, and get a fast spoken answer that is grounded in fresh evidence, easy to interrupt, and paired with a lightweight visual companion that shows sources, status, and safe next actions.

---

## 2. Solution

Jarvis is a real-time voice assistant that streams bidirectional audio via WebSocket to an OpenAI Realtime API session managed by a Fastify relay server. The server handles all tool execution (GitHub queries, external API lookups, memory retrieval) and enforces a strict evidence-gating policy: operational facts are answered only from fresh tool results (<=3-minute staleness) or the system says "I don't know." A companion web UI provides visual context -- live transcript, tool activity, data freshness indicators, and conversation history.

### Architecture

```
+--------------------------+
|    Web Client (React)    |
|  - Push-to-talk button   |
|  - Audio capture/play    |
|  - Companion UI          |
+------------+-------------+
             | WebSocket (Opus audio + JSON events)
             v
+--------------------------+
|   Fastify Relay Server   |
|  - Auth (JWT via jose)   |
|  - OpenAI Realtime WS    |
|  - Tool execution        |
|  - Memory read/write     |
|  - Freshness enforcement |
|  - Observability         |
+--+-------+-------+------+
   |       |       |
   v       v       v
+------+ +-----+ +--------------+
| PG + | |Redis| | External APIs|
|pgvec | |     | | GitHub, etc. |
+------+ +-----+ +--------------+
```

**Why a relay server (current default):** All secrets stay server-side. All tool execution is server-side. Single point for observability and policy enforcement. Adds ~50-100ms latency -- invisible against 250ms+ from the model. Works with any client (web, mobile, desktop) without client-side SDK changes.

**Transport decision (finalized after M0 spike):** WebSocket relay is the chosen transport. M0 benchmarked both relay and WebRTC -- relay latency (1190-2434ms E2E) is within PRD targets (<=2s p95), relay is simpler to implement and debug, and gives full server-side control over tool execution and observability. WebRTC remains a documented migration path if latency or scalability becomes a concern post-demo.

---

## 3. Product Contracts

### 3.1 Truth Contract

The requirement says "zero hallucinations." The enforceable product contract is:

> **Jarvis will make zero unsourced operational claims.**

- For GitHub state, API-backed facts, and memory recall, Jarvis must answer from retrieved evidence or abstain.
- If fresh evidence is unavailable, stale, filtered, or incomplete, Jarvis must say so clearly.
- Jarvis may still use conversational language, but operational content must remain evidence-gated.

**Enforcement approach (not just prompt rules):**
- Operational turns use `tool_choice: "required"` (or restricted tool list) so the model cannot skip evidence retrieval.
- Tools return normalized evidence objects. The system prompt constrains Jarvis to cite only values present in those objects.
- Zod validation on tool inputs and outputs ensures schema adherence at the application layer.
- The eval suite must verify that spoken answers do not misrepresent, overstate, or invent facts beyond what tool results contain. This is the primary enforcement mechanism -- prompt rules and tool schemas reduce but do not eliminate misrepresentation risk.
- Server-side logging captures tool results alongside the spoken response for audit comparison.

### 3.2 Freshness Contract

For API-sourced data, Jarvis must only answer from data that is at most 3 minutes old.

- If data is fresh: answer and show freshness metadata.
- If data is stale but refresh succeeds: answer from the new data.
- If refresh fails or freshness cannot be verified: refuse the operational answer and explain.

```
effective_age = max(now - fetched_at, Age header, now - Date header)
effective_age <= 180s  ->  answer eligible
effective_age > 180s   ->  refresh before answering
refresh fails          ->  "data currently unavailable" (never hallucinate)
```

Note: this cache-age model aligns with the stated source refresh rate (every 3 minutes). It guarantees recency relative to the last fetch, not that the source hasn't changed since. If the external API spec provides more granular change signals (ETags, version fields, webhooks), the freshness model should use them for tighter guarantees.

### 3.3 Trust Boundary Contract

Untrusted external text (GitHub issue bodies, PR comments, API response fields, user-provided URLs) must never directly determine tool selection, permission escalation, or durable memory writes. All external data passes through a structured extraction step before it can influence Jarvis's behavior. This is an architectural rule, not a prompt guideline.

### 3.4 Action Contract

In MVP, Jarvis may propose actions but must not execute write actions.

- **Allowed:** read-only GitHub analysis, read-only API answers, dry-run action plans and recommendations.
- **Deferred:** creating PRs, posting comments, mutating external systems.

---

## 4. Users and Personas

### Primary: Frontline Operator

A field engineer, operations engineer, or shift lead who needs answers quickly while multitasking in an environment where attention is fragmented and delays are costly.

- Fast conversational answers while hands are occupied
- Confidence that answers are current and accurate
- Ability to interrupt, correct, and redirect
- Companion display for details, sources, and timestamps

**Success:** Jarvis helps them decide what matters now and what to do next in under a minute.

### Secondary: Team Lead / Technical Operator

A technical reviewer who cares about correctness, risk, and action previews more than conversational novelty.

- Repo, PR, and issue summaries with direct grounding
- Action previews such as draft comments or PR outlines
- History recall across sessions for continuity

**Success:** Jarvis reduces review overhead and accelerates triage without crossing safety boundaries.

### Tertiary: Stakeholder / Demo Evaluator

A decision-maker judging whether Jarvis is differentiated, useful, trustworthy, and extensible.

- Immediate wow factor with clear business relevance
- Evidence that the product is grounded, not performative
- A credible path from demo today to scalable product later

**Success:** They leave convinced that the product is both impressive and thoughtfully scoped.

---

## 5. Goals and Non-Goals

### Goals

1. Deliver a voice experience that feels natural, low-latency, and interruption-friendly.
2. Make trust visible: live answers must be grounded, fresh, and explainable.
3. Create a compelling stakeholder demo that showcases real utility, not just voice novelty.
4. Keep the product surface intentionally narrow enough to build well.
5. Preserve architectural flexibility so the team can change providers, channels, and integrations later.

### Non-Goals

- Fully autonomous repo mutations without human approval.
- Full passive wake-word mode as the default interaction.
- Native iOS/Android production hardening.
- Enterprise compliance certification readiness (HIPAA, SOC2).
- Offline-first voice intelligence.
- Telephony / phone call integration.
- Multi-language support (English only).
- Production scaling beyond ~10 concurrent users.
- Custom voice cloning or voice selection.
- Real-time code analysis or semantic code understanding (GitHub covers metadata only).
- Persistent audio recording storage (transcripts only).
- Complex workflow orchestration (Temporal) for MVP.

---

## 6. Product Principles

1. **Trust over fluency.** Jarvis must refuse unsupported operational claims instead of sounding confident and wrong.
2. **Never leave the user in silence.** If work will take perceptible time, Jarvis acknowledges audibly and visually.
3. **Interruptibility is first-class.** "Quiet, Jarvis" must work reliably -- this is not a polish item.
4. **Voice-first, not voice-only.** A companion UI is required for citations, freshness, approvals, and session history.
5. **Read first, act later.** The system earns trust before gaining write authority.
6. **Speak short, show long.** Default to 1-3 spoken sentences; deeper detail lives in the companion UI.
7. **Build for change.** Vendor-specific choices are hidden behind interfaces so providers can be swapped.

---

## 7. Scope

### P0 -- Core Demo (must ship)

| ID | Feature |
|----|---------|
| R1 | Real-time voice conversation via push-to-talk |
| R2 | Natural conversation cadence with audible progress cues |
| R3 | Interruption support (halt and redirect mid-response) |
| R4 | Zero unsourced operational claims (evidence-gated answering) |
| R5 | GitHub integration -- public repos, read-only |
| R6 | External API data handling (OpenWeatherMap; adapter pattern supports future API swap) |
| R7 | Self-awareness from a live capability registry |
| R8 | Companion web UI (transcript, status, citations) |
| R9 | Conversation persistence (all turns stored in PostgreSQL) |
| R10 | Observability (latency, cost, tool success, refusals) |
| R11 | Session auth via JWT |
| R12 | Cost and session controls (10-min idle timeout, per-session cost tracking) |
| R13 | Cross-session memory recall via structured session summaries |

### P1 -- Demo Polish (elevates the experience)

| ID | Feature |
|----|---------|
| R13+ | Enhanced semantic memory recall via pgvector (upgrades R13 structured recall) |
| R14 | Tool call visualization (real-time activity feed in companion UI) |
| R15 | User preferences ("remember that I prefer...", manageable via voice or UI) |
| R16 | Data freshness display (live indicator with amber/red aging) |
| R17 | Audio level visualization (waveform or VU meter) |

### P2 -- Stretch Goals (additional wow)

| ID | Feature |
|----|---------|
| R18 | Wake word activation ("Hey Jarvis" via Porcupine, opt-in toggle) |
| R19 | Multi-user support with data isolation (PostgreSQL RLS) |
| R20 | End-to-end agent actions (analyze issue, propose fix, open draft PR with approval) |
| R21 | Mobile client (React Native + Expo, same backend) |

---

## 8. Functional Requirements and Acceptance Criteria

### R1 -- Real-time voice conversation (P0)

The user speaks into a push-to-talk interface and Jarvis responds with natural, low-latency audio. The voice pipeline uses OpenAI Realtime API (`gpt-realtime-mini`) via the relay server. Audio format: PCM 16-bit 24kHz between server and OpenAI; Opus-encoded between client and server for bandwidth efficiency. Sessions auto-disconnect after 10 minutes of idle silence to prevent cost overruns.

**Acceptance criteria:**
- Given the user clicks push-to-talk and says "Hello, Jarvis" -- then Jarvis responds audibly within 2 seconds with a greeting, and the transcript shows both turns.
- Microphone state, listening state, and error state are always visible in the UI.
- Given a session has been idle for 10 minutes -- then the connection closes, the UI shows "Session ended -- press to reconnect," and session cost is logged.

### R2 -- Natural conversation cadence (P0)

If a response or tool call takes >500ms, Jarvis plays an audible acknowledgement ("Let me check that for you" or a short earcon) before the full response. Silence is never ambiguous.

**Acceptance criteria:**
- Given a tool call takes >500ms -- then Jarvis plays an audible cue within 500ms of end-of-user-speech. No period of dead silence exceeds 1 second.
- Default spoken responses are concise (1-3 sentences) with detail deferred to the companion UI.
- The user can request modes: brief, deep dive, or exact readback.

### R3 -- Interruption support (P0)

The user can interrupt Jarvis mid-response by pressing push-to-talk while Jarvis is speaking. Jarvis stops audio playback and begins processing the new input. The primary interrupt mechanism is the push-to-talk button (consistent with the push-to-talk interaction model). If server VAD is enabled in a future mode, voice barge-in ("Quiet, Jarvis") would also trigger interruption.

**WebSocket protocol requirements:** Interruption is not just "stop playback." The relay server must implement the full interruption state machine:
1. Client stops local audio playback and records the playback cursor position (how much audio the user actually heard).
2. Client/server sends `response.cancel` to halt ongoing model generation.
3. Server sends `conversation.item.truncate` with the audio cursor position to align the model's conversation state with what the user actually heard. Without this, the model continues from text the user never heard, causing context drift and broken follow-ups.
4. The truncated (partial) assistant message remains in the UI transcript.

**Acceptance criteria:**
- Given Jarvis is speaking -- when the user presses push-to-talk -- then local audio output stops immediately, `response.cancel` is sent, and `conversation.item.truncate` aligns server context to the playback cursor. The UI transitions to "Listening."
- Interrupted answers remain visible in the UI transcript as partial responses.
- A follow-up question after an interruption is coherent (the model does not reference content from the truncated portion).
- False interruptions and missed interruptions are measured in telemetry.

### R4 -- Zero unsourced operational claims (P0)

For any question about GitHub, external API data, or operational facts, Jarvis answers only from a tool call result fetched within the last 3 minutes, or says "I don't have that information right now." The system prompt explicitly forbids fabrication and requires citations. Operational turns enforce `tool_choice: "required"` so the model cannot skip evidence retrieval.

**Important limitation:** even with forced tool use, the realtime model generates the final spoken answer from tool results using natural language. It can still misquote numbers, overstate, or blend tool data with parametric knowledge. The primary defense is the eval suite (see section 16), not the model's instruction following alone. Server-side logging of tool results vs spoken output enables audit.

**Acceptance criteria:**
- Given the user asks about deployment status with no API connected -- then Jarvis responds with a clear refusal, never a fabricated answer.
- Given the user asks about open PRs -- then every PR number and title matches current GitHub API state, and the companion UI shows the tool call with timestamp.
- The eval suite verifies that spoken numeric values and entity names match the tool result payload exactly.

### R5 -- GitHub integration (P0, public, read-only)

Given any public GitHub repository URL, Jarvis fetches and answers questions about: open PRs (count, titles, authors), open issues (count, labels, assignees), last 10 merges, PR details (diff summary, comments, review status), and issue details (body, comments, timeline). Uses Octokit with GitHub REST/GraphQL API. When the rate limit is reached, Jarvis reports the limit and reset time.

**Acceptance criteria:**
- Given the user says "Tell me about the open pull requests on facebook/react" -- then Jarvis responds with count and summary, sourced from GitHub API, and the companion UI shows the tool call.
- Given the user provides a URL like "github.com/vercel/next.js" and asks "What was the last thing merged?" -- then Jarvis responds with details of the most recent merged PR.
- All GitHub-derived answers surface provenance and freshness in the companion UI.

### R6 -- External API data handling (P0, OpenWeatherMap)

The MVP uses OpenWeatherMap as the live external data source. This was chosen for demo impact: weather data changes constantly (ideal for freshness demos), returns precise verifiable numbers (ideal for truth contract demos), and "weather at the job site" is a natural frontline operator question. The adapter pattern means the API can be swapped later without changing the voice UX.

A background poller refreshes weather data every 3 minutes into Redis (TTL 180s). Tool calls read from cache. If cache is stale and refresh fails, Jarvis reports data is currently unavailable. The adapter is a typed interface (`ExternalApiAdapter`) so swapping the API requires changing only the adapter implementation.

**Tool:** `weather_get_current` -- takes a city/location name, returns temperature, humidity, wind speed, conditions, and the data's fetch timestamp.

**Acceptance criteria:**
- Given the user asks "What's the weather in Dallas?" -- then Jarvis responds with current conditions and includes a spoken freshness reference ("Based on data from about 45 seconds ago..."). The companion UI shows the tool call with freshness timestamp.
- Given Redis cache has expired and OpenWeatherMap is unreachable -- then Jarvis refuses with "Weather data is currently unavailable."
- If 3 consecutive poll failures occur, the companion UI shows a degraded-status indicator.

### R7 -- Self-awareness (P0)

When asked "What can you do?", Jarvis responds from a capability registry (a data structure, not prompt prose) that reflects currently available tools, connected integrations, and known limitations.

**Acceptance criteria:**
- Given the user asks "What can you do, Jarvis?" -- then the response matches the tools registered in the capability registry. No capability outside the registry is claimed.
- Given the user asks "Can you send an email?" -- then Jarvis clearly states this is outside its capabilities.

### R8 -- Companion web UI (P0)

A React + Vite single-page application providing:
- Push-to-talk button with visual state (idle / listening / processing / speaking)
- Live conversation transcript (user and assistant turns)
- Session status indicator (connected, reconnecting, error)

Target browser: Chrome (latest). Safari and Firefox are non-goals for the demo.

**Acceptance criteria:**
- Given the user navigates to the web app -- then the UI displays a push-to-talk button, empty transcript area, and connection status showing "Connected."
- Given a conversation is in progress -- then both user and assistant turns appear in the transcript within 1 second of completion.

### R9 -- Conversation persistence (P0)

All conversation turns are stored in PostgreSQL (user messages as transcripts, assistant messages as text, tool calls with arguments and results). Sessions have start/end timestamps and user association. No retention policy for the demo. Raw audio is not stored.

**Acceptance criteria:**
- Given a session has occurred -- when the user starts a new session -- then the previous session's transcript is retrievable.

### R10 -- Observability (P0)

Every turn records timing for listen, think, tool, and speak stages. The team can inspect cost per active minute, tool success rate, and refusal rate.

**Acceptance criteria:**
- Each turn logs latency, tool calls, refusal reason, and model cost.
- An internal dashboard shows per-session and per-minute cost, tool success rates, and latency distributions.

### R11 -- Session auth (P0)

Sessions use signed JWT tokens via `jose`. Connected data is unavailable until integration is authorized. Cross-user leakage of transcript, memory, or repo context is prevented by design.

### R12 -- Cost and session controls (P0)

Idle sessions timeout after 10 minutes. Per-session cost is tracked and logged. Session duration and active audio duration are logged separately.

### R13 -- Cross-session memory (P0)

Jarvis recalls context from previous sessions. This is a hard MVP requirement per `docs/requirements.md`.

**P0 implementation:** At session end, an async process extracts a structured session summary and stores it in PostgreSQL: topic(s) discussed, entities referenced (repos, PRs, issues), key facts retrieved, unresolved follow-ups, and timestamp. When the user asks about a prior session, Jarvis queries these structured summaries by recency and entity match. This avoids building memory on raw ASR transcripts, which are unreliable (OpenAI docs note that Realtime input transcription is guidance, not a precise record of what the model heard).

**P1 enhancement (R13+):** Upgrade to pgvector semantic search over embedded session summaries (`text-embedding-3-small`, 1536-dim) for richer recall across many sessions.

**Acceptance criteria:**
- Given the user discussed "open issues on vercel/next.js" yesterday -- when the user asks "What were we talking about yesterday?" -- then Jarvis retrieves the repo name, topic, and approximate date from the stored session summary.
- Memory recall answers cite the source session (date, topic) so the user can verify.

### R13+ -- Enhanced semantic memory recall (P1)

Upgrade cross-session recall from structured summary queries (R13) to pgvector semantic search over embedded session summaries. Enables richer recall across many sessions and fuzzy topic matching.

### R14 -- Tool call visualization (P1)

The companion UI displays a real-time activity feed showing tool calls: tool name, arguments (summarized), status (pending/success/error), and duration.

### R15 -- User preferences (P1)

Users can set standing instructions ("Never mention repository X," "Always flag security-related issues"). Stored in PostgreSQL, injected into the system prompt per session. Manageable via voice or a settings panel.

### R16 -- Data freshness display (P1)

The companion UI shows the age of the most recent external API data fetch. Updates in real-time. Turns amber when >2 minutes old, red when >3 minutes (stale).

### R17 -- Audio level visualization (P1)

A waveform or VU meter reflecting audio input/output levels. Visual updates within 100ms of audio input.

### R18 -- Wake word activation (P2)

"Hey Jarvis" triggers hands-free activation using Porcupine (Picovoice) running on-device in the browser. Push-to-talk remains the default; wake word is opt-in.

### R19 -- Multi-user support (P2)

Multiple users sign in with data isolation. Each user has their own history, preferences, and memory. PostgreSQL RLS policies filter by `user_id`.

### R20 -- End-to-end agent actions (P2)

For connected GitHub workspaces (GitHub App installed), Jarvis can: analyze an issue, propose a fix, and open a draft PR -- with explicit user approval before any mutation. Workflow: analyze -> propose -> confirm -> execute -> verify.

### R21 -- Mobile client (P2)

React Native (Expo) mobile app with push-to-talk, companion transcript, and the same backend WebSocket connection.

---

## 9. Experience Design

### 9.1 Interaction Model

Push-to-talk by default. This matches noisy frontline environments, avoids wake-word complexity, and makes latency predictable. Text input is always available as a fallback.

### 9.2 Response Modes

- **Brief me** -- 1-3 spoken sentences plus evidence cards.
- **Go deeper** -- layered explanation with more context in the UI.
- **Read back the exact numbers** -- low-creativity mode prioritizing precision.
- **Draft it** -- create a structured action preview instead of acting.

### 9.3 Voice Personality

Jarvis should sound: calm, crisp, direct, operationally literate, honest about uncertainty.

Jarvis should not sound: chatty for its own sake, overly apologetic, jargon-heavy, overconfident when evidence is missing, theatrical or salesy.

### 9.4 Companion UI Surfaces

The companion UI is a core product surface for trust, not optional chrome:
- Live transcript with turn history
- Listening / thinking / answering state indicator
- Evidence cards with freshness timestamps and source links
- Tool call activity feed (P1)
- Session history
- Approval and action state area (future)
- Capabilities view

---

## 10. Technical Architecture and Decisions

### 10.1 Technology Choices

| Concern | Choice | Rationale | Later Path |
|---------|--------|-----------|------------|
| Runtime | Node.js 22+ / TypeScript 5.x | Ecosystem maturity; LLM latency dominates | Stable |
| Backend | Fastify | 3-5x faster than Express, TypeScript-first, plugin ecosystem | Stable |
| Voice pipeline | OpenAI Realtime API (`gpt-realtime-mini`) via WS relay | Best latency, built-in VAD + interruption + tools, simplest for demo | LiveKit Agents as scaling path |
| Connection | WebSocket relay (client-WS-Fastify-WS-OpenAI) | M0 proved: relay latency within targets, simpler, full server-side control | WebRTC + sideband if latency/scale demands it |
| Audio format | Opus (client-server), PCM16 24kHz (server-OpenAI) | Opus for bandwidth, PCM16 required by Realtime API | Stable |
| ORM | Drizzle | Native pgvector, SQL-like API, 5KB bundle, TypeScript-first | Stable |
| Database | PostgreSQL + pgvector | Conversation memory, semantic search, RLS | Stable |
| Cache | Redis | Session state, 3-min API data cache | Stable |
| GitHub SDK | Octokit (`@octokit/rest` + `@octokit/graphql`) | Official SDK, TypeScript types, rate limit handling | Stable |
| Auth | Custom JWT via `jose` | WebSocket-compatible, no vendor lock-in | Clerk/Auth0 later |
| Frontend | React + Vite | Minimal companion UI, no SSR needed | Stable |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) | Cost-effective, pgvector-compatible via Drizzle | Stable |
| Linter | Biome | 10-25x faster than ESLint+Prettier, single config | Stable |
| Testing | Vitest | Co-located tests, fast, TypeScript-native | Stable |
| Package manager | pnpm | Project standard | Stable |
| Deployment | Railway | Push-to-deploy, managed Postgres + Redis add-ons | Fly.io if WS perf needed |
| Observability | OpenTelemetry + Langfuse | Distributed tracing + LLM cost/quality tracking | Stable |

### 10.2 Evidence Model

Each operational answer links to normalized evidence objects:

```typescript
interface Evidence {
  source: string;       // "github" | "external_api" | "memory"
  entity: string;       // "repo:facebook/react" | "pr:12345"
  fetched_at: string;   // ISO timestamp
  freshness_s: number;  // seconds since fetch
  citation_ref: string; // UI-displayable reference
}
```

### 10.3 Memory Architecture

| Layer | Scope | Storage | Contents |
|-------|-------|---------|----------|
| L0: Turn | Ephemeral | In-memory | Current utterance, pending tool calls, interruption state |
| L1: Session | Short-lived | Redis | Previous turns, active goals, task context |
| L2: Durable | Persistent | PostgreSQL | User preferences, integration state, standing instructions |
| L3: Distilled | Compact recall | PostgreSQL + pgvector | Session summaries with provenance, semantic search over history |

MVP ships L0-L2 plus minimal L3 (structured session summaries for cross-session recall). Full semantic vector recall over L3 is P1.

Principle: **structured memory first, vector memory second.** Do not start by throwing transcripts into a vector database. Jarvis's early memory needs are mostly preferences, identities, tasks, prior answers, and unresolved actions. These are structured, auditable, and time-sensitive. Put them in normal tables first.

**Do not build memory on raw ASR transcripts.** OpenAI's docs note that Realtime input audio transcription is guidance, not a precise record. Memory must use typed, provenance-linked records: session summaries with topic, entities, timestamps, and source references -- not embedded transcript text.

### 10.4 GitHub Integration

**Two modes** (Mode A is MVP, Mode B is P2):

- **Mode A -- Public URL ingestion (read-only):** User provides any public GitHub URL. Jarvis parses it, fetches on demand, answers with citations and freshness. Uses PAT for auth.
- **Mode B -- Connected workspace (read + eventually write):** Org installs a GitHub App. Webhooks keep local projections current. Unlocks faster answers, better scope, eventually write actions. Deferred to P2.

**MVP tool set:** `github_list_repos`, `github_get_repo_info`, `github_list_open_prs`, `github_get_pr_details`, `github_list_issues`, `github_get_issue_details`, `github_get_recent_merges`.

**GitHub URL support matrix (MVP):**

| URL Type | Supported | Notes |
|----------|-----------|-------|
| Repository (`/owner/repo`) | Yes | Full support |
| Pull request (`/owner/repo/pull/N`) | Yes | Details, comments, review status |
| Issue (`/owner/repo/issues/N`) | Yes | Body, comments, timeline |
| Compare view (`/owner/repo/compare/...`) | No | Refuse with explanation |
| Commit (`/owner/repo/commit/SHA`) | No | Refuse with explanation |
| File/tree (`/owner/repo/blob/...`) | No | Refuse with explanation |
| Release, discussion, workflow | No | Refuse with explanation |

For unsupported URL types, Jarvis responds: "I can help with repositories, pull requests, and issues. That URL type isn't something I can analyze yet." Large PRs with >100 comments or files are capped with a note that results are partial.

### 10.5 Anti-Overengineering Decisions

- **No wake word or passive listening** in MVP.
- **No mobile-first** before the web experience is excellent.
- **No Temporal** or heavyweight workflow engine. Simple Redis polling + caching covers the 3-minute refresh requirement.
- **No external memory framework** (Zep, Mem0) before structured pgvector memory proves insufficient.
- **No autonomous GitHub writes** without an approval surface.
- **No Mastra** -- its voice support is immature (no VAD, no turn detection).
- **No dual-path routing** for MVP. OpenAI Realtime handles all voice + tool calls. A separate text model path for factual turns (STT -> text LLM -> TTS) would give stricter answer control but adds significant complexity. Documented as a future option if the eval suite reveals unacceptable misrepresentation rates on the single-path architecture.

---

## 11. Data Model

```
User           -- id (UUID), email, display_name, preferences (JSONB), created_at
Session        -- id (UUID), user_id, started_at, ended_at, metadata (JSONB)
Message        -- id (UUID), session_id, user_id, role (user/assistant/system),
                  content, tool_calls (JSONB), embedding (vector 1536), created_at
SessionSummary -- id (UUID), session_id, user_id, topics (TEXT[]),
                  entities (JSONB), key_facts (JSONB), unresolved (JSONB),
                  embedding (vector 1536 -- P1), created_at
ApiCache       -- id, endpoint, response_data (JSONB), fetched_at, expires_at
GitHubCache    -- id, repo_url, query_type, response_data (JSONB), fetched_at, expires_at
```

> **Implementation note:** `ApiCache` and `GitHubCache` tables are not yet implemented. Weather caching uses Redis (180s TTL). GitHub data is fetched on demand without a caching layer.

Multi-tenant RLS on `user_id` from the data model layer.

---

## 12. Non-Functional Requirements

| Area | Target | Notes |
|------|--------|-------|
| First acknowledgement | <=500ms after end-of-user-speech | Audible cue or verbal acknowledgement |
| First assistant audio | <=2s p95, <=1s p50 (non-tool) | Design target for demo conditions |
| First assistant audio (with tool) | <=3s p95 | Tool execution adds latency |
| Interruption halt | <=500ms after push-to-talk press | Relies on OpenAI Realtime native behavior |
| Freshness | Operational answers >3 min old must be refreshed or refused | No silent use of stale data |
| Reliability | No silent failures; every failure yields audible + visible status | Worst demo = frozen/ambiguous state |
| Accuracy | Top demo scenarios succeed with representative accents/noise | Build eval set matching actual users |
| Accessibility | All flows usable through text and readable visual output | Voice is primary, not only modality |
| Cost visibility | Per-session and per-minute tracking in internal dashboards | Active observation, not post-hoc |
| Security | Authenticated sessions, scoped integrations, encrypted transport | Credible without full enterprise program |

---

## 13. Demo Narrative

### Recommended Flow

1. **Capability intro** -- Ask: "What can you do?" Show self-awareness and capability boundaries.
2. **Live trust moment** -- Ask "What's the weather in Dallas?" Show fresh answer with precise numbers, timestamp, and source card. Audience can verify on their phone.
3. **GitHub repo intelligence** -- Paste a public GitHub URL and ask about open PRs, issues, comments, and recent merges.
4. **Interruption moment** -- Interrupt Jarvis mid-response and redirect the question.
5. **Memory moment** -- Ask what was discussed yesterday and have Jarvis retrieve prior context.
6. **Safe agentic future** -- Ask Jarvis to propose a fix or PR plan. Jarvis proposes, explains approval requirements, and stops short of executing.

### Signature Moments

- A 15-second spoken briefing followed by evidence cards showing exactly what changed and when.
- Instant interruption: the user cuts Jarvis off and redirects without waiting.
- A "show me why" panel displaying exact tools and freshness timestamps behind the answer.
- A draft-action drawer previewing a PR outline before anything is executed.

---

## 14. Milestones

### Milestone 0: Spike and De-Risk (COMPLETE)

- Voice loop proven in both relay and WebRTC modes.
- Transport decision: **WebSocket relay** (latency 1190-2434ms, within <=2s p95 target).
- Tool calling proven (GitHub PR queries, 369ms tool round-trip).
- GA API schema verified: uses `input_audio_format`/`output_audio_format` at session level, model name `gpt-realtime-mini` confirmed.
- Interruption protocol implemented (`response.cancel` + `conversation.item.truncate`); needs thorough verification in M1.
- **Key lesson:** research docs mixed beta/GA schemas. M1 must verify all API details from primary docs before writing code.

### Milestone 1: Trustworthy Voice Loop (COMPLETE)

- Push-to-talk conversation end-to-end via WebSocket relay to OpenAI Realtime.
- Interruption with full `response.cancel` + `conversation.item.truncate` + playback cursor tracking.
- Companion UI: StatusBar (color-coded), PushToTalkButton (press-and-hold + interrupt), Transcript (auto-scroll, interrupted turns marked), SessionControls.
- JWT auth via jose, session management (in-memory), idle timeout infrastructure (stubbed, wires up in M2).
- AudioWorklet capture with 48→24kHz downsampling, gapless PCM16 playback.
- GA nested session schema verified (`session.audio.input.format`, `session.audio.output.format`).
- **Carryover to M2:** idle timeout not yet wired up, audible acknowledgement deferred to when real tools exist.

### Milestone 2: Grounded Operational Answers (COMPLETE)

- 5 GitHub tools via Octokit (list_open_prs, get_pr_details, list_issues, get_issue_details, get_recent_merges) with URL parser.
- OpenWeatherMap tool with Redis cache, 3-min freshness enforcement, background poller (LRU 50 cities).
- Tool infrastructure: ToolRegistry class, shared Evidence type, relay handles function_call_arguments.done.
- Evidence cards in companion UI (color-coded freshness) + ToolCallIndicator (running/done/error).
- Refusal behavior: stale weather data refused, missing tools refused, tool errors reported honestly.
- Conversation persistence: all turns saved to PostgreSQL messages table.
- Session summaries via GPT-4o-mini on session close (topics, entities, key_facts, unresolved).
- Idle timeout wired up (10-min, closes WebSocket).
- Database: 6 tables via Drizzle (users, sessions, messages, session_summaries, api_cache, github_cache).

### Milestone 3: Memory and Product Polish (COMPLETE)

- User identity: demo user via localStorage, userId flows through JWT → WS → DB sessions.
- User preferences: 3 voice-driven tools (set/list/delete), REST endpoints, injected into system prompt, 20-item cap.
- Cross-session memory: memory_recall tool with keyword search + pgvector embedding fallback for fuzzy queries.
- Capability self-awareness: jarvis_capabilities reads live tool registry + static metadata.
- UX polish: dark theme design system (styles.ts), all components restyled (chat bubbles, animated PTT, evidence chips, tool status dots), InfoDrawer with Preferences + Sessions tabs.
- System prompt consolidated: clean sections (Voice Style / Tools and Evidence / Trust Rules).

### Milestone 4: Showcase Layer

- Repo briefing mode: "Give me the state of this repo in 30 seconds."
- "What changed since last time?" summaries.
- Dry-run action proposal flow.
- Audio level visualization (P1).
- Final polish for stakeholder presentation.

---

## 15. Success Metrics

### Experience Metrics

| Metric | Target |
|--------|--------|
| First assistant audio (non-tool) | <=1s p50, <=2s p95 |
| First assistant audio (with tool call) | <=3s p95 |
| Interruption halt | <=500ms |
| Turn-taking accuracy | >95% |

### Trust Metrics

| Metric | Target |
|--------|--------|
| Operational answers with evidence or refusal | 100% |
| API answers meeting freshness policy or refusing | 100% |
| Fabricated repo/API/memory facts in evals | 0 tolerated |
| Citation visibility on live-answer UI states | 100% |

### Product Value Metrics

| Metric | Target |
|--------|--------|
| Live question flow without touching keyboard | End-to-end completable |
| Public GitHub repo interrogation | Under 1 minute |
| Prior session context recovery | Single prompt |
| Stakeholder demo without manual resets | All planned scenarios |

### Quality Gates Before Stakeholder Demos

- Top 5 demo journeys pass on representative microphones.
- Grounded answers visibly show sources and freshness.
- At least one degraded-tool scenario produces a graceful refusal.
- Session cost and latency are observable in an internal dashboard.

---

## 16. Test and Evaluation Plan

### Test Suites

1. **Voice latency and interruption** -- Quiet and noisy recordings against latency targets.
2. **Stale-data refusal** -- API freshness policy enforcement.
3. **GitHub factual correctness** -- Repo metadata and status queries vs live API state.
4. **Memory precision** -- Within-session and cross-session recall.
5. **Safety** -- Unsupported capabilities, write-action boundary escapes, prompt injection via external data.
6. **Load** -- Concurrent sessions and cost spike detection (k6).

### Release Gate for Demo

- No critical failures in stale-data refusal or factual grounding suites.
- Latency and interruption targets met in representative test environment.
- Traceability present for all demo turns.

---

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Noisy environments hurt STT/turn-taking | High | Push-to-talk default, test with realistic noise, headset recommendation |
| Silent latency breaks user confidence | High | Audible progress cues plus clear UI status |
| Stale or unverifiable data causes bad answers | Critical | Hard freshness gate and mandatory refusal path |
| Cost spikes from concurrent/idle sessions | High | 10-min idle timeout, per-session cost tracking, billing alerts |
| Vendor lock-in to OpenAI | Medium | Adapter boundaries, keep LiveKit as documented migration path |
| Scope creep into production-grade features | Medium | Strict P0/P1/P2 boundaries and milestone exit criteria |
| Prompt injection via GitHub/API data | Medium | Treat all external data as untrusted (OWASP LLM Top 10), sanitize before LLM context |
| Identity ambiguity on shared devices | Medium | Explicit session auth, user-bound memory records |
| Accent-related transcription failures | Medium | User-demographic-matched eval datasets |
| Forgotten sessions burning money | High | ~$0.18/min; 10 sessions x 8 hours idle = ~$864. Enforce timeouts. |

---

## 18. Cost Estimates

| Item | Estimate |
|------|----------|
| OpenAI Realtime (`gpt-realtime-mini`) | ~$0.18/min (~$5.40 per 30-min session) |
| Infrastructure (Railway: compute + Postgres + Redis) | ~$50-70/mo |
| 10 users x 10 min/day | ~$540/mo API + ~$60/mo infra |

API costs dominate infrastructure by 10-50x. Focus optimization on session management and idle prevention, not infrastructure tuning.

---

## 19. Open Questions

### Must Decide Before Build

**Q1. External API spec** *(Resolved)*
The requirements reference "a provided API." OpenWeatherMap has been selected for MVP: free tier (60 calls/min), always-changing data, precise verifiable numbers, fits the frontline operator narrative. The adapter pattern supports swapping to a different API later without changing the voice UX.

**Q2. GitHub auth: PAT vs GitHub App for MVP** *(Owner: Backend)*
PAT is simpler. GitHub App is architecturally cleaner. **Recommendation: PAT for MVP.** Upgrade to GitHub App when connected workspace features (R20) are built.

**Q3. Browser audio transport** *(Resolved after M0)*
M0 spike benchmarked both relay and WebRTC. Relay chosen: latency within targets, simpler, full server-side control. WebRTC is a documented migration path.

### Can Defer

**Q4. Cross-session memory framework** -- Start with structured session summaries (P0). Add pgvector semantic search in P1. Add Zep later only if memory quality is insufficient.

**Q5. Voice pipeline migration trigger** -- What cost/latency threshold triggers migration to LiveKit? Decision can wait until cost data exists.

**Q6. LLM model versions** -- Use `gpt-realtime-mini` for voice. GPT-5-mini for text reasoning. Evaluate GPT-5.4 mini when pricing is confirmed.

---

## 20. Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **OpenAI Realtime API** over LiveKit / cascaded | Best latency, built-in VAD + interruption + tools, simplest for demo. LiveKit is documented fallback. |
| 2 | **WebSocket relay** over direct WebRTC | M0 spike: relay latency within targets (1190-2434ms E2E), simpler, full server-side control. WebRTC is documented fallback. |
| 3 | **Push-to-talk first**, wake word P2 | Reduces complexity, works in noisy environments, avoids iOS background risks. |
| 4 | **Web-first**, mobile P2 | Fastest path to demo. Companion UI shareable via URL. |
| 5 | **No Temporal** for demo | Simple Redis polling + caching is sufficient. Add only when durable write workflows justify it. |
| 6 | **Drizzle + pgvector** over Zep/Mem0 | No new infrastructure. pgvector handles semantic search at demo scale. |
| 7 | **Railway** for deployment | Simplest push-to-deploy with managed Postgres + Redis. |
| 8 | **Biome** over ESLint + Prettier | Single config, 10-25x faster. |
| 9 | **Fastify** over Express | 3-5x faster, TypeScript-first, plugin ecosystem. |
| 10 | **Read-only GitHub** at MVP, writes P2 | Write actions require approval workflows that add significant complexity. |
| 11 | **Structured memory first** (L0-L2 + structured session summaries), semantic vector recall P1 | Keeps system explainable; avoids framework sprawl. Cross-session recall is MVP per requirements. |
| 12 | **Single voice path** for MVP | OpenAI Realtime handles all voice + tool calls. Dual-path (text model for factual turns) is a future option if eval reveals unacceptable misrepresentation. |

---

## 21. Hard Problems

1. **External API adapter design.** The API spec has not been provided. Adapter interface is defined but implementation is blocked.
2. **Truth enforcement on a generative voice model.** Even with forced tool use (`tool_choice: "required"`), the realtime model generates the final spoken answer in natural language and can misrepresent, overstate, or blend tool data with parametric knowledge. There is no `strict: true` equivalent for the final spoken output. The primary defenses are system prompt constraints, eval-suite verification, and server-side audit logging. If misrepresentation rates are unacceptable, the fallback is a dual-path architecture where factual turns route through a text model with stricter output control.
3. **Prompt injection via untrusted data.** GitHub issues, PR comments, and API responses can contain adversarial content. All external data must be treated as untrusted and pass through structured extraction before influencing behavior (see Trust Boundary Contract, section 3.3). This becomes critical if write actions are ever enabled.
4. **Cost management.** OpenAI Realtime costs ~$0.18/min. A 30-minute demo costs ~$5.40. Forgotten sessions are expensive. Implement timeouts and cost tracking from day one.

---

## 22. Source Notes

- Original requirements brief: `docs/requirements.md` (Frontier Audio)
- Technology research: `docs/research.md`, `docs/research-providers.md`
- OpenAI Realtime API is GA; older beta surfaces retiring 2026-05-07.
- `gpt-realtime-mini` is purpose-built for realtime audio interaction.
- GPT-5.4 mini is text/image only, no native audio -- use as backend reasoner, not voice model.
- LiveKit Agents has a current Node.js SDK and remains a credible scaling/portability path.
- OpenAI Realtime docs explicitly recommend WebRTC over WebSocket for browser/mobile clients: "WebRTC will be a more robust solution in most cases."
- OpenAI Realtime interruption in WebSocket mode requires `response.cancel` + `conversation.item.truncate` with playback cursor position to maintain context coherence.
- OpenAI docs note that Realtime input audio transcription is "guidance" not a precise record -- do not build memory directly on ASR transcripts.
