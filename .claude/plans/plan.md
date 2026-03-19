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
