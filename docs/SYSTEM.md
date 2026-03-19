# System

## What this system does

Jarvis is a real-time voice assistant for frontline workers. Users speak into a push-to-talk button; Jarvis answers using live data from GitHub repos, weather APIs, and conversation memory. It is built as a demo showcasing tool-grounded voice AI with zero fabrication.

## Domain model

- **Session** — one WebSocket connection lifetime. Has turns, a DB record, and generates a summary on close.
- **Turn** — one user utterance + one assistant response. Audio flows as PCM16 24kHz chunks.
- **Tool** — a registered function the model can call. Returns `{ output, evidence }`. Evidence tracks source, freshness, citation.
- **Preference** — a standing instruction from the user (e.g., "always flag security issues"). Stored as a string array on the user record, injected into the system prompt.
- **Proposal** — a structured action plan (fix plan, PR outline, comment draft) that requires user approval before execution.

## Architecture

Browser → WebSocket → Fastify server → WebSocket → OpenAI Realtime API.
The server is in the media path (relay pattern). Tool calls are executed server-side with full DB/API access. Results flow back through the relay to the model, which speaks the answer.

Data flows: PostgreSQL (users, sessions, messages, summaries) + Redis (weather cache, session state).

## Constraints

- **Zero fabrication**: every operational fact must come from a tool result or the system refuses. (ADR-004)
- **3-minute freshness**: API data older than 180s must be refreshed before answering. (Immutable rule #2)
- **No secrets in code**: all credentials via environment variables. (Immutable rule #3)
- **Push-to-talk only**: no server VAD; client controls turn boundaries. (ADR-005)

## Key patterns

- **Tool registry**: tools self-register with name, description, JSON schema, and execute function. The registry generates OpenAI tool definitions and dispatches calls.
- **Evidence threading**: every tool result carries `Evidence` metadata. The relay forwards it to the client for rendering. Persistence stores it alongside messages.
- **Session lifecycle**: connect → auth (JWT) → createRelaySession → turns → close → async summary generation.

## Gotchas

- `dbSessionId` is initialized as `""` (falsy) and assigned async after session creation. Code checks `if (!session.dbSessionId)` to skip persistence during the race window.
- The OpenAI Realtime API has two coexisting event schemas (beta vs GA). The relay handles both event name patterns (e.g., `response.audio.delta` and `response.output_audio.delta`).
- Weather poller runs on a 3-minute interval independently of requests. Tools read from Redis cache, not the API directly.
