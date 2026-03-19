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
