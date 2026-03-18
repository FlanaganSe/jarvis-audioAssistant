# Jarvis Audio Assistant — Research Synthesis

**Date:** 2026-03-18
**Status:** Complete
**Scope:** Product shape, architecture, technology decisions, competitive landscape, risks, and build sequence for a real-time voice assistant for frontline workers.

---

## 1. Executive Summary

### What We're Building

A real-time voice assistant ("Jarvis") for frontline workers — an **operational voice copilot**, not a general chatbot. The product shape is dominated by: low latency, interruption handling, latest-data-only answers, GitHub and external API grounding, cross-session memory, and eventual end-to-end agent actions (analyze issues, open PRs).

### The Key Architectural Insight

"Zero hallucinations" is a **systems-design problem**, not a model-selection problem. Jarvis only gets close to that standard if the system removes the model's ability to invent operational facts and forces it to answer from fresh evidence or refuse. This means: tool-first for all operational facts, strict freshness gates (3-minute SLA), explicit refusals when evidence is missing, and approval boundaries on write actions.

Natural conversation cadence and zero hallucinations are in tension. Natural cadence pushes toward speech-to-speech. Zero hallucinations pushes toward tool-first, evidence-gated answering. The architecture resolves this with **dual modes**: a fast conversational mode for ordinary interaction, and a stricter deterministic mode for turns involving live operational facts or write actions.

### Recommended Stack (One-Liner)

TypeScript control plane; Fastify; OpenAI Realtime API (MVP) with LiveKit Agents as fallback/scaling path; Deepgram Nova-3 STT; Cartesia Sonic TTS; PostgreSQL + pgvector; Redis; Temporal for durable workflows; OpenTelemetry + Langfuse; push-to-talk first.

### The Landscape (March 2026)

The voice AI market is mature but fragmented. No single platform dominates. The closest competitors — VoiceLine (CRM data capture) and aiOla (workflow automation) — focus on structured data capture, not interactive conversational Q&A. This leaves clear differentiation space.

- Voice AI market: $18.4B (2025) → $61.7B projected by 2031 (22.4% CAGR)
- 80% of businesses plan voice AI integration by 2026
- Frontline voice AI seeing 10x YoY growth

---

## 2. Product Shape

### What Jarvis Should Be

Jarvis should be designed as a voice-first operational assistant with five core product behaviors:

1. It responds quickly and naturally
2. It audibly acknowledges work that takes time (never silent during processing)
3. It knows when it must fetch fresh evidence
4. It refuses unsupported claims cleanly ("I don't have that information right now")
5. It can take actions only through explicit approval boundaries

The right mental model: not "Jarvis knows everything" but "Jarvis can listen, fetch, explain, summarize, and act safely inside a bounded operational surface."

### Competitive Positioning

| Competitor | Their Focus | Jarvis Differentiator |
|-----------|------------|----------------------|
| **VoiceLine** | CRM data capture for field sales (Series A €10M, 10x YoY) | Interactive Q&A, GitHub integration, developer tools |
| **aiOla** | Workflow automation for industrial workers (95%+ accuracy in noise) | Conversational memory, API queries, not just workflow triggers |
| **Vapi/Retell/Bland** | Phone call automation ($0.13-$0.31/min) | Hands-free persistent assistant, not call-by-call |
| **Alexa/Copilot** | General-purpose consumer/enterprise | Domain-specific, zero-hallucination guarantee |
| **Abridge/Suki** | Healthcare ambient AI | Strategic analog — shows trust comes from deep workflow integration + verifiability |

### Key Product Decisions

1. **Push-to-talk first, not passive mode.** Passive mode adds wake-word complexity, iOS background limitations, noise false positives, and privacy risk. Push-to-talk performs better in noisy frontline environments and makes latency easier to reason about.

2. **Read operations first; write actions behind approvals.** Opening PRs, mutating issues, or writing to external APIs should sit behind explicit human approval until the system has earned trust.

3. **GitHub has two distinct modes.** (a) Cold read: answer about arbitrary public repo URLs on demand. (b) Connected workspace: installed repos with webhooks, stronger permissions, eventually write actions. These are different capabilities requiring different architectures.

4. **Jarvis must never answer an operational question without a live tool call.** For the live API and GitHub state, the orchestration logic should explicitly forbid model-prior answers and require either a tool result or a clear abstention.

5. **Capability self-awareness should be a registry, not just prompt copy.** Jarvis should know which tools it has, which scopes are enabled, when data was last refreshed, and which actions require approval.

---

## 3. Architecture

### 3.1 Two Viable Paths

#### Path A: OpenAI Realtime API (Fastest MVP, Best Latency)

```
User Device (web/mobile, push-to-talk)
  → App Gateway (auth, session token, rate limits)
  → OpenAI Realtime over WebRTC

Trusted Backend Control Plane (server WebSocket sideband)
  → Policy router → Capability registry
  → Tool gateway (GitHub, API adapters)
  → Memory service (PostgreSQL + Redis)
  → Workflow service (Temporal)
  → Observability pipeline (OpenTelemetry + Langfuse)
```

- **Latency:** ~250-300ms voice-to-voice
- **Cost:** ~$0.18/min with gpt-realtime-mini (~$540/mo at 10 users, 10 min/day)
- **Pros:** Simplest architecture, built-in semantic VAD + interruption + function calling, best natural cadence
- **Cons:** Vendor lock-in, higher cost, no intermediate text for compliance logging

#### Path B: LiveKit Agents + Component Stack (Best Long-Term, Cheapest)

```
[Client] ←WebRTC→ [LiveKit SFU] ←WebRTC→ [Jarvis Agent (Node.js/TypeScript)]
                                                |
                                      [AgentSession Pipeline]
                                       VAD: Silero
                                       STT: Deepgram Nova-3 (<300ms, $0.0077/min)
                                       LLM: GPT-5-mini or GPT-5.4 mini
                                       TTS: Cartesia Sonic Turbo (40ms TTFB)
                                                |
                                      [Tools: GitHub, API, Memory]
                                      [PostgreSQL + pgvector] [Redis]
```

- **Latency:** ~500-800ms voice-to-voice
- **Cost:** ~$0.04/min (~$120/mo at 10 users, 10 min/day) — 4.5x cheaper
- **Pros:** Full control, provider flexibility, TypeScript end-to-end, multi-user scaling built in, Apache 2.0
- **Cons:** More complex, must rely on framework's turn detection, Node.js SDK is ~7 months old

### 3.2 Recommendation

**Start with OpenAI Realtime API for MVP speed.** Design the architecture to be swappable so the pipeline can migrate to LiveKit + components as usage scales and costs become a concern.

The **dual-path** design is the most important architectural answer:
- **Default:** Native speech-to-speech (OpenAI Realtime) for natural conversational flow
- **Safety fallback:** Policy-triggered cascade (STT → tool-first LLM → TTS) for turns requiring strict determinism — live external facts, numeric readbacks, GitHub state, API-backed answers, approval for mutations

If OpenAI Realtime proves too expensive at scale or too constraining, **LiveKit Agents** is the strongest fallback — first-class Node.js/TypeScript SDK, Zod-based tools, semantic turn detection, WebRTC, production-proven (Tesla, Salesforce, healthcare, 911 triage), Apache 2.0.

### 3.3 Key Design Principles

1. **Tool-first for operational facts.** Set `tool_choice: "required"` for factual turns. Use `strict: true` function schemas.
2. **Push-to-talk first.** Passive/wake-word mode is a separate track, not MVP.
3. **Audible progress feedback.** If work takes >300-500ms, play acknowledgement. Never unexplained silence.
4. **Interruption is first-class.** Track time-to-halt, false interruption rate, recovery time.
5. **Screen companion UI.** Even voice-first needs a light UI for citations, pending approvals, timestamps, history.

---

## 4. Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js 22 | Ecosystem maturity, debugging tools; LLM latency dominates, not framework |
| **Framework** | Fastify | 3-5x faster than Express, plugin ecosystem, TypeScript-first |
| **Voice (MVP)** | OpenAI Realtime API | Fastest path to natural conversation with tools |
| **Voice (Scale)** | LiveKit Agents (Node.js) | Full TS SDK, semantic turn detection, WebRTC, Apache 2.0 |
| **STT (pipeline)** | Deepgram Nova-3 | <300ms, 5.26% WER, $0.0077/min, $200 free credit |
| **TTS (pipeline)** | Cartesia Sonic Turbo | 40ms TTFB, $0.011/1K chars — 27x cheaper than ElevenLabs |
| **VAD** | Silero VAD | 87.7% TPR vs WebRTC's 50%; 1.8MB model, ~1ms per 30ms chunk |
| **LLM (voice)** | GPT-5-mini / GPT-5.4 mini | Fast TTFT, 45% fewer hallucinations than GPT-4o |
| **LLM (complex)** | GPT-5 / GPT-5.4 | Multi-step analysis, PR creation, issue diagnosis |
| **LLM (routing)** | GPT-4.1 Nano | Ultra-fast intent detection, $0.10/1M input |
| **Embeddings** | OpenAI text-embedding-3-small | 1536-dim vectors for pgvector |
| **ORM** | Drizzle | Native pgvector, SQL-like API, 5KB bundle, TypeScript-first |
| **Database** | PostgreSQL + pgvector | Conversation memory, semantic search, RLS for multi-tenancy |
| **Cache** | Redis | Session state, 3-min API data cache, pub/sub for scaling |
| **Workflows** | Temporal | Durable execution for long-running jobs, retries, approvals, compensations |
| **GitHub SDK** | Octokit | Official SDK, TypeScript types, rate limit handling |
| **Auth** | Custom JWT (`jose`) | WebSocket-compatible, no vendor lock-in at MVP |
| **Deployment** | Managed containers (Cloud Run or Fly.io) | Fastest time-to-production |
| **Linter** | Biome | 10-25x faster than ESLint+Prettier, single config |
| **Mobile (MVP)** | React Native (Expo) | Fastest cross-platform path |
| **Wake Word** | Porcupine (Picovoice) | Only option with official React Native SDK + custom wake words |
| **Testing** | Vitest + k6 (load) | Unit/integration + WebSocket load testing |
| **Observability** | OpenTelemetry + Langfuse | Distributed tracing + LLM cost/quality tracking |

### Key Stack Conflicts Resolved

**BullMQ vs Temporal:** Earlier research recommended BullMQ (Redis-backed, simpler). Later research recommended Temporal (durable execution, crash-proof, supports approval workflows). **Resolution:** Use Temporal. Jarvis needs durable workflows for GitHub operations, human-in-loop approvals, and retry-safe execution — these are Temporal's sweet spot. BullMQ is fine for simple repeatable jobs but doesn't scale to the agentic workflow requirements.

**Fly.io vs Cloud Run:** Earlier research recommended Fly.io (35+ regions, first-class WebSocket). Later research recommended Cloud Run (managed containers, less ops). **Resolution:** Either works for MVP. If using OpenAI Realtime with WebRTC directly from client, your backend mainly handles auth/tools/memory (not media streaming), making any managed container platform viable. If using LiveKit Agents (self-hosted), Fly.io's WebSocket support and global edge become more relevant.

**Mastra vs LiveKit vs Direct OpenAI:** Earlier research recommended Mastra (TypeScript-native) or LiveKit Agents. Later research recommended direct OpenAI Realtime SDK. **Resolution:** Mastra's voice support is immature (no VAD, no turn detection — it delegates to OpenAI). Use direct OpenAI Realtime for MVP, LiveKit Agents as the scaling/portability path.

---

## 5. Voice Pipeline Details

### Architecture Pattern: Less Than 15% of Enterprise Voice AI Uses Pure Speech-to-Speech

Cascaded pipelines (STT→LLM→TTS) dominate due to debuggability, compliance, and cost. However, OpenAI Realtime API offers the best latency for conversational UX. The dual-path design uses both.

### Latency Budget (Voice-to-Voice)

| Stage | Typical Range | % of Total |
|-------|--------------|------------|
| Audio capture | 10-50ms | ~5% |
| Network upload | 20-100ms | ~10% |
| STT | 100-500ms | 20-30% |
| LLM processing | 200-2000ms | **40-60%** |
| TTS | 100-400ms | ~15% |
| Network download | 20-100ms | ~10% |

**LLM processing is 60-70% of total latency.** Transport layer differences (WebSocket vs WebRTC) are negligible — the bottleneck is the model, not the pipe.

### Latency Targets for Jarvis

- Immediate acknowledgement (earcon or verbal cue): ≤250ms after end-of-user-speech
- First assistant audio: ≤700ms target, ≤1000ms p95 (web/mobile)
- Barge-in reaction: playback halt ≤150ms from detected user speech
- Turn-taking accuracy: >95%

### WebSocket vs WebRTC

Production testing showed nearly identical latency (1,920ms vs 2,060ms) because transport is <5% of total latency. **Start with WebSocket for simplicity.** WebRTC matters for peer-to-peer audio or when using LiveKit's SFU infrastructure.

### Audio Codecs

- **Opus:** Recommended for client→server (26.5ms latency, excellent speech compression)
- **PCM16:** Required by OpenAI Realtime API (16kHz mono, 16-bit)
- **Strategy:** Capture as Opus on client, transcode to PCM16 on server for OpenAI

---

## 6. LLM Strategy

### Multi-Model Approach

| Role | Primary | Fallback | Rationale |
|------|---------|----------|-----------|
| **Voice conversation** | GPT-5-mini | GPT-4.1 Mini | Best balance of capability, speed, cost. 45% fewer factual errors. |
| **Complex reasoning** | GPT-5 / GPT-5.4 | Claude Sonnet 4.5 | Multi-step analysis, PR creation, issue diagnosis |
| **Classification/routing** | GPT-4.1 Nano | Gemini 2.5 Flash-Lite | Ultra-fast intent detection and request routing |
| **Realtime voice loop** | gpt-realtime-mini | — | Native speech-to-speech for OpenAI Realtime path |
| **Embeddings** | text-embedding-3-small | — | pgvector semantic search |

### Fallback Chain

```
Primary model → Fallback model → Fallback provider
  → Circuit breaker (systemic failures)
    → Graceful degradation ("I'm having trouble right now")
```

### Prompt Caching

OpenAI GPT-5 offers 90% discount on cached tokens; GPT-4.1 offers 75%. Jarvis has obvious reusable context — tool schemas, capability manifests, policy blocks, system instructions. Cache aggressively.

---

## 7. GitHub Integration

### Two Modes

**Mode A: Arbitrary Public GitHub URL Ingestion (Read-Only)**
- User gives any public GitHub URL
- Jarvis parses it, fetches data on demand
- Answers with citations and freshness timestamps

**Mode B: Connected GitHub Workspace (Read + Eventually Write)**
- Org/user installs a GitHub App (fine-grained permissions, installation tokens)
- Webhooks keep local projections current
- Unlocks: faster answers, better scope, eventually write actions (issue analysis, PR creation)

### Implementation

- **Auth:** GitHub App (not PAT). Least privilege, installation scoping, auditable.
- **API Strategy:** GraphQL for read-heavy graph queries (PRs with comments, issues with labels). REST for simple operations and mutations.
- **SDK:** Octokit (`@octokit/rest`, `@octokit/graphql`)
- **Rate Limits:** Authenticated: 5K req/hr (REST), 5K points/hr (GraphQL). GitHub App: 15K req/hr.
- **Webhooks:** Always validate `X-Hub-Signature-256`. Track `installation` events to keep repo-access state accurate. Implement redelivery worker + dead-letter monitoring (GitHub doesn't auto-redeliver failed deliveries).

### MVP Tool Set

- `github_list_repos`, `github_get_repo_info`
- `github_list_open_prs`, `github_get_pr_details`
- `github_list_issues`, `github_get_issue_details`
- `github_get_recent_merges`
- (Later: `github_create_issue_comment`, `github_create_pr`)

---

## 8. Memory Architecture

### Four-Layer Model

| Layer | Scope | Storage | Contents |
|-------|-------|---------|----------|
| **L0: Turn** | Ephemeral, in-flight | In-memory | Current utterance, partial transcripts, pending tool calls, interruption state |
| **L1: Session** | Short-lived continuity | Redis | Previous turns, active goals, unresolved clarifications, task context |
| **L2: Durable** | Persistent, structured | PostgreSQL | User preferences, tenant settings, integration state, approved scopes, standing instructions |
| **L3: Distilled** | Compact carry-forward | PostgreSQL + pgvector | Summaries with provenance — what was asked, answered, what evidence was used, what remains unresolved |

### Key Principle: Structured Memory First, Vector Memory Second

Do not start by throwing transcripts into a vector database. Jarvis's early memory needs are mostly: preferences, identities, tasks, prior answers, unresolved actions, policy state. These are structured, auditable, and time-sensitive. Put them in normal tables first. Add vector retrieval later for semantic recall across long transcript history.

### Within-Session

Sliding window (last 8-10 exchanges) + summarization of older messages (60-70% token reduction). An async memory agent extracts memories without impacting voice latency.

### Cross-Session Frameworks

- **Zep:** Temporal knowledge graphs, entity/fact extraction. Best for understanding entities and relationships over time (repos, PRs, users).
- **Mem0:** 80% prompt token reduction, 90% p95 latency reduction. Best for token compression.
- **Recommendation:** Evaluate both. Zep's entity graph is ideal for GitHub context; Mem0's compression is ideal for cost.

### Vector Search: pgvector

Eliminates a separate infrastructure dependency. pgvectorscale achieves 11.4x better performance than Qdrant at 99% recall. At MVP scale (thousands of messages), flat scans are fine — add HNSW indexes when volume warrants it.

---

## 9. Hallucination Prevention

### Reframing: Zero Unsourced Operational Claims

No vendor honestly guarantees literal zero hallucinations. The practical target: if Jarvis should know something from the live API, GitHub, or stored memory, it must fetch it or abstain.

### Five-Layer Strategy

1. **RAG grounding** — Only answer from retrieved data (GitHub API, cached API data, conversation memory)
2. **System prompt engineering** — Explicit rules forbidding fabrication, requiring "I don't know," requiring citations
3. **Retrieval score threshold** (0.75) with "I don't know" fallback when below
4. **Self-verification** on write operations (GitHub PRs, comments)
5. **Zod validation** on all structured outputs

### Freshness Enforcement (Hard 3-Minute SLA)

```
effective_age = max(
  now - fetched_at_local,
  Age header if present,
  now - Date header if present
)

Policy:
- effective_age ≤ 180s → answer eligible
- effective_age > 180s → refresh before answering
- refresh fails → "data currently unavailable" (do not hallucinate)
```

Implementation: prefer event-driven invalidation (webhooks), use conditional GET (`ETag`, `If-None-Match`), cache entries carry `expires_at = fetched_at + 180s`.

### Tool-First Architecture

For turns requiring live data:
- Set `tool_choice: "required"` or restrict `allowed_tools`
- Use `strict: true` function schemas (`additionalProperties: false`, all fields required)
- Normalize tool results into `evidence[]` with `{source, entity, fetched_at, freshness_s, citation_ref}`
- Block answer if any required evidence is missing, stale, or permission-filtered

---

## 10. Mobile & Frontend

### Mobile Framework

| Framework | Verdict | Notes |
|-----------|---------|-------|
| **React Native + Expo** | **MVP choice** | Fastest cross-platform path. `@siteed/expo-audio-studio` for audio capture. Requires native modules for audio pipeline. |
| **KMP** | Production upgrade | True native perf, shared-core architecture fits voice assistants. 60-80% code sharing (Netflix, Cash App). |
| **Flutter** | Viable but not best | Platform channel abstraction adds complexity for real-time audio. |
| **Fully Native** | Best perf, worst economics | Only if audio latency requirements are extreme (unlikely — LLM dominates). |

### Wake Word: Porcupine (Picovoice)

Only option with official React Native SDK + instant custom wake word training. On-device inference, no cloud dependency.

### iOS Background Audio — CRITICAL RISK

Apps get ~10 minutes of background execution before iOS suspends them. Must register `audio` UIBackgroundMode. Apple reviews this usage and may reject apps that abuse it. Wake word engine must be extremely lightweight. **Extensive testing required.**

### Push-to-Talk vs Continuous Listening

Support both modes. Default to push-to-talk for battery efficiency and noise resilience. Wake-word activation as opt-in for hands-free scenarios. Battery impact of continuous listening: 3-8% per hour.

---

## 11. Security & Compliance

### Regulatory Landscape

- **GDPR:** Voice = PII. Explicit opt-in consent required. Must honor erasure/access/portability. Max fines: 20M EUR or 4% annual revenue.
- **CCPA:** Audio = personal information. Default collection with clear opt-out option.
- **BIPA (Illinois):** Voiceprints may qualify as biometric data. Private right of action (lawsuits).
- **20+ US states** have enacted GDPR-like privacy laws.

### Implementation Requirements

- **Encryption:** TLS 1.3 in transit (WSS), AES-256 at rest. Cloud KMS for key management.
- **Data retention:** Configurable policies (30/90/365 days). Automated deletion. Consider storing only transcripts, not raw audio.
- **Multi-tenancy:** PostgreSQL RLS from day one. `user_id` policies filter automatically.
- **Consent:** Recording notice before any audio capture. Explicit consent (GDPR). Store consent records with timestamps.

### Write Action Safety

All mutative actions require: scoped permissions, explicit approval, idempotency keys, retry-safe workflow execution, audit logging, visible status tracking. Do not allow the live speech loop to directly trigger write actions.

---

## 12. Testing & Quality

### Testing Layers

1. **Unit (Vitest):** Intent parsing, entity extraction, context management, function calling reliability
2. **Integration:** STT→LLM→TTS pipeline with real recorded audio. State management across multi-turn conversations.
3. **End-to-End:** Gold standard dataset of queries and expected responses. Diverse voices, accents, noise conditions.
4. **Load (k6):** Concurrent WebSocket connections with realistic audio streaming patterns.

### Voice-Specific Testing — Critical

78% of voice AI failures occur in untested edge cases:
- Non-native speakers and diverse accents matching actual user base
- Background noise: construction sites, warehouses, vehicles (test at -5 dB to 15 dB SNR)
- Rapid speech, mumbling, incomplete sentences
- Adversarial personas: impatient user, confused user, technical expert, frustrated user

### Minimum Eval Suites (Non-Negotiable Before Rollout)

- Live-API factual correctness
- Stale-data refusal
- GitHub metadata Q&A correctness
- Interruption success/stop latency
- Turn-end accuracy in noise
- Memory recall precision
- Tool-call success rate
- Approval-flow escape tests
- Cost per active minute

---

## 13. Cost Modeling

### Per Hour of Conversation

| Approach | STT | LLM | TTS | Total/Hour |
|----------|-----|-----|-----|------------|
| **Pipeline (recommended at scale)** | $0.46 (Deepgram) | $0.27 (GPT-5-mini) | $0.30 (Cartesia) | **~$1.03** |
| **OpenAI Realtime API** | — | — | — | **~$10.80** |

### Monthly (10 users, 30 min/day)

| Component | Pipeline | Realtime API |
|-----------|----------|-------------|
| AI/API costs | ~$155 | ~$1,620 |
| Infrastructure | ~$50-120 | ~$50-120 |
| **Total** | **~$200-275** | **~$1,740** |

### The Dominant Cost

OpenAI API costs are **10-50x infrastructure costs.** Infrastructure optimization is secondary to API cost management. Cost optimization strategies: client-side VAD (stop streaming silence), session timeouts, prompt caching (90% discount on cached tokens), per-session cost caps, billing alerts.

### Cost Spike Scenarios

- 10 users × 15-min conversations simultaneously = ~$30 in 15 minutes
- Forgotten open WebSocket sessions streaming silence: $0.06/min × 10 sessions × 8 hours = ~$288
- Retry loops on failed API calls multiply costs

---

## 14. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Noisy environments degrade STT accuracy | High | High | Multi-condition trained models, headset recommendation, Krisp SDK |
| iOS kills background wake word process | High | High | Proper AVAudioSession config, minimal resource usage, extensive testing |
| Cost spikes from concurrent/long sessions | High | High | Per-session caps, VAD, silence detection, billing alerts |
| Network unreliability for frontline workers | High | Medium | Client-side buffering, reconnection logic, offline degradation |
| GDPR/BIPA compliance (voice = PII) | Medium | Critical | Legal review, explicit consent, data minimization, retention policies |
| LiveKit Node.js SDK immaturity (~7 months) | Medium | Medium | Well-funded (Series C), battle-tested SFU, Apache 2.0 (can fork) |
| Accent-related transcription failures | Medium | High | User-demographic-matched eval datasets |
| Vendor lock-in to OpenAI | Medium | Medium | Modular pipeline architecture, component-level swappability |
| OpenAI API/model lifecycle churn | Medium | Medium | Pinned model versions, canary env, migration runbooks |
| Shared-device identity ambiguity | Medium | Medium | Clear identity model, auth per session |
| Audio quality varies by device/microphone | High | Medium | Recommend headsets, client-side noise suppression |

### Unknown Unknowns to De-Risk Early

1. **Turn-taking in noisy frontline environments.** False interruptions or missed interruptions destroy trust fast.
2. **Prompt injection via GitHub/API data.** Treat all external data as untrusted input (OWASP LLM Top 10).
3. **Vendor surface churn.** OpenAI is retiring older Realtime beta on 2026-05-07. Build adapter layers between product and provider shapes.
4. **The noise reduction paradox.** Conventional preprocessing can "improve SNR by 8 dB yet drive WER up 15% by stripping speech harmonics." Multi-condition trained models outperform noise-cleaned-then-recognized by 15-20% WER.
5. **66% of users** identify accent-related issues as a key barrier to voice tech adoption.

---

## 15. Build Sequence

### Phase 0: Spike & De-Risk

- Prove low-latency voice loop with interruption (OpenAI Realtime)
- Prove fresh API grounding with tool-first pattern
- Prove public GitHub URL ingestion
- Define eval harness and latency measurement
- Benchmark LiveKit Agents Node.js as alternative path

### Phase 1: MVP

- Push-to-talk web experience
- OpenAI Realtime + backend sideband control
- Read-only GitHub (arbitrary public URLs) and API answers
- Citations and freshness timestamps on all answers
- Structured session and durable memory (L0-L2)
- Observability (OpenTelemetry + Langfuse)

### Phase 2: Operational Maturity

- Connected GitHub workspaces via GitHub App
- Webhook-fed read models
- Cross-session memory (L3 distilled summaries)
- Better analytics and cost tracking
- Personalization and tenant isolation (PostgreSQL RLS)
- Eval-gated releases

### Phase 3: Expanded Channels

- Mobile app (React Native + Expo)
- Optional LiveKit Agents migration if cost/portability warrants
- Native mobile improvements
- Controlled passive-mode experimentation (push-to-talk remains default)

### Phase 4: Agentic Actions

- Issue analysis and patch proposals
- Dry-run PR generation with approval workflow
- Approved write workflows via Temporal
- Post-execution verification and user confirmation

---

## 16. Open Decisions for Planning Phase

1. **Voice pipeline:** OpenAI Realtime (recommended MVP) vs LiveKit Agents (scaling path)?
2. **First real channel:** Web, mobile native, or both?
3. **LLM model:** GPT-5-mini vs GPT-5.4 mini for primary voice model?
4. **Memory framework:** Zep vs Mem0 vs custom pgvector?
5. **Deployment platform:** Cloud Run vs Fly.io vs Railway?
6. **Multi-tenant:** PostgreSQL RLS from day one vs application-layer filtering?
7. **GitHub integration depth at MVP:** Read-only only, or include commenting?
8. **Offline capability:** Invest in edge/on-device fallback or require connectivity?
9. **LiveKit Cloud vs self-hosted?**
10. **What exact definition of "latest data" will the product promise during degraded states?**

---

## 17. Sources

Over 200 sources cited across the original research documents. Key authoritative sources:

### Voice & Audio
- OpenAI Realtime API, Voice Agents, Deprecations docs
- LiveKit Agents docs + GitHub (Python, Node.js)
- Deepgram Nova-3, Flux docs
- Cartesia Sonic 3 docs
- Pipecat docs + GitHub
- Silero VAD GitHub
- AssemblyAI docs

### LLM & Agents
- OpenAI GPT-5, GPT-5.4, GPT-4.1, Function Calling, Agents SDK docs
- Anthropic Claude 4.5, Agent SDK docs
- Google Gemini 2.5/3 Flash docs
- Vercel AI SDK 6 docs
- Mastra docs
- Groq, Cerebras benchmarks

### Infrastructure
- PostgreSQL, pgvector docs
- Redis docs
- Temporal docs
- Drizzle ORM docs
- Fastify docs + benchmarks
- Fly.io, Railway, Cloud Run docs

### GitHub
- GitHub Apps, GraphQL, REST, Webhooks, Rate Limits docs
- Octokit.js docs

### Competitive & Market
- VoiceLine Series A, aiOla, Vapi, Retell, Bland docs
- Voice AI market reports (22.4% CAGR)
- ElevenLabs Conversational AI 2.0

### Security & Compliance
- GDPR, CCPA, BIPA regulations
- OWASP LLM Top 10
- NIST AI RMF + GenAI profile
- SOC 2 guidance

### Testing & Observability
- OpenTelemetry docs + GenAI semantic conventions
- Langfuse, Braintrust docs
- k6 WebSocket testing docs
- OpenAI Realtime Eval Guide
