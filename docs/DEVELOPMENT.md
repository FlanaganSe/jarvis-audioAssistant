# Development

## Local Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL with `pgvector`
- OpenAI, GitHub, and OpenWeatherMap credentials
- Redis only if you want cache behavior locally

## First Run

```bash
pnpm install
cp .env.example server/.env
pnpm --filter server db:push
pnpm dev
```

Client dev server: `http://localhost:5173`

Server API: `http://localhost:3001`

## Demo Data

To seed a reusable demo user and one historical session:

```bash
pnpm --filter server seed-demo
```

The script prints a `localStorage` command you can paste into the browser if you want to reuse that seeded demo identity.

## Daily Commands

```bash
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify
```

`pnpm verify` is the supported full-check command. `pnpm run ci` is kept as a legacy alias.

## Local Workflow Notes

- The client auto-connects on load and re-registers the stored demo user if it still exists.
- If you reset the database, the next connection creates a fresh anonymous demo user automatically.
- Redis connection failures are non-fatal by design.
- The push-to-talk path uses browser microphone permissions, so test in a browser context with mic access enabled.

## Troubleshooting

### App boots but voice does not work

- Confirm microphone permissions in the browser.
- Confirm the server has a valid `OPENAI_API_KEY`.
- Watch the browser console for `WebSocket connection error` or microphone failures.

### Preferences or session history do not load

- Confirm the server is running and the websocket session connected successfully.
- These routes now require the same bearer token the client gets during session setup.

### Weather works slowly without Redis

- That is expected. Redis is optional and only improves cache behavior and background refreshing.
