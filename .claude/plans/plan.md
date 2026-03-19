# Deployment Plan

**Date**: 2026-03-19
**Research sources**: `.claude/plans/research.md`, `.claude/plans/railway-deployment-research.md`, `docs/codex-deploy-research.md`

---

## Summary

Deploy Jarvis as a single Railway web service (API + WebSocket + SPA) backed by managed PostgreSQL (pgvector) and Redis, with deployment triggered exclusively from GitHub Actions against a protected `production` environment. The core architectural decision is: **one service, one origin, one deploy path** — the server already serves both the API and client SPA, the client already uses same-origin requests, and Railway's shared-monorepo model is a natural fit. Before deployment can work, three code-level blockers must be fixed: the `@jarvis/shared` package crashes Node at runtime (it exports raw `.ts`), the WebSocket relay has no keepalive pings (Railway drops idle connections after ~60s), and the database has no committed migrations (`drizzle-kit push` is too implicit for CI/CD).

---

## Current State

### Server entry point (`server/src/index.ts`)
Fastify server that loads config, connects to Postgres/Redis, registers tools and routes, serves `client/dist` via `@fastify/static` with SPA fallback, and listens on `0.0.0.0:${PORT}`. Graceful shutdown with 5s summary-job drain. Start command: `node dist/index.js`.

### Shared package (`shared/package.json`)
Exports raw TypeScript source: `"main": "./src/index.ts"`. Has no build script. Works under `tsx` (dev) and `tsc --noEmit` (typecheck) but **crashes Node at runtime** because `node` cannot import `.ts` files. Two server files import runtime values from shared: `idle.ts` (imports `SESSION`) and `auth.ts` (imports `SESSION`). Two other server files use `import type` only — these are erased by `tsc` and are not affected.

### Config (`server/src/config.ts`)
4 required env vars (`OPENAI_API_KEY`, `DATABASE_URL`, `GITHUB_TOKEN`, `OPENWEATHERMAP_API_KEY`), 3 optional (`PORT` defaults 3001, `REDIS_URL` defaults `redis://localhost:6379`, `JWT_SECRET` auto-generated). No `NODE_ENV` awareness. No distinction between dev and production behavior.

### Health endpoint (`server/src/routes/health.ts`)
`GET /api/health` always returns `{ status: "ok", timestamp }` — liveness only, does not check database or Redis connectivity.

### WebSocket relay (`server/src/services/relay.ts`)
Connects to `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini`. Relays audio, transcripts, tool calls between client and OpenAI. **No ping/pong frames anywhere** — zero keepalive implementation. Railway enforces ~60s TCP idle timeouts.

### Database (`server/src/db/schema.ts`, `server/drizzle.config.ts`)
4 tables: `users`, `sessions`, `messages`, `session_summaries`. The `session_summaries` table has a `vector(1536)` column requiring the `pgvector` extension. Schema is applied via `drizzle-kit push` (no migration files exist — `server/drizzle/` directory is empty/absent). `drizzle.config.ts` outputs to `./drizzle` directory.

### CI (`.github/workflows/ci.yml`)
Single `verify` job on push-to-main and PRs: checkout → pnpm → Node → install → `pnpm verify`. No deployment step. No `permissions` block. No `concurrency` control.

### Client (`client/src/hooks/useVoiceSession.ts`)
Uses same-origin `fetch("/api/...")` and `window.location.host` for WebSocket URL — already correct for single-service deployment.

### OpenAI API surfaces used (from `docs/codex-deploy-research.md`)

| Surface | Code path | Model |
|---------|-----------|-------|
| Realtime voice session | `relay.ts` | `gpt-realtime-mini` |
| Input transcription | `relay.ts` (session config) | `gpt-4o-mini-transcribe` |
| Chat Completions (summaries) | `summary.ts` | `gpt-4o-mini` |
| Chat Completions (proposals) | `github-proposals.ts` | `gpt-4o-mini` |
| Embeddings (memory search) | `summary.ts`, `memory.ts` | `text-embedding-3-small` |

The OpenAI API key must have access to Realtime, Chat Completions, and Embeddings APIs.

---

## Files to Change

### `shared/package.json`
Add `"build": "tsc"` script. Update `"main"` to `"./dist/index.js"` and `"exports"` to `{ ".": "./dist/index.js" }`. Keep `"types": "./dist/index.d.ts"`. This fixes the CRITICAL runtime crash — Node can now import the compiled JavaScript.

### `shared/tsconfig.json`
Already has `"outDir": "./dist"` and `"rootDir": "./src"`. Verify `"declaration": true` is inherited from `tsconfig.base.json` (it is — line 13). No changes needed.

### `package.json` (root)
Update `"build"` script to build shared first: `"pnpm --filter shared build && pnpm --filter server build && pnpm --filter client build"`. The order matters: server's compiled output imports from shared's compiled output at runtime.

### `server/src/config.ts`
- Add `NODE_ENV` detection: `const isProduction = process.env.NODE_ENV === "production"`.
- When `isProduction` and `JWT_SECRET` is missing: throw instead of auto-generating.
- When `REDIS_URL` is not set: keep current default for dev, but in production log a warning that Redis is using an unreachable default (or skip connection entirely).

### `server/src/routes/health.ts`
Add `GET /api/health/ready` readiness endpoint that verifies database connectivity (run a simple query like `SELECT 1`). Railway health check should point here, not at liveness. Keep existing `/api/health` as liveness for convenience.

### `server/src/services/relay.ts`
Add WebSocket keepalive pings on the client-side connection. After `createRelaySession` sets up the OpenAI connection, start a 25-second ping interval on `clientWs`. Clear the interval on `clientWs.on("close")`. This prevents Railway's TCP idle timeout from dropping the connection during silence between voice turns.

### `server/src/services/idle.ts`
No changes needed — this file imports `SESSION` from `@jarvis/shared` which will resolve correctly once shared has a build step.

### `server/src/services/auth.ts`
No changes needed — same as idle.ts.

### `.github/workflows/ci.yml`
Harden:
- Add top-level `permissions: { contents: read }` (principle of least privilege).
- Add `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` (prevent stacking CI runs on rapid pushes).
- No other changes — the job itself is correct.

### `server/drizzle.config.ts`
No changes needed. Already configured with `out: "./drizzle"` and `dialect: "postgresql"`.

### `server/package.json`
Add `"db:migrate": "drizzle-kit migrate"` script alongside the existing `"db:push"`.

---

## Files to Create

### `railway.toml` (repo root)
Config-as-code for Railway. Defines build command, start command, pre-deploy command (migrations), health check path, restart policy. Pattern: follows Railway's config-as-code reference.

```toml
[build]
builder = "RAILPACK"
buildCommand = "pnpm install --frozen-lockfile && pnpm build"
watchPatterns = [
  "/client/**",
  "/server/**",
  "/shared/**",
  "/package.json",
  "/pnpm-lock.yaml",
  "/pnpm-workspace.yaml",
  "/.nvmrc"
]

[deploy]
startCommand = "node server/dist/index.js"
healthcheckPath = "/api/health/ready"
healthcheckTimeout = 120
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
```

Note: `preDeployCommand` will be added in M2 after migrations exist. The `buildCommand` includes `pnpm install` because Railpack needs it for monorepo workspace resolution.

### `.env.example` (repo root)
Template documenting every variable, its purpose, and whether it's required. Follows the `.gitignore` allowlist pattern (`!.env.example`).

### `.github/workflows/deploy-production.yml`
Production deployment workflow. Triggers on push to `main` and `workflow_dispatch`. Two jobs: `verify` (same as ci.yml) and `deploy` (needs verify, bound to GitHub environment `production`, runs `railway up` via Railway CLI). Pattern: follows GitHub's workflow security guidance — explicit permissions, concurrency control, environment protection.

### `server/drizzle/0000_initial.sql` (generated)
Initial migration file generated by `drizzle-kit generate`. Will contain `CREATE TABLE` statements for all 4 tables. Must be manually edited to prepend `CREATE EXTENSION IF NOT EXISTS vector;` before the `session_summaries` table creation (pgvector must exist before the `vector(1536)` column can be created).

### `docs/DEPLOYMENT.md`
Complete deployment guide: Railway setup, service topology, variable configuration, GitHub environment setup, first-deploy walkthrough, and ongoing operations.

---

## Milestone Outline

### Phase 1: Code Readiness

- [x] **M1: Production code hardening** — Fix all code-level blockers that prevent the app from running in a hosted environment
  - [x] Step 1 — Fix shared package build: add `build` script, update `main`/`exports`/`types` to `./dist/*`, update root build to build shared first
  - [x] Step 2 — WebSocket keepalive pings: add 25s ping interval on clientWs in relay.ts, clear on close
  - [x] Step 3 — Production config hardening: add NODE_ENV detection, throw on missing JWT_SECRET in prod, warn about Redis localhost in prod
  - [x] Step 4 — Readiness health endpoint: add `GET /api/health/ready` that checks DB connectivity via `sql\`SELECT 1\``
  - [x] Step 5 — Create `.env.example` documenting all variables
  Commit: 895b9d2 "feat: production code hardening — shared build, keepalive, config, readiness"

- [x] **M2: Database migrations** — Replace `drizzle-kit push` with committed, automatable migration files
  - [x] Step 1 — Generate initial migration: `cd server && pnpm exec drizzle-kit generate --name initial` → verify: `server/drizzle/0000_initial.sql` exists with 4 CREATE TABLE statements
  - [x] Step 2 — Prepend `CREATE EXTENSION IF NOT EXISTS vector;` to generated SQL → verify: first non-empty line is the CREATE EXTENSION statement
  - [x] Step 3 — Add `"db:migrate": "drizzle-kit migrate"` script to `server/package.json` → verify: `pnpm --filter server run --list` shows db:migrate
  - [x] Step 4 — Create `railway.toml` at repo root with build/deploy/health config including `preDeployCommand` for migrations → verify: file exists with correct structure
  - [x] Step 5 — Run `pnpm verify` → verify: typecheck, lint, test, build all pass
  Commit: "feat: add database migrations and railway.toml deployment config"

### Phase 2: Deployment Pipeline

- [x] **M3: CI/CD and deployment infrastructure** — Complete the deployment pipeline from code to production
  - [x] Step 1 — Harden `ci.yml`: add `permissions: { contents: read }` and `concurrency` block → verify: YAML valid, `pnpm verify` passes
  - [x] Step 2 — Create `deploy-production.yml`: verify+deploy jobs, `environment: production`, Railway CLI deploy → verify: YAML valid, correct secret/variable references
  - [x] Step 3 — Rewrite `docs/DEPLOYMENT.md`: complete standalone guide covering Railway setup, env vars, GitHub environment, first-deploy checklist, operations, troubleshooting → verify: covers all 11 manual setup tasks from plan
  - [x] Step 4 — Run `pnpm verify` → verify: 30 tests pass, typecheck, lint, build all green
  Commit: "feat: add production deploy workflow and deployment guide"

---

## Testing Strategy

### M1: Production code hardening
- **Shared package build**: Add a test to the root or CI that verifies `node -e "require('@jarvis/shared')"` succeeds after build (or `import()` for ESM). This catches the exact regression that currently exists.
- **Config hardening**: Update existing `server/src/config.test.ts` to cover the new `NODE_ENV=production` behavior — verify `JWT_SECRET` is required, verify Redis URL handling.
- **Health readiness**: Add a test for `/api/health/ready` that mocks the database query (or verifies it returns 503 when db is unreachable). Follow the pattern in existing route tests.
- **WebSocket keepalive**: Hard to unit test in isolation. Verify by code review that `setInterval`/`clearInterval` are paired correctly. The real validation is deploying and observing connections survive >60s idle.

### M2: Database migrations
- Verify migration files are committed and not empty.
- Verify `drizzle-kit migrate` runs without error against a fresh database (requires a database — this is an integration-level check, likely manual for the first deploy).

### M3: CI/CD
- Verify workflow YAML is syntactically valid.
- Verify the deploy workflow references the correct environment name and secrets.
- Real validation: push to main and observe the full pipeline.

---

## Migration & Rollback

### Database
- **Forward**: `drizzle-kit migrate` applies pending migrations. The initial migration creates all tables from scratch. The `CREATE EXTENSION vector` statement is idempotent (`IF NOT EXISTS`).
- **Rollback**: Drizzle does not auto-generate down migrations. For the initial migration, rollback is "drop all tables" — acceptable since this is a fresh production database with no existing data. For future schema changes, down migrations should be written alongside up migrations if the change is destructive.
- **Safety**: The pre-deploy command runs migrations before the new version receives traffic (Railway zero-downtime deploys). If migration fails, the deploy is aborted and the old version continues serving.

### Config changes
- **Forward**: New env vars (`NODE_ENV`) are additive. Existing behavior is preserved when `NODE_ENV` is unset (dev mode).
- **Rollback**: Remove the env var. The code falls back to dev behavior.

---

## Manual Setup Tasks

These actions cannot be automated in code. Each is tagged with the milestone that depends on it.

### Before M1

1. **OpenAI API key** — Create or verify an API key at https://platform.openai.com/api-keys. The account must have:
   - Billing enabled
   - Access to Realtime API, Chat Completions, and Embeddings
   - Models used: `gpt-realtime-mini`, `gpt-4o-mini`, `gpt-4o-mini-transcribe`, `text-embedding-3-small`

2. **GitHub fine-grained PAT** — Create at https://github.com/settings/personal-access-tokens. Scoped to specific repositories with minimum permissions:
   - `Metadata: Read`
   - `Issues: Read`
   - `Pull requests: Read`
   - Note: this is NOT the GitHub Actions `GITHUB_TOKEN` — it's the app's own API credential.

3. **OpenWeatherMap API key** — Create at https://home.openweathermap.org/api_keys. Free tier is sufficient. **Warning**: new keys take up to 2 hours to activate.

4. **JWT secret** — Generate locally: `openssl rand -base64 32`. Any random string works.

### Before M3

5. **Railway project setup** — Create a Railway project with 3 services:
   - **Web service**: Deploy from GitHub repo. Do NOT set a root directory (shared monorepo pattern).
   - **PostgreSQL**: Use the pgvector template (https://railway.com/deploy/pgvector-latest). After provisioning, run `CREATE EXTENSION IF NOT EXISTS vector;` in the Railway SQL console.
   - **Redis**: Add via Railway dashboard.

6. **Railway service variables** — Set on the web service:

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway variable reference — auto-updates |
   | `REDIS_URL` | `${{Redis.REDIS_PRIVATE_URL}}` | Internal network URL |
   | `OPENAI_API_KEY` | (from step 1) | |
   | `JWT_SECRET` | (from step 4) | |
   | `GITHUB_TOKEN` | (from step 2) | |
   | `OPENWEATHERMAP_API_KEY` | (from step 3) | |
   | `NODE_ENV` | `production` | |
   | `PORT` | **Do NOT set** | Railway auto-injects this |

7. **Railway project token** — Generate at Railway project → Settings → Tokens. This is a project-scoped token for CI deployment.

8. **GitHub repository environment** — Create an environment named `production` in the repo settings:
   - Enable "Required reviewers" (optional but recommended — prevents accidental deploys)
   - Add environment **secret**: `RAILWAY_TOKEN` (from step 7)
   - Add environment **variables**:
     - `RAILWAY_SERVICE_NAME` — the Railway web service name or ID
     - `RAILWAY_ENVIRONMENT_NAME` — typically `production`

### After M3 (first deploy)

9. **Database schema** — Run migrations against production via Railway CLI:
   ```bash
   railway run pnpm --filter server db:migrate
   ```
   Or: the `preDeployCommand` in `railway.toml` will run this automatically on deploy. Verify it succeeds in the deploy logs.

10. **Seed data (optional)** — For demo purposes:
    ```bash
    railway run pnpm --filter server seed-demo
    ```

11. **Domain verification** — Railway auto-generates a `*.up.railway.app` domain. Verify the app is reachable at `https://<service>.up.railway.app/api/health/ready`.

---

## Risks

### 1. Railway CLI flags may differ from research assumptions
**Likelihood**: Medium. Both research docs note that the exact `railway up` flags should be verified at implementation time.
**Mitigation**: During M3 implementation, run `npx @railway/cli@latest up --help` to confirm the flag names for service/environment targeting. The Railway MCP server tools are also available for verification.

### 2. Railpack may not correctly build the pnpm monorepo
**Likelihood**: Low. Railway's docs claim native pnpm workspace support, and the `buildCommand` override is explicit.
**Mitigation**: If Railpack fails, fall back to a `Dockerfile` (standard Node multi-stage build). The `railway.toml` supports `builder = "DOCKERFILE"`.

### 3. pgvector extension availability
**Likelihood**: Low. Railway offers a dedicated pgvector template.
**Mitigation**: Verify the template is available at https://railway.com/deploy/pgvector-latest before starting setup. If unavailable, use any PostgreSQL provider that supports pgvector (Neon, Supabase, etc.) and set `DATABASE_URL` manually.

### 4. Initial migration may not match existing dev database
**Likelihood**: Medium. If `drizzle-kit generate` is run against a database that already has tables, it may generate an empty migration. It should be run against an empty database or with `--force` to generate from the schema definition.
**Mitigation**: Generate the migration, manually verify the SQL contains all 4 `CREATE TABLE` statements, and test against a fresh local database.

### 5. OpenAI Realtime API access restrictions
**Likelihood**: Low-Medium. Not all OpenAI plans include Realtime API access.
**Mitigation**: Verify access before deployment (manual step 1). If the account doesn't have Realtime access, the server will start but WebSocket sessions will fail on connect — the error will be visible in logs.

### 6. CORS allows all origins in production
**Likelihood**: Accepted risk. Current config is `cors({ origin: true })` which allows any origin.
**Impact**: Low for a demo project. Any website could make API calls to the server.
**Mitigation**: Not blocking deployment. Can be addressed later by restricting `origin` to the Railway domain when `NODE_ENV === "production"`.

### 7. Single-replica constraint
**Likelihood**: N/A for demo.
**Impact**: Session state, weather poller, and summary job queue are all in-memory singletons. Cannot scale horizontally.
**Mitigation**: Run a single replica. Document the constraint.

---

## Open Questions

1. **Deploy trigger preference**: The two research documents disagree on whether to use Railway's "Wait for CI" auto-deploy (simpler, fewer secrets) or explicit GitHub Actions deployment via `railway up` (more control, more visible). This plan uses explicit GitHub Actions deployment per the codex research's reasoning that the deploy path should be visible and reviewable in GitHub, not split across platform UIs. **Confirm this is the preferred approach.**

2. **Redis: required or optional in production?** The codex research recommends treating Redis as required for clarity (no localhost fallback in cloud). The current code gracefully degrades without it. This plan treats Redis as "required in practice" (provision it, set the variable) but does not add a hard startup check. **Confirm whether you want a hard failure if Redis is unreachable in production.**

3. **Environment protection**: The plan suggests enabling "Required reviewers" on the GitHub `production` environment. This means every push to main requires a manual approval before deploy. For a demo project, this may be unnecessary friction. **Confirm whether you want reviewer gates or just automatic deploy-on-merge.**

4. **OpenWeather geocoding**: The codex research notes that OpenWeather's built-in city-name geocoding (`?q=London`) is deprecated in favor of the Geocoding API. The current code works but is using a deprecated contract. **This is not blocking for deployment — should it be addressed in this plan or deferred?**
