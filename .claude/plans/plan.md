# Jarvis Audio Assistant — Build Plan

## Milestones

- [x] M0: Spike — prove voice loop, decide transport architecture
  - [x] Step 1 — Project scaffolding (package.json, tsconfig, .env.example) → verify: `cd spike && pnpm install`
  - [x] Step 2 — GitHub tool + shared constants → verify: `cd spike && pnpm tsx src/github-tool.ts`
  - [x] Step 3 — Fastify server + static serving + WebSocket relay → verify: `cd spike && pnpm dev` starts without crash
  - [x] Step 4 — WebRTC SDP exchange endpoint + tool-forwarding WS → verify: server starts with both routes
  - [x] Step 5 — Browser client (HTML: push-to-talk, mode toggle, log area, audio handling, interruption) → verify: page loads at localhost:3000
  Commit: "feat: M0 spike — dual-transport voice loop with tool calling"
