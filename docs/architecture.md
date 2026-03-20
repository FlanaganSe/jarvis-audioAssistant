# Architecture

## Purpose

Jarvis is a tool-grounded voice assistant for operational questions. The architecture optimizes for three things:

- low-latency voice interaction
- visible trust and evidence
- flexibility for later write actions, mobile clients, and stronger auth

## Runtime Shape

```text
Browser client
  -> WebSocket relay on Fastify
  -> OpenAI Realtime API
  -> Tool execution on the server
  -> PostgreSQL (+ pgvector) and optional Redis
```

The client captures PCM16 audio, the server relays it to OpenAI, and all factual tool calls stay server-side. The model never gets direct access to secrets or external APIs.

## Package Boundaries

### `shared`

- WebSocket message types
- Evidence type
- Audio and session constants

### `server`

- Fastify routes and relay lifecycle
- JWT signing and verification
- Tool registry and tool implementations
- PostgreSQL persistence and session summaries
- Optional Redis cache and weather poller

### `client`

- Push-to-talk interaction state
- Audio capture and playback
- Transcript, evidence, proposal, and session UI

## Trust Boundaries

### Operational facts come from tools

Jarvis should not invent repo state, weather values, or memory recall. The server enforces that pattern structurally:

- tool calls execute server-side
- tool responses carry evidence metadata
- the UI renders source and freshness
- the model is expected to refuse when evidence is missing

### Proposal flow stays read-only

Jarvis can draft a fix plan, PR outline, or comment draft. It cannot mutate GitHub. That boundary is part of the product shape, not missing implementation.

### Companion HTTP routes are demo-scoped

The UI now uses bearer tokens for recent sessions and preferences, which is better aligned with the WebSocket session posture. This is still anonymous demo auth, not production identity.

## Session Lifecycle

1. Client registers or reuses a demo user.
2. Client exchanges that identity for a JWT.
3. Client opens `/ws/relay?token=...`.
4. Server verifies the token, creates a DB session, then opens the OpenAI Realtime WebSocket.
5. Client sends audio chunks until commit.
6. Model responds directly or calls tools through the registry.
7. Messages are persisted and a session summary is queued on close.

## Reliability Notes

- Redis is optional. Weather falls back to direct fetches when cache operations fail.
- Shutdown now waits briefly for in-flight session summary jobs before disconnecting storage.
- The relay preserves both beta and GA-style Realtime event names where useful, which matches current OpenAI migration guidance.

## Deployment

The client uses same-origin `/api` and `/ws` paths. In production, Railway serves everything from a single service — no reverse proxy or origin configuration needed. See `docs/DEPLOYMENT.md` for the full deployment guide.
