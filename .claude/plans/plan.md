# Jarvis Audio Assistant — Build Plan

## Milestones

- [x] M0: Spike — prove voice loop, decide transport architecture
  - [x] Step 1 — Project scaffolding (package.json, tsconfig, .env.example) → verify: `cd spike && pnpm install`
  - [x] Step 2 — GitHub tool + shared constants → verify: `cd spike && pnpm tsx src/github-tool.ts`
  - [x] Step 3 — Fastify server + static serving + WebSocket relay → verify: `cd spike && pnpm dev` starts without crash
  - [x] Step 4 — WebRTC SDP exchange endpoint + tool-forwarding WS → verify: server starts with both routes
  - [x] Step 5 — Browser client (HTML: push-to-talk, mode toggle, log area, audio handling, interruption) → verify: page loads at localhost:3000
  Commit: "feat: M0 spike — dual-transport voice loop with tool calling"

- [x] M1: Trustworthy Voice Loop — clean-room build of the real application
  - [x] CP1: Project scaffold — pnpm workspace, TS, Biome, Fastify, Vite, health check
  - [x] CP2: Voice loop — audio capture, relay, playback, push-to-talk state machine
  - [x] CP3: Interruption — response.cancel + conversation.item.truncate protocol
  - [x] CP4: Companion UI — StatusBar, PushToTalkButton, Transcript, SessionControls
  - [x] CP5: Auth, session management, idle timeout — JWT, session map, 10-min timeout
  Commit: "feat: M1 — trustworthy voice loop with companion UI and auth"

- [x] M2: Grounded Operational Answers — tools, evidence, persistence
  - [x] CP1: Database + Redis infrastructure (Drizzle, ioredis, schema, cache service)
  - [x] CP2: Tool infrastructure in relay (tool registry, shared types, relay handler)
  - [x] CP3: GitHub integration (5 Octokit tools, system prompt, registration)
  - [x] CP4: Weather integration + freshness enforcement (OpenWeatherMap, Redis cache, poller)
  - [x] CP5: Evidence UI + refusal behavior (EvidenceCard, ToolCallIndicator, client types)
  - [x] CP6: Persistence, session summaries, idle timeout (saveMessage, summary, idle wiring)
  Commit: "feat: M2 — grounded operational answers with tools, evidence, and persistence"

- [x] M3: Memory, Self-Awareness, Preferences, and Demo-Ready Polish
  - [x] CP1: User Identity — ToolContext, register route, userId in JWT, client localStorage
  - [x] CP2: User Preferences — 3 tools, REST endpoints, preferences panel, system prompt injection
  - [x] CP3: Cross-Session Memory Recall — memory_recall tool, keyword + pgvector
  - [x] CP4: Capability Self-Awareness — jarvis_capabilities tool
  - [x] CP5: UX Polish — design system, dark theme, component restyling, InfoDrawer
  - [x] CP6: System Prompt Consolidation + typecheck/lint verification
  Commit: "feat: M3 — memory, self-awareness, preferences, and demo-ready polish"

- [x] M4: Showcase Layer — Demo-Ready Features and Final Polish
  - [x] CP1: Repo Briefing — github_repo_briefing tool, register, update system prompt → verify: `pnpm typecheck`
  - [x] CP2: What Changed — github_repo_changes tool (session memory + GitHub temporal queries) → verify: `pnpm typecheck`
  - [x] CP3: Action Proposals — github_propose_action tool, proposal ServerMessage, ProposalCard UI, relay dispatch → verify: `pnpm typecheck`
  - [x] CP4: Audio Level Visualization — worklet RMS level, useAudioCapture level state, PushToTalkButton animation → verify: `pnpm typecheck`
  - [x] CP5: Final Demo Polish — capabilities update, system prompt consolidation, seed script, lint/typecheck → verify: `pnpm ci`
  Commit: "feat: M4 — showcase layer with repo briefing, proposals, audio viz, and demo polish"
