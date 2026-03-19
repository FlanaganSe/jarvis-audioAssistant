# Decisions

Append-only log. Never edit past entries.

## Format
```
### ADR-NNN: [Title]
**Date:** YYYY-MM-DD
**Status:** accepted | superseded by ADR-NNN
**Context:** [Why — 1-2 sentences]
**Decision:** [What — 1-2 sentences]
**Consequences:** [What follows]
```

---

<!-- Add new decisions below this line -->

### ADR-001: WebSocket relay for browser audio transport
**Date:** 2026-03-18
**Status:** accepted
**Context:** M0 spike benchmarked WebSocket relay vs client WebRTC + server sideband. Both worked. Relay E2E latency (1190-2434ms) is within the PRD target of <=2s p95. Transport accounts for <5% of total voice-to-voice latency.
**Decision:** Use WebSocket relay (client-WS-Fastify-WS-OpenAI) for the MVP. WebRTC + sideband is a documented migration path.
**Consequences:** Server is in the media path (adds ~50-100ms). Simpler to debug, deploy, and observe. Audio format is PCM16 throughout (no Opus transcoding needed for MVP).

### ADR-002: PCM16 audio format throughout for MVP
**Date:** 2026-03-18
**Status:** accepted
**Context:** The stack originally specified Opus client↔server and PCM16 server↔OpenAI. M0 spike used PCM16 end-to-end successfully. Opus adds encoding/decoding complexity without meaningful benefit for a demo on LAN/localhost.
**Decision:** Use PCM16 24kHz mono throughout the relay path for MVP. Add Opus client↔server encoding as a later bandwidth optimization if needed.
**Consequences:** Simpler audio pipeline. Higher bandwidth usage (~384 kbps vs ~32 kbps with Opus). Acceptable for demo conditions.

### ADR-003: OpenWeatherMap as external API for MVP
**Date:** 2026-03-18
**Status:** accepted
**Context:** The requirements specified "a provided API (spec will be shared)" but no spec was provided. Team was told any API could be used. OpenWeatherMap was chosen for demo impact: always-changing data, precise verifiable numbers, free tier, fits frontline operator narrative.
**Decision:** Use OpenWeatherMap for the external API integration. The adapter pattern supports swapping to a different API later.
**Consequences:** Free tier (60 calls/min) is sufficient for demo. Demonstrates freshness contract clearly. "Weather at the job site" is a natural frontline question.

### ADR-004: Tool-first architecture for zero-hallucination guarantee
**Date:** 2026-03-18
**Status:** accepted
**Context:** The PRD requires "completely accurate responses with no fabrications." LLMs hallucinate by default. The system must structurally prevent the model from fabricating operational facts.
**Decision:** All factual claims must be backed by a tool call with evidence metadata (source, fetchedAt, freshnessSec, citationRef). The system prompt forbids answering operational questions without a tool result. The model must refuse rather than guess.
**Consequences:** Every tool returns structured evidence. The UI renders evidence cards. Answers are verifiably grounded. Adds latency for tool execution but ensures accuracy.

### ADR-005: Push-to-talk state machine with manual turn management
**Date:** 2026-03-18
**Status:** accepted
**Context:** OpenAI Realtime API supports server VAD for automatic turn detection, but noisy frontline environments cause false triggers. Push-to-talk gives the user explicit control over when they're speaking.
**Decision:** Disable server VAD (`turn_detection: null`). Client manages audio capture via push-to-talk button. Audio is buffered and committed explicitly. Sub-100ms presses are discarded as accidental.
**Consequences:** No false interruptions from background noise. User must actively hold the button. Interruption is still supported — pressing during assistant speech cancels the response.

### ADR-006: Session summaries with pgvector for cross-session memory
**Date:** 2026-03-18
**Status:** accepted
**Context:** Users need to recall past conversations ("what did we discuss yesterday?"). Storing raw transcripts is expensive and low-signal. The system needs both keyword and semantic search across sessions.
**Decision:** Generate structured summaries (topics, entities, key facts, unresolved items) at session end using GPT-4o-mini. Store summaries with text-embedding-3-small vectors in pgvector. Memory recall uses keyword matching first, falling back to vector similarity search.
**Consequences:** Compact storage. Fast recall. Summaries are generated async on session close so they don't impact voice latency. Vector search requires pgvector extension.

### ADR-007: Custom JWT auth over third-party auth provider
**Date:** 2026-03-18
**Status:** accepted
**Context:** Voice-first interface has no login screen. Pre-built auth UI components (Clerk, Auth0) are irrelevant. WebSocket auth requires a token-based approach.
**Decision:** Use `jose` for JWT signing/verification. Token is passed as a query parameter on WebSocket upgrade. User identity is persisted in localStorage on the client.
**Consequences:** Simple, no vendor dependency. Sufficient for demo. Production would need proper identity verification (OAuth, SSO) and token refresh.
