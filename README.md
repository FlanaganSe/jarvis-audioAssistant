# Jarvis Audio Assistant

Real-time voice assistant for frontline workers — low-latency, accurate, natural conversation with GitHub and API integrations.

## Architecture

```
Browser (React + Vite)
  ↕ WebSocket (PCM16 24kHz)
Fastify Server
  ↕ WebSocket
OpenAI Realtime API (gpt-realtime-mini)
  + Tool calls → GitHub (Octokit), OpenWeatherMap, Memory (pgvector)
  + Persistence → PostgreSQL (Drizzle) + Redis
```

## Features

- **Push-to-talk voice loop** with interruption support
- **GitHub integration** — repo briefings, PRs, issues, merges, what-changed, action proposals
- **Weather integration** — live data with 3-minute freshness enforcement
- **Cross-session memory** — keyword + semantic (pgvector) recall of past conversations
- **User preferences** — standing instructions persisted and injected into system prompt
- **Capability self-awareness** — Jarvis accurately reports what it can and cannot do
- **Zero hallucinations** — tool-first architecture; refuses rather than fabricates
- **Evidence tracking** — every data point carries source, freshness, and citation

## Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL with pgvector extension
- Redis
- API keys: OpenAI, GitHub PAT, OpenWeatherMap

## Setup

```bash
pnpm install
cp .env.example server/.env    # Fill in your API keys
pnpm --filter server db:push   # Push schema to PostgreSQL
pnpm dev                       # Starts server + client concurrently
```

## Commands

```bash
pnpm dev          # Local dev (server + client)
pnpm typecheck    # TypeScript type checking
pnpm lint         # Biome lint + format check
pnpm lint:fix     # Auto-fix lint issues
pnpm ci           # Full CI: typecheck + lint + test
pnpm build        # Production build
```

## Project Structure

```
shared/     Shared types and constants (SessionStatus, Evidence, wire protocol)
server/     Fastify backend — WebSocket relay, tools, persistence, auth
client/     React + Vite companion UI — transcript, push-to-talk, evidence cards
docs/       PRD, research, requirements, architectural decisions
```

## Key Decisions

See [docs/decisions.md](docs/decisions.md) for the architectural decision log.

## Tech Stack

TypeScript, Fastify, React + Vite, OpenAI Realtime API, PostgreSQL + pgvector, Redis, Drizzle ORM, Octokit, jose (JWT), Biome, pnpm workspaces.
