# Deployment Guide

## Architecture

Jarvis runs as a single Railway web service that serves the API (`/api/*`), WebSocket relay (`/ws/*`), and client SPA (`/*`) from one origin. Backing services are managed PostgreSQL (with pgvector) and managed Redis (optional, used for weather caching).

Deploys flow through GitHub Actions: push to `main` triggers `.github/workflows/deploy-production.yml`, which runs the full verify suite then deploys to Railway via CLI.

```
GitHub (push to main)
  → GitHub Actions: verify (typecheck, lint, test, build)
  → GitHub Actions: deploy (railway up --ci)
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
- **Disable Railway's GitHub App auto-deploy** — deploys come exclusively from the GitHub Actions workflow

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

## GitHub Environment Setup

1. Go to repo **Settings → Environments → New environment** and create `production`
2. Under **Deployment branches**, restrict to `main` only
3. Do **NOT** enable "Required reviewers" — deploys run automatically on merge
4. Add environment **secret**:
   - `RAILWAY_TOKEN` — generate at Railway project → Settings → Tokens (project-scoped token)
5. Add environment **variables**:
   - `RAILWAY_SERVICE_NAME` — the name of your Railway web service
   - `RAILWAY_ENVIRONMENT_NAME` — typically `production`

## How Deploys Work

1. Code merges to `main`
2. `.github/workflows/deploy-production.yml` triggers automatically
3. **verify** job: typecheck → lint → test → build (same checks as CI)
4. **deploy** job: installs Railway CLI, runs `railway up --ci`
5. Railway receives the source and builds using `railway.toml` config (Railpack + `pnpm install --frozen-lockfile && pnpm build`)
6. `preDeployCommand` runs database migrations (`drizzle-kit migrate`)
7. Health check polls `GET /api/health/ready` (checks DB connectivity)
8. On healthy response, traffic switches to the new version (zero-downtime)

Both `ci.yml` and `deploy-production.yml` trigger on push to main. They run independently — the deploy workflow has its own verify step and does not depend on ci.yml. The `ci.yml` workflow also runs on PRs (where deploy does not trigger).

## First Deploy Checklist

- [ ] Railway project created
- [ ] PostgreSQL (pgvector) provisioned and `CREATE EXTENSION vector` run
- [ ] Redis provisioned
- [ ] Web service created from GitHub repo (auto-deploy disabled)
- [ ] All environment variables set on the web service (see table above)
- [ ] GitHub `production` environment created with deployment branch restriction to `main`
- [ ] `RAILWAY_TOKEN` secret added to GitHub environment
- [ ] `RAILWAY_SERVICE_NAME` and `RAILWAY_ENVIRONMENT_NAME` variables added to GitHub environment
- [ ] Push to main and watch the deploy workflow in GitHub Actions
- [ ] Verify app is reachable at `https://<service>.up.railway.app/api/health/ready`

## Ongoing Operations

### Viewing logs

```bash
# Via Railway CLI (requires RAILWAY_TOKEN or login)
railway logs --service <service-name> --environment production

# Via GitHub Actions
# Each deploy run shows build and deploy logs in the Actions tab
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

Trigger a deploy without pushing code via the GitHub Actions UI:
1. Go to **Actions → Deploy Production → Run workflow**
2. Select the `main` branch
3. Click **Run workflow**

### Rollback

To roll back to a previous version:
1. Find the commit to roll back to in git history
2. Push that commit to `main` (via revert commit or reset)
3. The deploy workflow triggers and deploys the older code

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
