# Jarvis — Technology Provider Reference

**Date:** 2026-03-18
**Purpose:** Detailed provider comparisons, pricing, benchmarks, and implementation specifics to support technology decisions in `docs/research.md`.

---

## 1. Speech-to-Speech APIs

### 1.1 OpenAI Realtime API (gpt-realtime)

**Status:** GA since August 2025. Older beta surfaces retiring May 7, 2026.

A single natively multimodal model (GPT-4o based) that ingests audio tokens and outputs audio tokens directly. Persistent bidirectional connection.

**Connection methods:** WebRTC (best end-to-end latency, browser), WebSocket (server-to-server), SIP (telephony).

**Latency:** ~250-300ms TTFT.

**VAD Options:**
- **Server VAD:** Silence-based chunking. Configurable threshold (0-1), prefix_padding_ms, silence_duration_ms.
- **Semantic VAD:** Turn-detection classifier distinguishing pauses-for-thought from end-of-turn. Eagerness: low (8s), medium (4s), high (2s).
- Interrupt handling: Cancels ongoing response when user speech detected. Controllable via `interrupt_response`.

**Function calling:** Full support. Tools, parallel calls, strict mode.

**Pricing (per 1M tokens):**

| Model | Text In | Text Out | Audio In | Audio Out | Cached Audio In |
|-------|---------|----------|----------|-----------|-----------------|
| gpt-realtime | $4.00 | $16.00 | $32.00 | $64.00 | $0.40 |
| gpt-realtime-mini | $0.60 | $2.40 | $10.00 | $20.00 | $0.30 |

**Approximate per-minute:** Audio input ~$0.06/min, audio output ~$0.24/min (full model). Mini: ~$0.018/min in, ~$0.075/min out.

**Key considerations:**
- Silence counts as audio time when streaming continuously — must use VAD or push-to-talk
- No intermediate text for content filtering/logging (compliance concern)
- Server-side controls pattern: backend attaches to same session via call_id for tools, policy, monitoring
- Vendor lock-in to OpenAI
- 18.6pp improvement in instruction-following, 12.9pp improvement in tool-calling accuracy (2025 update)

### 1.2 Google Gemini Live API

**Status:** Gemini 2.5 Flash Native Audio GA on Vertex AI.

**Latency:** 320ms P50, 780ms P95 TTFT. 16kHz PCM in, 24kHz out.

**Pricing (per 1M tokens):**
- Audio input: ~$0.006/min (extremely cheap)
- Audio output: ~$0.023/min

**CRITICAL CAVEAT:** Live API charges per turn for ALL tokens in the session context window (accumulated from all previous turns). Costs escalate rapidly in long conversations.

**Features:** Barge-in, 70 languages, affective dialog, function calling, Google Search integration, free text transcripts as side channel.

### 1.3 Amazon Nova Sonic

**Status:** GA on Bedrock. Nova 2 Sonic announced.

**Pricing:** ~$0.017/min — roughly 80% cheaper than OpenAI Realtime.

**Features:** 7 languages, cross-modal interaction, async tool use (AI speaks while waiting for tool results), 1M token context.

**Limitation:** Less developer community/tooling. Regional availability (US East, West, Tokyo).

### 1.4 ElevenLabs Conversational AI 2.0

Not pure S2S — orchestrates STT + LLM + premium TTS. Best voice quality in industry. $0.08-$0.10/min. LLM costs currently absorbed but will be passed through. Sub-100ms latency, Conversational AI 2.0 with advanced turn-taking model.

**Growth:** $500M Series D at $11B valuation, $330M ARR, 41% of Fortune 500.

### 1.5 Hume AI EVI 3

S2S with emotion detection. BYO-LLM (Claude, GPT, Gemini, etc.). $0.04-$0.06/min at scale. Pro plan: 10 concurrent (matches Jarvis requirement). SDKs: React, TypeScript, Python, Swift.

### 1.6 Ultravox (Fixie AI)

Open-source multimodal LLM that "hears" audio natively. ~150ms TTFT. Ranks #1 on VoiceBench. Still needs TTS pairing. Requires GPU (A100). Not MVP-ready but represents the future direction.

---

## 2. STT Providers

| Provider | Latency | WER | Price/min | Real-time | Best For |
|----------|---------|-----|-----------|-----------|----------|
| **Deepgram Nova-3** | <300ms | 5.26% | $0.0077 | Yes | Voice agents (best overall) |
| **Deepgram Flux** | <300ms | Good | Similar | Yes | Conversational STT with turn detection |
| **AssemblyAI U3 Pro** | ~150ms | 8.14% | $0.0075 | Yes | High-accuracy, rich features |
| **Google Chirp** | ~400ms+ | Good | $0.016 | Yes | GCP-native workloads |
| **Azure Speech** | ~500ms+ | Good | $0.017 | Yes | Enterprise/compliance |
| **OpenAI Whisper** | N/A | 95-97% | $0.006 | **NO** | Batch transcription only |

**Recommendation: Deepgram Nova-3.** Best latency, accuracy, pricing. $200 free credit. 54% WER reduction vs competitors. Consider Deepgram Flux for conversational STT with built-in turn detection and mid-stream tuning (newer, explicitly positioned for voice agents).

**Note:** OpenAI Whisper has NO real-time streaming — batch only. Not suitable as primary STT.

### Deepgram Details
- WebSocket-based streaming, real-time multilingual (first to offer)
- Free: $200 credit, no expiration, no card
- Growth tier: $0.0065/min
- Also offers Aura-2 TTS ($0.030/1K chars, domain-specific pronunciation)

### AssemblyAI Details
- Universal-Streaming: ~300ms P50, $0.0025/min
- Universal-3 Pro Streaming: ~150ms P50, $0.0075/min
- Free: 185 hours pre-recorded, 333 hours streaming
- Speaker diarization +$0.12/hr, keyterm prompting
- Unlimited concurrent streams with auto-scaling
- **Caveat:** Streaming pricing is per-connection-hour (idle connections still cost)

---

## 3. TTS Providers

| Provider | TTFB | Price/1K chars | Quality | Streaming |
|----------|------|---------------|---------|-----------|
| **Cartesia Sonic Turbo** | **40ms** | $0.011 | Very good | WebSocket |
| **Cartesia Sonic 3** | 90ms | $0.011 | Very good | WebSocket |
| **ElevenLabs Flash v2.5** | 75ms | ~$0.20 | **Best** | WebSocket |
| **Deepgram Aura-2** | 90-200ms | $0.030 | Good | Yes |
| **OpenAI tts-1** | ~200ms+ | $0.015/1K chars | Good | HTTP only |
| **LMNT** | 150-200ms | Volume-based | Good | Yes |

**Recommendation: Cartesia Sonic Turbo.** 40ms TTFB is unmatched. 27x cheaper than ElevenLabs. WebSocket streaming. Good expressiveness. Laughter, breathing, emotional inflections.

### On-Device TTS (Mobile Fallback)
- **iOS:** `AVSpeechSynthesizer` — native, offline, instant, robotic quality
- **Android:** Native `TextToSpeech` cannot do streaming. **Picovoice Orca** does on-device streaming TTS.
- **Strategy:** Cloud TTS primary, native TTS as offline fallback

---

## 4. VAD Options

| Solution | Model Size | Processing | TPR (at 5% FPR) | Notes |
|----------|-----------|-----------|------------------|-------|
| **Silero VAD** | 1.8MB | ~1ms/30ms chunk | 87.7% | Open source, ONNX Runtime (Node.js + browser) |
| **WebRTC VAD** | N/A | Very low | 50% | Built-in to WebRTC. **Not recommended** as primary. |
| **Picovoice Cobra** | Small | Low | Higher (claimed) | Proprietary, commercial license required |

**JS Package:** `@ricky0123/vad` wraps Silero for browser and Node.js.

**Recommended Approach:**
- Client-side Silero VAD for initial speech detection and bandwidth optimization (only send speech, not silence)
- Server-side semantic VAD (OpenAI Realtime or LiveKit) for intelligent turn-taking (distinguishing pauses from end-of-turn)

---

## 5. LLM Model Matrix

| Model | TTFT | Input $/1M | Output $/1M | Context | Function Calling | Best For |
|-------|------|-----------|------------|---------|-----------------|----------|
| **GPT-5** | ~0.5s | $1.25 | $10.00 | 272K | Parallel | Highest capability, integrated reasoning |
| **GPT-5-mini** | ~0.4s | $0.25 | $2.00 | 272K | Parallel | Cost-effective high capability |
| **GPT-5.4** | — | TBD | TBD | — | Yes | Latest (March 2026), recommended primary |
| **GPT-5.4 mini** | — | TBD | TBD | — | Yes | Latest, recommended for voice |
| **GPT-4.1** | 0.97s | $2.00 | $8.00 | 1M | Parallel, strict | Long context, tool calling |
| **GPT-4.1 Mini** | 0.42s | $0.40 | $1.60 | 1M | Parallel | Low-latency voice agents |
| **GPT-4.1 Nano** | 0.67s | $0.10 | $0.40 | 1M | Yes | Ultra-low cost classification |
| **GPT-4o** | ~0.32s | $2.50 | $10.00 | 128K | Parallel | Broad capability, multimodal |
| **GPT-4o-mini** | ~0.3s | $0.15 | $0.60 | 128K | Parallel | Fast, cheap general tasks |
| **Claude Sonnet 4.5** | ~0.6s | ~$3.00 | ~$15.00 | 200K | Streaming | Deep reasoning, tool use |
| **Claude Haiku 4.5** | ~0.36s | ~$0.25 | ~$1.25 | 200K | Streaming | Fast, 4-5x faster than Sonnet |
| **Gemini 2.5 Flash** | 0.32s | $0.30 | $2.50 | 1M | Native tools | Lowest TTFT, thinking mode |
| **Gemini 2.5 Flash-Lite** | ~0.25s | $0.10 | $0.40 | 1M | Yes | Ultra-fast, cost-efficient |
| **Gemini 3 Flash** | <0.3s | TBD | TBD | 1M+ | 100+ parallel | Handles 100 tools at once |

### Inference Providers (Open-Source Models)

| Provider | Speed | Best For |
|----------|-------|---------|
| **Groq** | Sub-300ms TTFT, 185 tok/s avg | Voice/real-time critical traffic |
| **Cerebras** | Fastest inference system | High-volume synchronous tasks |
| **Fireworks AI** | 4x faster structured output | Agent logic, structured output |
| **Together AI** | Most reliable GPU deployments | Large open-weight models |

### Open-Source Models
- **Llama 4 Scout:** 17B active params, 16 experts (MoE), 10M context, fits single H100
- **Llama 4 Maverick:** 17B active, 128 experts, 1M context, beats GPT-4o on many benchmarks
- Not recommended for MVP due to operational complexity. Evaluate for cost optimization later.

---

## 6. Agent Framework Comparison

| Feature | LiveKit Agents | Pipecat | Vercel AI SDK 6 | Mastra | OpenAI Agents SDK |
|---------|---------------|---------|----------------|--------|------------------|
| **Primary Language** | Python + **Node.js** | **Python** | **TypeScript** | **TypeScript** | Python + TS |
| **Node.js Server SDK** | **Full** | Client only | Native | Native | Yes |
| **Voice Pipeline** | Full (STT→LLM→TTS) | Full | **No pipeline** | Basic STS wrapper | Native Realtime |
| **VAD** | Silero (built-in) | Silero (built-in) | None | None | Via Realtime |
| **Turn Detection** | Semantic (transformer) | Smart Turn Model (AI) | None | None | Via Realtime |
| **Interruption** | Automatic | Automatic | None | None | Via Realtime |
| **Function Calling** | Zod tools + MCP | FunctionSchema (multi-provider) | Zod tools + MCP + multi-step | Zod tools + MCP | Native |
| **WebRTC** | Native SFU | Via Daily | No | No | Via Realtime |
| **Production Proven** | Tesla, Salesforce, 911 | NVIDIA GTC, AWS | Millions of deployments | Replit, PayPal, Adobe | OpenAI ecosystem |
| **License** | Apache 2.0 | BSD-2-Clause | Apache 2.0 | — | — |
| **GitHub Stars** | ~10.5K | ~10.8K | Large | ~22.1K | N/A |
| **Downloads/wk** | — | — | 2.8M | 150K | N/A |

### Verdicts

- **LiveKit Agents:** Best fit for TypeScript voice project. Full Node.js SDK, Zod tools, pnpm/TS alignment, production-proven. Risk: Node.js SDK ~7 months old.
- **Pipecat:** Best voice pipeline overall, but **Python-only for server**. Misaligned with TypeScript stack.
- **Vercel AI SDK 6:** Excellent for LLM orchestration and tool calling, but **not a voice pipeline.** No VAD, no turn detection. Best as the "brain" layer.
- **Mastra:** Great TypeScript agent framework, but **voice support is immature** — no VAD, no turn detection, delegates to OpenAI Realtime. Built on Vercel AI SDK internally.
- **OpenAI Agents SDK:** Fast prototyping path with Realtime Agents. Tightly coupled to OpenAI ecosystem.

### Recommendation

- **MVP:** Direct OpenAI Realtime API (fastest path to natural conversation)
- **Scale/portability:** LiveKit Agents Node.js SDK
- **LLM orchestration complement:** Vercel AI SDK 6 if complex multi-step tool calling is needed

---

## 7. Memory Frameworks

| Framework | Approach | Key Strength | Token Reduction | Open Source |
|-----------|----------|-------------|-----------------|-------------|
| **Mem0** | Extracts "memories," stores/retrieves later | 80% prompt token reduction, 26% LOCOMO uplift | 90% | Yes (+ cloud) |
| **Zep** | Temporal knowledge graph, entity/fact extraction | Entity relationships over time, progressive summarization | Significant | Yes (+ cloud) |
| **LangMem** | LangChain-native memory modules | Integrates with LangGraph | Varies | Yes |
| **Mastra built-in** | Short-term + long-term across threads | Native to framework | Varies | Yes |

**Zep:** Best for understanding entities and relationships over time — ideal for GitHub context (repos, PRs, users, conversations). Published research paper on temporal knowledge graph architecture.

**Mem0:** 50K+ developers. Up to 80% prompt token reduction and 91% p95 latency reduction. Benchmark claims disputed by competitors (Letta, Zep).

---

## 8. Vector Databases

| Database | QPS (99% recall) | Best For | Cost |
|----------|-------------------|---------|------|
| **pgvector** (+ pgvectorscale) | 471 QPS (50M vectors) | Already using PostgreSQL | Free extension |
| **Qdrant** | 41 QPS (50M vectors) | Complex metadata filtering | Self-hosted free |
| **Pinecone** | Enterprise-grade | Strict reliability, fully managed | Managed (expensive) |
| **Chroma** | 4x faster (Rust rewrite) | Rapid prototyping | Self-hosted free |

**Recommendation: pgvector.** 11.4x better performance than Qdrant at 99% recall. Eliminates separate infrastructure. Skip HNSW indexes at MVP; add when volume warrants.

---

## 9. Backend Frameworks

### Fastify vs Express

| Metric | Fastify | Express |
|--------|---------|---------|
| Requests/s (synthetic) | 70K-80K | 20K-30K |
| Requests/s (real-world) | ~30K+ | ~10K-15K |
| TypeScript-first | Yes | No |
| Plugin ecosystem | Official plugins (auth, CORS, rate limit, WebSocket) | Community-driven |
| WebSocket | `@fastify/websocket` (uses `ws`) | Manual attachment |

**Verdict: Fastify.** 3-5x faster, cleaner plugin system, first-class TypeScript. Upgrade path to uWebSockets.js via `fastify-uws` plugin.

### WebSocket Libraries

| Feature | ws | Socket.IO | uWebSockets.js |
|---------|-----|-----------|----------------|
| Performance | High | Moderate | Highest |
| Memory/conn | Low | High (~60KB) | Lowest |
| Auto-reconnect | No | Yes | No |
| API complexity | Low-level | High-level | Medium |

**Verdict: `ws` via `@fastify/websocket`.** Socket.IO's features unnecessary in a controlled environment. `fastify-uws` available as performance upgrade.

### Node.js 22 vs Bun

**Verdict: Node.js 22.** Ecosystem maturity, debugging tools, Docker support outweigh Bun's raw performance. The performance bottleneck is LLM API latency (200-450ms), not framework overhead.

---

## 10. ORM Comparison

| Feature | Drizzle | Prisma | Kysely |
|---------|---------|--------|--------|
| Bundle size | ~5KB | ~40KB + binary | ~8KB |
| Query perf (1M queries) | 88K req/s | 71K req/s | 92K req/s |
| pgvector support | **Native** | Via extension | Manual |
| API style | SQL-like | Schema-first | SQL builder |
| Downloads trend | Crossed Prisma in 2025 | Declining | Stable |

**Verdict: Drizzle.** Native pgvector, SQL-like API matching functional preferences, 5KB bundle, TypeScript-first.

---

## 11. Deployment Platforms

| Feature | Fly.io | Railway | Cloud Run | Render |
|---------|--------|---------|-----------|--------|
| WebSocket support | First-class | Good | Good (1000 concurrent/container) | Good |
| Global regions | 35+ | Limited | Multi-region | Limited |
| Managed Postgres | Yes | Yes | Cloud SQL | Yes |
| Managed Redis | Upstash | Yes | Memorystore | Yes |
| GPU support | Yes | No | No | No |
| Best for | WebSocket-heavy, global edge | Simplest deployment | Managed containers | Simple APIs |

**Recommendation for MVP:** If using OpenAI Realtime with WebRTC (media doesn't flow through your server), any managed container platform works — Cloud Run, Railway, or Fly.io. If self-hosting LiveKit (media flows through server), Fly.io's WebSocket support and global edge become more important.

---

## 12. Auth Providers

| Feature | Custom JWT (`jose`) | Clerk | Auth0 | Supabase Auth |
|---------|-------------------|-------|-------|---------------|
| Free tier MAU | N/A | 10K | 25K | 50K |
| WebSocket auth | JWT query param | JWT validation | JWT validation | JWT validation |
| Pre-built UI | No | Yes (React) | Yes | No |
| Best for | MVP, voice-first (no UI) | Web dashboard needed | Enterprise SSO | Supabase ecosystem |

**Recommendation: Custom JWT for MVP.** Pre-built UI components are irrelevant for a voice assistant. WebSocket auth via JWT query param on connection upgrade.

---

## 13. Mobile Frameworks (Detail)

### React Native + Expo
- `@siteed/expo-audio-studio` for cross-platform real-time audio capture (831 commits, active development)
- New Architecture (Fabric, JSI, TurboModules) eliminates bridge bottleneck for synchronous native calls
- Real-time audio still requires native modules (Swift/Kotlin) for microphone access
- Picovoice Porcupine: only wake word SDK with official React Native SDK

### Kotlin Multiplatform (KMP)
- True native performance. Netflix, McDonald's, Cash App share 60-80% with KMP.
- Usage jumped from ~7% to ~18% (2024→2025).
- Compose Multiplatform for iOS stable (v1.8.0, May 2025).
- Shared-core architecture: share auth, networking, data caching; keep audio native.

### Audio Capture APIs
- **iOS:** `AVAudioEngine` for low-latency. `.playAndRecord` + `.allowBluetooth`. Buffers: 512-1024 samples at 16kHz = ~32-64ms.
- **Android:** `AudioRecord` for raw PCM. `Oboe` (C++) for lowest latency. 16kHz/16-bit mono standard.
- **Web:** `AudioWorklet` (separate thread, no main-thread blocking).

---

## 14. Wake Word SDKs

| SDK | On-Device | Custom Wake Words | React Native SDK | Mobile-Ready |
|-----|-----------|-------------------|-----------------|-------------|
| **Porcupine (Picovoice)** | Yes | Yes (instant training) | **Official** | Excellent |
| **openWakeWord** | Yes | Limited | No | Poor (Python-based) |
| **Sensory TrulyHandsfree** | Yes | Enterprise | No public RN SDK | Yes |
| **SoundHound Houndify** | Yes | Enterprise | Unknown | Yes |

**Recommendation: Porcupine.** Only option with official React Native SDK and instant custom wake word training. Commercial license required for production.

---

## 15. Cost Modeling (Detailed)

### Per 5-Minute Conversation

| Approach | Cost | Breakdown |
|----------|------|-----------|
| **OpenAI Realtime (gpt-realtime)** | ~$0.49 | 4 min user audio × $0.06 + 1 min AI audio × $0.24 + text ~$0.01 |
| **OpenAI Realtime (mini)** | ~$0.18 | Lower per-token rates |
| **Gemini Live (2.5 Flash)** | ~$0.04* | *Session context billing may increase |
| **Amazon Nova Sonic** | ~$0.05 | Cheapest S2S |
| **Cascaded (Deepgram+GPT-4o+Cartesia)** | ~$0.07 | STT $0.031 + LLM $0.015 + TTS $0.022 |
| **Cascaded (mini models)** | ~$0.04 | With GPT-4o-mini |

### Monthly Estimates (Infrastructure)

| Component | 10 users | 50 users | 100 users |
|-----------|----------|----------|-----------|
| Compute | $50-100 | $200-500 | $500-1,500 |
| Redis | $50 | $100-200 | $200-500 |
| PostgreSQL | $50-100 | $100-300 | $300-800 |
| Load balancer | $20 | $20-50 | $50-100 |
| **Subtotal** | ~$200 | ~$600 | ~$2,000 |

**API costs dominate infrastructure by 10-50x.** Focus optimization on LLM API costs.

### Fly.io Specific Pricing
- performance-1x (1 vCPU, 2GB): ~$32/mo
- Managed Postgres dev: ~$7/mo; production: ~$32/mo
- Upstash Redis: ~$5-15/mo at MVP scale

### Railway Alternative
- 1 vCPU, 2GB always-on: ~$40/mo
- Postgres + Redis add-ons: ~$10-20/mo

---

## 16. Competitive Products (Detail)

### Vapi.ai
Developer-first voice AI platform for phone calls. $0.05/min platform + third-party costs (true $0.13-$0.31/min). 100+ model modularity, Flow Studio builder. HIPAA/SOC2 compliance $1,000/month add-on. **Jarvis relevance: Low** — phone-call-centric, cost scales poorly for persistent assistant.

### Retell.ai
Enterprise compliance focus. ~600ms latency. $0.07-$0.08/min base, true $0.13-$0.31/min. SOC2 Type II, HIPAA, GDPR. Proprietary turn-taking models. 300%+ QoQ growth, $40M+ ARR. **Jarvis relevance: Medium** — turn-taking and compliance approach worth studying.

### Bland.ai
Enterprise phone call automation. <2s latency (vs 5s industry). Self-hosted option. $0.11-$0.14/min. **Jarvis relevance: Low** — SDR/follow-up focused.

### NVIDIA Riva
GPU-accelerated multilingual speech microservices. 150ms latency. On-premise, edge, cloud. 26+ languages. **Jarvis relevance: Medium for enterprise/edge** — if data sovereignty requires on-premise.

### Open-Source Frameworks
- **Pipecat:** Best voice pipeline, Python-only server. 10.8K stars. Pipecat Cloud GA.
- **LiveKit Agents:** Best TypeScript option. 10.5K stars. Series C funded.
- **Vocode:** Declining community, seeking maintainers. **Avoid.**
- **Bolna:** Telephony-focused, uncertain open-source status. **Avoid.**

---

## 17. PostgreSQL Schema Pattern

```sql
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
)

sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
)

messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  user_id UUID REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  audio_duration_ms INTEGER,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Indexes
CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_messages_user ON messages(user_id, created_at);

-- Multi-tenant RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_messages ON messages
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

---

## 18. WebSocket Auth Pattern

```typescript
// Client sends JWT as query param
ws://jarvis.example.com/ws?token=<JWT>

// Server validates on connection upgrade
fastify.register(fastifyWebsocket);
fastify.get('/ws', { websocket: true }, (socket, req) => {
  const token = req.query.token;
  const user = await verifyJWT(token);
  if (!user) { socket.close(4001, 'Unauthorized'); return; }
  // Proceed with authenticated connection
});
```

---

## 19. Drizzle + pgvector Pattern

```typescript
import { vector } from 'drizzle-orm/pg-core';

const messages = pgTable('messages', {
  embedding: vector('embedding', { dimensions: 1536 }),
});

// Query: find similar messages
const similar = await db.select()
  .from(messages)
  .orderBy(cosineDistance(messages.embedding, queryEmbedding))
  .limit(5);
```

---

## 20. LiveKit Agents Tool Definition Pattern

```typescript
const weatherTool = llm.tool({
  description: 'Get weather for a location',
  parameters: z.object({
    location: z.string().describe('City name'),
  }),
  execute: async ({ location }) => {
    return { temperature: 72, condition: 'sunny' };
  },
});

const agent = new voice.Agent({ tools: [weatherTool] });
```

---

## 21. Frontline Environment Challenges

### Noise
- Conventional noise preprocessing can "improve SNR by 8 dB yet drive WER up 15% by stripping speech harmonics"
- **Multi-condition training** (train on realistic noise) cuts WER by 15-20% vs clean-trained, even at 0 dB SNR
- Production target: 90%+ accuracy achievable with noise-trained models
- **Krisp SDK:** Embeddable AI noise cancellation, worth evaluating
- **Hardware recommendation:** Close-talking microphone/headset dramatically improves SNR
- Bone conduction tech enables communication in 85 dB+ environments

### Accents
- 66% of survey respondents identified accent-related issues as key barrier
- GPT-4o-Transcribe has highest accuracy across accents
- Deepgram Nova-3: up to 36% lower WER than Whisper on select datasets
- **Must:** Build eval dataset matching actual user demographics

### Connectivity
- Industrial facilities, remote sites often have unreliable/absent networks
- Hybrid edge-cloud: edge inference for core interaction, cloud for complex reasoning
- Edge systems achieve 99.5-99.9% availability vs 95-98% for cloud-only
- **Graceful degradation:** full capability → basic STT + cached responses → wake word + queuing → never fail silently

### Accessibility
- 1.3 billion people globally live with disabilities affecting voice interface use
- **Always provide text-based fallback.** Voice should be a modality, not a requirement.
- Architecture should be modality-agnostic at the LLM/business logic layer

---

## 22. Observability Metrics

| Metric | Target | Why |
|--------|--------|-----|
| End-to-end latency (voice→voice) | <1s ideal, <2s max | Users disengage above 1s |
| STT latency | <300ms | Foundation for fast response |
| LLM processing time | <1s | 60-70% of total latency |
| TTS TTFB | <500ms | Perceived responsiveness |
| Turn-taking accuracy | >95% | False interruptions destroy UX |
| Wake word false positive rate | <1/day | Privacy and battery |
| Wake word false negative rate | <5% | Usability |
| Reconnection rate | <1% of sessions | Stability |
| Context retention accuracy | >90% across turns | Coherence |
| Cost per active minute | Track | Budget control |

### Tooling
- **OpenTelemetry:** Distributed tracing spanning audio capture → STT → LLM → TTS → playback
- **Langfuse:** Open-source, LLM-specific cost tracking and quality evaluation
- **Braintrust:** Voice agent evaluation with scoring
- **LiteLLM:** Tracks spend across 100+ LLMs through single interface
- **Portkey:** Per-user cost tracking via metadata

---

## 23. Source Index

### OpenAI
- Realtime API, Voice Agents, Server Controls, Audio docs
- GPT-5, GPT-5.4 announcements; GPT-4.1 docs
- Function Calling, Responses API, Conversations API docs
- Agents SDK (Python + TypeScript)
- Pricing page, Deprecations page, Changelog
- Realtime Eval Guide, Session Memory cookbook

### Google
- Gemini Live API (Vertex AI + Gemini API), Gemini 3 Flash
- Gemini API changelog, pricing
- Grounding overview docs

### Amazon
- Nova Sonic, Bedrock docs, pricing
- Alexa+ Smart Properties

### Voice/Audio Components
- Deepgram Nova-3, Flux, Aura-2 docs + pricing
- Cartesia Sonic 3 docs + pricing
- ElevenLabs Conversational AI 2.0, pricing
- Hume AI EVI docs + pricing
- Silero VAD GitHub
- AssemblyAI docs + pricing

### Frameworks
- LiveKit Agents (Python + Node.js repos), docs, pricing, Series C
- Pipecat GitHub, docs, Cloud pricing
- Vercel AI SDK 6 docs
- Mastra docs, voice docs
- LangGraph 1.0 docs

### Infrastructure
- Fastify + uWebSockets.js benchmarks
- Drizzle ORM + pgvector docs
- PostgreSQL RLS, pgvectorscale benchmarks
- Redis docs
- Temporal docs
- Fly.io, Railway, Cloud Run docs + pricing
- BullMQ docs

### GitHub
- Apps auth, GraphQL, REST, Webhooks, Rate Limits
- Octokit.js docs

### Mobile
- Expo real-time audio blog
- expo-audio-studio GitHub
- KMP guides, Compose Multiplatform
- Porcupine/Picovoice docs
- iOS AVAudioSession, Android AudioRecord

### Security/Compliance
- GDPR, CCPA, BIPA regulations
- OWASP LLM Top 10
- NIST AI RMF
- SOC 2 guidance
- Voice AI privacy (Picovoice, Naitive)

### Competitive
- VoiceLine Series A press
- aiOla product docs
- Vapi, Retell, Bland docs + pricing
- Abridge platform
- Voice AI market reports

### Testing/Observability
- OpenTelemetry GenAI conventions
- Langfuse, Braintrust docs
- k6 WebSocket docs
- Voice AI testing strategies
- Noise-robust speech recognition research
