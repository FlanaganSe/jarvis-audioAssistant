---
description: Technology choices and constraints.
---
# Stack

- **Runtime**: Node.js 22+ with TypeScript 5.x
- **Frontend**: N/A (voice-first; mobile client TBD — Kotlin/Swift bonus)
- **Backend**: Express or Fastify (TBD — choose during /research)
- **Database**: PostgreSQL (conversation memory, user data) + Redis (session/cache)
- **AI/LLM**: OpenAI Realtime API or similar (TBD — choose during /research)
- **Audio**: WebSocket-based real-time audio streaming
- **Styling**: N/A
- **Tests**: Vitest
- **Package manager**: pnpm
- **Linter**: ESLint + Prettier (or Biome)
