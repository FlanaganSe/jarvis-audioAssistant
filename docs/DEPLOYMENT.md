# Deployment Guide

## Architecture

Jarvis runs as a single Railway web service that serves the API (`/api/*`), WebSocket relay (`/ws/*`), and client SPA (`/*`) from one origin. Backing services are managed PostgreSQL (with pgvector) and managed Redis (optional, used for weather caching).

Deploys use Railway's "Wait for CI" feature: pushes to `main` trigger GitHub Actions CI, and Railway auto-deploys only after CI passes.

```
GitHub (push to main)
  → GitHub Actions CI: typecheck → lint → test → build
  → Railway "Wait for CI": waits for CI to pass
    → Railway: build (Railpack + pnpm)
    → Railway: pre-deploy (database migrations)
    → Railway: health check (/api/health/ready)
    → Railway: traffic switch (zero-downtime)
```

## Prerequisites

- **Railway account** — Hobby plan (~$5-15/month depending on usage)
- **GitHub repository** — `FlanaganSe/jarvis-audioAssistant`
- **OpenAI API key** — needs access to Realtime, Chat Completions, and Embeddings APIs. Models used: `gpt-realtime-mini`, `gpt-4o-mini`, `gpt-4o-mini-transcribe`, `text-embedding-3-small`
- **GitHub fine-grained PAT** — scoped to target repositories with `Metadata: Read`, `Issues: Read`, `Pull requests: Read` permissions. This is the app's own API credential, not the Actions `GITHUB_TOKEN`.
- **OpenWeatherMap API key** — free tier is sufficient. New keys take up to 2 hours to activate.
- **JWT secret** — generate with `openssl rand -base64 32`

## Railway Project Setup

### 1. Create project

Create a new project in the Railway dashboard.

### 2. Add PostgreSQL with pgvector

Use the pgvector template: deploy from the Railway dashboard or use the pgvector-latest template.

After the database provisions, open the Railway SQL console and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This is required before the initial migration can create the `session_summaries` table (which has a `vector(1536)` column).

### 3. Add Redis

Add a Redis service from the Railway dashboard. Redis is used for weather caching only — the app degrades gracefully if Redis is unreachable.

### 4. Create web service from GitHub repo

- Connect the GitHub repository
- Do **NOT** set a root directory (the monorepo build uses pnpm workspaces from the repo root)
- Railway auto-detects `railway.toml` and uses its build/deploy configuration
- Enable **"Wait for CI"** in Railway service settings — Railway will wait for GitHub Actions CI to pass before deploying

## Environment Variables

Set these on the Railway **web service** (not on PostgreSQL or Redis):

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Yes | Railway variable reference — auto-updates if DB moves |
| `REDIS_URL` | `${{Redis.REDIS_PRIVATE_URL}}` | No | Internal network URL; app works without it |
| `OPENAI_API_KEY` | `sk-...` | Yes | Needs Realtime + Chat + Embeddings access |
| `JWT_SECRET` | (random 32+ chars) | Yes (prod) | Generate: `openssl rand -base64 32` |
| `GITHUB_TOKEN` | `github_pat_...` | Yes | Fine-grained PAT with Metadata/Issues/PRs Read |
| `OPENWEATHERMAP_API_KEY` | `...` | Yes | Free tier; new keys take ~2hrs to activate |
| `NODE_ENV` | `production` | Recommended | Enforces JWT_SECRET requirement; app starts without it but skips prod safety checks |
| `PORT` | **Do NOT set** | — | Railway auto-injects this |

## How Deploys Work

1. Code merges to `main`
2. GitHub Actions CI (`.github/workflows/ci.yml`) runs: typecheck → lint → test → build
3. Railway detects CI passed via "Wait for CI" and starts a deploy
4. Railway builds using `railway.toml` config (Railpack + `pnpm install --frozen-lockfile && pnpm build`)
5. `preDeployCommand` runs database migrations (`drizzle-kit migrate`)
6. Health check polls `GET /api/health/ready` (checks DB connectivity)
7. On healthy response, traffic switches to the new version (zero-downtime)

## First Deploy Checklist

- [ ] Railway project created
- [ ] PostgreSQL (pgvector) provisioned and `CREATE EXTENSION vector` run
- [ ] Redis provisioned
- [ ] Web service created from GitHub repo with "Wait for CI" enabled
- [ ] All environment variables set on the web service (see table above)
- [ ] Push to main and verify CI passes, then watch Railway deploy
- [ ] Verify app is reachable at `https://<service>.up.railway.app/api/health/ready`

## Ongoing Operations

### Viewing logs

```bash
# Via Railway CLI (requires login)
railway logs --service <service-name> --environment production

# Via Railway dashboard
# Build and deploy logs are visible per deployment
```

### Database migrations

Migrations run automatically via the `preDeployCommand` in `railway.toml` on every deploy. To run manually:

```bash
railway run pnpm --filter server db:migrate
```

Migration files are in `server/drizzle/`. New migrations are generated with:

```bash
cd server && pnpm exec drizzle-kit generate --name <migration-name>
```

### Manual deploy

Trigger a deploy without pushing code from the Railway dashboard: select a previous deployment and redeploy, or use the Railway CLI:

```bash
railway up
```

### Rollback

To roll back to a previous version:
1. Find the commit to roll back to in git history
2. Push that commit to `main` (via revert commit or reset)
3. CI passes, Railway auto-deploys the older code

Railway also supports redeploying previous deployments from its dashboard.

## Constraints

- **Single replica only** — session state, weather poller, and summary job queue are in-memory singletons. Do not scale to multiple replicas.
- **WebSocket keepalive** — the server sends 25-second ping frames to prevent Railway's TCP idle timeout (~60s) from dropping connections during silence between voice turns. Already implemented.
- **CORS** — allows all origins (`cors({ origin: true })`). Acceptable for a demo project.
- **No staging environment** — this is a demo project with a single `production` environment.

## Troubleshooting

### Deploy fails at health check

The health check endpoint is `GET /api/health/ready`, which verifies database connectivity.

- Check deploy logs for database connection errors
- Verify `DATABASE_URL` is set correctly (should use Railway variable reference `${{Postgres.DATABASE_URL}}`)
- Verify the PostgreSQL service is running
- The health check timeout is 120 seconds — if the app takes longer to start, increase `healthcheckTimeout` in `railway.toml`

### Migration fails

The `preDeployCommand` runs `drizzle-kit migrate` before the new version starts.

- Check deploy logs for the specific SQL error
- If the pgvector extension is missing: run `CREATE EXTENSION IF NOT EXISTS vector;` in the Railway SQL console
- If a migration has already been partially applied: check the `__drizzle_migrations` table in the database

### WebSocket connections drop

- Verify the client is connecting to the correct WebSocket URL (same origin, `/ws/*` path)
- Check Railway logs for connection errors
- The server sends keepalive pings every 25 seconds — if connections still drop, Railway may have changed their timeout policy

### Redis unavailable

Redis is optional. If unavailable:
- Weather data will be fetched directly from the API on each request (no caching)
- The app logs a warning but continues to function
- Check that `REDIS_URL` uses the internal network URL (`${{Redis.REDIS_PRIVATE_URL}}`) not the public URL
