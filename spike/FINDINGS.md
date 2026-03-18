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
| 1    | Conversational |  |  |  |  |
| 2    | Conversational |  |  |  |  |
| 3    | Tool call      |  |  |  |  |
| 4    | Tool call      |  |  |  |  |
| 5    | Interruption   |  |  |  |  |

### WebRTC

| Turn | Type | E2E Latency (ms) | Time to First Playback (ms) | Tool Round-Trip (ms) | Interruption (ms) |
|------|------|-------------------|-----------------------------|-----------------------|--------------------|
| 1    | Conversational |  |  |  |  |
| 2    | Conversational |  |  |  |  |
| 3    | Tool call      |  |  |  |  |
| 4    | Tool call      |  |  |  |  |
| 5    | Interruption   |  |  |  |  |

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
