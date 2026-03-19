---
description: Technology choices and constraints.
---
# Stack

- **Runtime**: Node.js 22+ with TypeScript 5.x
- **Frontend**: React + Vite (companion web UI); React Native + Expo (mobile, P2 stretch)
- **Backend**: Fastify
- **Database**: PostgreSQL + pgvector (conversation memory, user data, semantic search) + Redis (session/cache)
- **ORM**: Drizzle
- **AI/LLM**: OpenAI Realtime API (`gpt-realtime-mini`) via WebSocket relay
- **Audio**: WebSocket relay (PCM16 24kHz mono throughout for MVP; Opus client↔server is a later bandwidth optimization)
- **GitHub**: Octokit (`@octokit/rest` + `@octokit/graphql`)
- **Auth**: Custom JWT via `jose`
- **Styling**: N/A (minimal companion UI)
- **Tests**: Vitest
- **Package manager**: pnpm
- **Linter**: Biome
- **Deployment**: Railway (managed Postgres + Redis)
