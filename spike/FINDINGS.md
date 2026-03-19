# M0 Spike Findings: Transport Architecture Decision

**Date:** 2026-03-18
**Status:** Template — fill in after testing

---

## Recommendation

**Transport for M1+:** _TBD — relay WS / WebRTC / hybrid_

**Rationale:** _TBD_

---

## Latency Measurements

### Relay (WebSocket)

| Turn | Type | E2E Latency (ms) | Time to First Playback (ms) | Tool Round-Trip (ms) | Interruption (ms) |
|------|------|-------------------|-----------------------------|-----------------------|--------------------|
| 1    | Conversational | 1328 | — | — | — |
| 2    | Conversational | 1393 | — | — | — |
| 3    | Conversational | 2138 | — | — | — |
| 4    | Conversational | 1190 | — | — | — |
| 5    | Conversational | 2434 | — | — | — |

Note: Turns 1-5 were conversational only (no tool calls or interruption test yet). Interruption was attempted but response had already finished — byte counter bug caused `audio_end_ms` to exceed actual audio length. Bug fixed; needs retest for tool calls and interruption.

### WebRTC

| Turn | Type | E2E Latency (ms) | Time to First Playback (ms) | Tool Round-Trip (ms) | Interruption (ms) |
|------|------|-------------------|-----------------------------|-----------------------|--------------------|
| 1    | Conversational | — | — | — | — |
| 2    | Conversational | — | — | — | — |
| 3    | Conversational | — | — | — | — |
| 4    | Conversational | — | — | — | — |
| 5    | Conversational | — | — | — | — |

Note: WebRTC conversational turns all working. No E2E latency metrics logged — the audio arrives via RTC track so the commit→first-audio-delta metric doesn't capture time-to-playback accurately in WebRTC mode. Needs retest with tool calls and interruption.

---

## Push-to-Talk

**Relay approach:** _What worked_

**WebRTC approach:** _Which option (A/B/C) worked and why_

---

## Interruption + Truncation

**Did the coherence test pass?**

_Description of test: asked long question, interrupted after ~2s, asked "What was the last thing you said?"_

**Relay result:** _Pass/Fail + details_

**WebRTC result:** _Pass/Fail + details_

---

## Surprises and Difficulties

- _TBD_

---

## Dealbreakers

- _TBD_

---

## Raw Notes

_Paste log area contents and observations here during testing._
