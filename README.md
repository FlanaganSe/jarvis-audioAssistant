# Jarvis

Jarvis is a real-time voice assistant for frontline workers: an operational voice copilot, not a general chatbot. Users hold push-to-talk, ask questions grounded in live GitHub repositories, weather data, and conversation memory, and get spoken answers backed by visible evidence or an explicit refusal.

This repo is intentionally positioned as a serious demo and early-pilot handoff. It is polished enough to run, review, and extend with confidence, while staying honest about what is still unfinished.

## What Jarvis Can Do Today

- Run a low-latency push-to-talk voice loop through the OpenAI Realtime API
- Answer repo questions with read-only GitHub tools
- Answer live weather questions with freshness enforcement
- Recall prior sessions from stored summaries and embeddings
- Store and apply standing user preferences
- Draft read-only fix plans, PR outlines, and comment drafts
- Show transcript, tool activity, evidence freshness, and proposals in a lightweight companion UI

## What Is Intentionally Not Built Yet

- No GitHub write actions, PR creation, comments, or merges
- No multi-tenant auth or durable identity system
- No full relay e2e suite against live providers
- No production-grade deployment manifests or split-domain client configuration
- No mobile client, passive wake word, or approval execution flow yet

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL with `pgvector`
- OpenAI API key
- GitHub PAT
- OpenWeatherMap API key
- Redis is optional

### Setup

```bash
pnpm install
cp .env.example server/.env
pnpm --filter server db:push
pnpm dev
```

Open `http://localhost:5173`.

If you want a seeded conversation history for demo walkthroughs:

```bash
pnpm --filter server seed-demo
```

## Environment

`server/.env` should contain:

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Realtime relay and session summaries |
| `DATABASE_URL` | Yes | PostgreSQL with `pgvector` enabled |
| `GITHUB_TOKEN` | Yes | Read-only GitHub repo access |
| `OPENWEATHERMAP_API_KEY` | Yes | Live weather tool |
| `PORT` | No | Defaults to `3001` |
| `REDIS_URL` | No | Optional cache and poller support |
| `JWT_SECRET` | No | Auto-generated for local demos if omitted |

## Useful Commands

```bash
pnpm dev             # Run server + client locally
pnpm test            # Unit tests
pnpm lint            # Biome lint + format check
pnpm typecheck       # TypeScript checks
pnpm build           # Production build for server + client
pnpm verify          # Full local verification: typecheck + lint + test + build
pnpm run ci          # Legacy alias for verify
```

Use `pnpm verify` for full local checks. `pnpm ci` is a pnpm builtin, not the repo verification command.

## Demo Walkthrough

1. Press and hold the talk button.
2. Ask: “What changed in `vercel/next.js`?”
3. Ask: “What’s the weather in Dallas right now?”
4. Ask: “What did we discuss yesterday?”
5. Ask: “Propose a fix plan for issue 123 in `owner/repo`.”
6. Open the info drawer to review preferences and recent sessions.

## Architecture at a Glance

- `shared/`: wire protocol, evidence shape, audio/session constants
- `server/`: Fastify relay, auth, persistence, tool registry, GitHub/weather/memory tools
- `client/`: React companion UI, push-to-talk state machine, audio capture/playback
- `docs/`: product, system, architecture, testing, deployment, and research notes

The core architecture is browser -> Fastify relay -> OpenAI Realtime API, with tool execution and evidence enforcement on the server side.

## Honest Deployment Story

Jarvis is currently best suited to:

- Local demo use with `pnpm dev`
- Same-origin deployments where the client and API share one public hostname

The current client assumes same-origin `/api` and `/ws` paths in production. That is acceptable for a serious demo, but split-domain deployment still needs one follow-up change. See [Deployment](docs/DEPLOYMENT.md) for the lightest recommended path and its caveats.

## Known Limitations

- Companion REST routes use anonymous demo identities rather than a real auth system
- Health check is liveness-oriented, not a full dependency readiness probe
- Realtime relay behavior is covered by unit tests only in supporting utilities, not by live provider integration tests
- Audio downsampling fallback is intentionally simple and may need refinement for broader device coverage

## Docs

- [Architecture](docs/architecture.md)
- [Development](docs/DEVELOPMENT.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [System](docs/SYSTEM.md)
- [PRD](docs/PRD.md)
- [Decisions](docs/decisions.md)
- [Polish Research Memo](docs/codex-5.4-research.md)
