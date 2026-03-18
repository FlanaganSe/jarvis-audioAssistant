# Jarvis Audio Assistant PRD (Codex 5.3)

**Status:** Draft for stakeholder review  
**Date:** 2026-03-18  
**Primary Inputs:** `docs/requirements.md`, `docs/research.md`  
**Product Type:** Voice-first operational assistant demo (high quality, non-production)

## 1. Product Intent

Jarvis is a real-time voice assistant for frontline workers who need accurate operational answers under time pressure. The product must feel fast, natural, and trustworthy, while being explicitly designed to avoid hallucinated operational facts.

This PRD intentionally balances three outcomes:
1. A compelling stakeholder demo experience.
2. Engineering quality consistent with modern best practices.
3. Flexibility to change architecture or providers without large rewrites.

## 2. Core Product Principles

1. **Trust over fluency:** Jarvis must refuse when evidence is missing instead of guessing.
2. **Fast conversational feel:** User should hear progress cues quickly and never sit in unexplained silence.
3. **Tool-first facts:** API and GitHub answers come from fresh tool results, not model memory.
4. **Interruption is first-class:** Users can stop Jarvis instantly.
5. **Bounded autonomy:** Read actions are default; write actions require explicit approval.
6. **Composable architecture:** Voice, model, and tool layers must be swappable.

## 3. Users and Jobs-To-Be-Done

### Primary User: Frontline Operator
- Needs instant status answers while hands are busy.
- Needs confidence that answers are current and accurate.
- Needs to interrupt and redirect quickly.

### Secondary User: Team Lead / Supervisor
- Needs reliable summaries of open issues, PR activity, and recent changes.
- Needs history recall across sessions for continuity.

### Tertiary User: Stakeholder / Evaluator
- Needs to see a differentiated, polished, demo-worthy experience.
- Needs evidence that design can scale safely later.

## 4. Goals, Non-Goals, and Success Metrics

### Goals (MVP Demo)
1. Deliver low-latency natural voice interaction with reliable interruption handling.
2. Guarantee latest-data behavior for API-backed answers (3-minute freshness SLA).
3. Support public GitHub repo Q&A from arbitrary URLs (read-only).
4. Persist useful cross-session memory and recall prior context on request.
5. Expose clear capability self-awareness ("what can/can't I do").
6. Provide citations/timestamps for operational claims.

### Non-Goals (MVP Demo)
1. Fully autonomous repo mutations without human approval.
2. Full passive wake-word mode as the default interaction.
3. Offline-first voice intelligence.
4. Native iOS/Android production hardening.
5. Enterprise compliance certification readiness.

### Success Metrics
1. **First assistant audio latency:** median <= 700ms, p95 <= 1000ms.
2. **Interruption halt latency:** <= 150ms from detected user speech.
3. **Operational grounding rate:** 100% of API/GitHub factual answers include evidence and freshness metadata.
4. **Freshness violations:** 0 responses using stale API data (>180s effective age) in eval suite.
5. **Refusal correctness:** >= 95% correct abstentions on missing/stale evidence cases.
6. **Demo quality score:** >= 8/10 mean stakeholder rating for usefulness + trust + UX smoothness.

## 5. Product Scope

### In Scope for MVP
1. Push-to-talk voice interface (web first).
2. Real-time conversational loop with audible progress acknowledgements.
3. Barge-in interruption and fast playback stop.
4. Session memory and cross-session recall for prior Q&A.
5. Public GitHub URL ingestion and repository Q&A (PRs, issues, recent merges, comments).
6. API question answering with strict latest-data enforcement.
7. Capability introspection response grounded in runtime capability registry.
8. Citation and freshness display in companion UI/log for operational answers.
9. Observability for latency, tool usage, refusals, and cost.

### Out of Scope for MVP (Deferred)
1. Background passive listening default.
2. GitHub write actions without explicit approval workflows.
3. Full multi-tenant hardening for >10 concurrent active users.
4. Complex autonomous issue-fix-PR end-to-end execution.
5. Deep mobile platform optimization.

## 6. Experience Requirements

### UX-1: Natural Cadence with Progress Transparency
If a response/tool call takes more than 300-500ms, Jarvis emits an acknowledgement cue or short verbal status so silence is never ambiguous.

### UX-2: Interruption Control
When user says a stop phrase (for example, "Quiet, Jarvis"), audio playback halts immediately and Jarvis returns to listening state.

### UX-3: Memory Recall
Jarvis can recall prior session context with clear framing and timestamped references when available.

### UX-4: Capability Self-Awareness
Jarvis can describe available integrations, permission boundaries, and current limitations in plain language.

### UX-5: Refusal Quality
For unsupported, stale, or permission-blocked requests, Jarvis responds with concise abstention and next-step guidance.

## 7. Functional Requirements and Acceptance Criteria

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-VOICE-01 | Real-time voice interaction | User can complete uninterrupted back-and-forth turns with target latency metrics. |
| FR-VOICE-02 | Audible progress cues | If processing delay exceeds threshold, user receives cue within 500ms. |
| FR-VOICE-03 | Interruption handling | Playback stops <=150ms after interruption detection in >=95% test turns. |
| FR-MEM-01 | Session memory | Jarvis references recent turn context in same session reliably. |
| FR-MEM-02 | Cross-session recall | Jarvis returns prior answered topic summary when asked about "yesterday" style prompts. |
| FR-GH-01 | Public repo ingestion | User provides any public GitHub URL and receives current repo answers with citations. |
| FR-GH-02 | Repo insights | Jarvis can answer open PRs, issues, PR comments, and recent merges. |
| FR-API-01 | Latest-data-only responses | API answers are blocked unless evidence freshness <=180s effective age. |
| FR-API-02 | Stale-data refusal | If refresh fails or stale, Jarvis refuses and reports data unavailable. |
| FR-SAFE-01 | No fabricated operational facts | For API/GitHub factual turns, tool call evidence is mandatory or response must abstain. |
| FR-SAFE-02 | Capability registry responses | "What can you do?" answers are generated from live capability state, not static prompt text. |
| FR-ACT-01 | Action safety boundary | Mutative actions are disabled by default in MVP or require explicit approval gate. |
| FR-OBS-01 | Tracing and metrics | Every turn logs latency, tool calls, refusal reason, and model cost. |
| FR-UI-01 | Companion screen | UI shows transcript, evidence citations, freshness timestamp, and pending approvals state. |

## 8. Proposed Product and Technical Design

### 8.1 Interaction Model
1. User push-to-talk starts capture.
2. Voice turn is processed in conversational mode by default.
3. Policy router checks intent.
4. If query is operational (API/GitHub/live numeric fact), system enters deterministic tool-first mode.
5. Evidence is validated for freshness and scope.
6. Response is generated with citation references or explicit refusal.

### 8.2 Architecture Direction

MVP architecture should use OpenAI Realtime for speed and UX quality, with a strict backend control plane that owns policy, tools, memory, and gating.

Core backend components:
1. **Gateway:** auth, session issuance, rate limiting.
2. **Policy router:** determines conversational vs deterministic path.
3. **Tool gateway:** GitHub + external API adapters with strict schema validation.
4. **Memory service:** L0/L1/L2 memory stack (in-memory + Redis + PostgreSQL/pgvector).
5. **Workflow engine:** approval-gated durable tasks for deferred write actions.
6. **Observability:** OpenTelemetry + LLM quality/cost analytics.

### 8.3 Flexibility-by-Design Requirements
1. Voice provider abstraction layer must allow migration from OpenAI Realtime to LiveKit/component pipeline.
2. Tool contracts are schema-first and independent of model provider.
3. Model router supports role-based model substitution without API-surface rewrites.
4. Data freshness and refusal policy are centralized and provider-agnostic.

## 9. Data and Policy Requirements

### 9.1 Freshness Policy (Non-Negotiable)
For API-backed facts:
- Compute effective age from fetch timestamp and headers.
- Allow response only if effective age <= 180 seconds.
- Force refresh otherwise.
- If refresh fails, return "data unavailable right now" style refusal.

### 9.2 Evidence Model
Each operational answer must link to normalized evidence objects:
- `source`
- `entity`
- `fetched_at`
- `freshness_s`
- `citation_ref`

### 9.3 Hallucination Policy Interpretation
Requirement says "zero hallucinations." In implementation terms for MVP: **zero unsourced operational claims**. This is measured through tool-evidence enforcement, stale-data blocking, and abstention testing.

## 10. Roadmap and Milestones

### Milestone 0: Spike and De-Risk
1. Prove low-latency loop and interruption behavior.
2. Prove deterministic tool-first path for API/GitHub turns.
3. Validate eval harness and latency instrumentation.

### Milestone 1: MVP Demo Build
1. Push-to-talk web client + companion view.
2. Operational Q&A with citations/freshness.
3. Memory recall and capability self-awareness.
4. Observability dashboard for trust metrics.

### Milestone 2: Hardening
1. Better memory distillation (L3 summaries).
2. GitHub connected workspace mode planning.
3. Cost controls, retry controls, and release gating evals.

### Milestone 3: Expansion (Optional for Demo+)
1. Mobile channel.
2. Controlled passive mode experiments.
3. Approval-based GitHub write workflow pilots.

## 11. Test and Evaluation Plan

1. Voice latency and interruption suite across quiet/noisy recordings.
2. Stale-data refusal suite for API freshness policy.
3. GitHub factual correctness suite for repo metadata and status queries.
4. Memory precision suite for within-session and cross-session recall.
5. Safety suite for unsupported capabilities and write-action boundary escapes.
6. Load suite for concurrent sessions and cost spike detection.

Release gate for demo:
1. No critical failures in stale-data refusal or factual grounding suites.
2. Latency and interruption targets met in representative test environment.
3. Traceability present for all demo turns.

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Noise reduces transcription accuracy | High | Push-to-talk default, test dataset with realistic noise, optional noise suppression tuning. |
| Cost spikes from long idle sessions | High | Silence timeout, per-session limits, billing alerts, aggressive prompt caching. |
| False trust from fluent but unsupported answers | Critical | Mandatory evidence gates, refusal policy, eval-based release gating. |
| Vendor churn or provider lock-in | Medium | Adapter-based architecture and model/provider abstraction boundaries. |
| Identity ambiguity on shared devices | Medium | Explicit session auth model, user-bound memory records. |
| Scope creep into production-grade features | Medium | Strict MVP/non-MVP boundaries and milestone exit criteria. |

## 13. Absolutely Pivotal Decisions Required

These decisions are the minimum set needed to avoid churn and over-engineering.

1. **MVP voice runtime choice:** OpenAI Realtime now, or LiveKit now?  
Recommendation: OpenAI Realtime for MVP speed and demo quality; keep LiveKit as planned migration path.

2. **First delivery channel:** Web-only MVP, or web + mobile together?  
Recommendation: Web-only MVP for timeline control; design APIs/session model for mobile follow-on.

3. **Definition of zero hallucinations:** literal absolute vs enforceable operational definition?  
Recommendation: Formally adopt "zero unsourced operational claims" with hard evidence/refusal gates.

4. **GitHub MVP boundary:** read-only vs early write actions?  
Recommendation: Read-only for MVP; approval-gated write flow only after trust metrics pass.

5. **Memory strategy for MVP:** custom structured memory + pgvector vs external memory framework now?  
Recommendation: Custom structured memory first; revisit Zep/Mem0 after baseline telemetry.

6. **Multi-user isolation timing:** implement user isolation in MVP or postpone?  
Recommendation: Add user-bound records at MVP start to prevent later migration risk.

7. **Deployment platform now:** Cloud Run vs Fly.io (or equivalent) for backend control plane?  
Recommendation: Choose one managed container platform now and defer multi-region tuning until measured need.

## 14. Final Notes for Stakeholder Alignment

This PRD intentionally optimizes for a high-confidence, high-impact demo that looks advanced without committing prematurely to expensive or brittle architecture. The plan is to ship a trustworthy and impressive core loop first, then layer in autonomy and channels behind explicit reliability gates.
