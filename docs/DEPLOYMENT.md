# Deployment

## Current Recommendation

Jarvis is currently best deployed in one of two ways:

- local-only demo with `pnpm dev`
- same-origin hosted demo where the client and API share a single public hostname

That second option is the lightest plausible deployment story today.

## Why Same-Origin Is The Best Fit Right Now

The production client currently assumes:

- `/api/*` for HTTP
- `/ws/*` for WebSocket relay

That keeps the demo simple, but it means split-domain deployment still needs one small follow-up: configurable production API and WebSocket origins.

## Minimum Viable Hosted Shape

- One Fastify service for the relay and REST API
- One static client build
- One PostgreSQL instance with `pgvector`
- Optional Redis instance
- A reverse proxy or hosting layer that exposes client + API on one hostname

## Required Environment Variables

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `GITHUB_TOKEN`
- `OPENWEATHERMAP_API_KEY`

Optional:

- `REDIS_URL`
- `JWT_SECRET`
- `PORT`

## Health and Operations

- `GET /api/health` is currently a liveness-style endpoint, not a full readiness probe.
- Redis is optional; degraded cache behavior should not prevent the service from starting.
- Session summaries run asynchronously on disconnect, and shutdown now waits briefly for in-flight summary jobs before exiting.

## What Needs To Change Before A More Serious Deployment

- Add configurable production API and WebSocket origins for the client
- Add a real auth story instead of anonymous demo users
- Add live relay integration tests
- Decide whether the server should also serve the built client
- Strengthen readiness checks for DB, Redis, and outbound provider health

## Suggested Near-Term Platform Shape

If you want to host the demo now, prefer:

- managed Postgres on Railway or equivalent
- optional managed Redis
- a single app deployment behind one hostname
- a static client either proxied under that hostname or served by the same edge layer

That keeps the system honest, reviewable, and cheap without pretending it is production-hardened.
