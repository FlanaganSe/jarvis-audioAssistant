# Jarvis Polish Pass — Implementation Plan

**Date:** 2026-03-19
**Status:** Ready for review
**Inputs:** `.claude/plans/research.md`, `docs/codex-5.4-research.md`, full codebase audit

---

## Summary

There are two distinct categories of work:

1. **Codex 5.4 left ~726 lines of uncommitted changes** across 18 modified files plus 15 new files. These changes are well-structured (CI workflow, tests, bearer auth, auto-connect, UI polish, docs, graceful shutdown), pass all checks (`typecheck`, `lint`, `test`, `build` all green), and align with the polish goals. They need review, minor fixes, and a clean commit.

2. **Remaining gaps after Codex** that neither the original codebase nor the Codex pass addressed: production static file serving, the dead `status` wire type, additional high-value tests (weather freshness, memory keyword matching, config validation), and small doc/code divergences.

The plan is two milestones: first review and land the Codex changes safely, then layer on the remaining high-leverage improvements. Both milestones are independently verifiable and committable.

---

## Current State (What Exists Right Now)

**Committed (`fe1fd6d`):** Working monorepo with 14 tools, relay, companion UI, 0 tests, 0 CI, REST routes using bare `userId` query params, no auto-connect, no `pnpm verify`, stale `server/.env.example`.

**Uncommitted (Codex 5.4 changes):** The following changes sit as dirty working tree state:
- `.github/workflows/ci.yml` — new CI pipeline running `pnpm verify`
- `.nvmrc` — pins Node 22
- `vitest.config.ts` — root-level vitest config pointing at `server/src/**/*.test.ts`
- `server/src/services/http-auth.ts` — bearer token extraction/verification
- `server/src/services/summary-jobs.ts` — graceful shutdown for in-flight summaries
- 4 test files: `auth.test.ts`, `http-auth.test.ts`, `summary-jobs.test.ts`, `tool-registry.test.ts` (10 tests total)
- `docs/architecture.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`
- Modified `server/src/index.ts` — shutdown now waits for summary jobs, routes pass `config`
- Modified `server/src/routes/auth.ts` — token endpoint validates userId exists
- Modified `server/src/routes/preferences.ts` — bearer auth via `authenticateBearerToken()`
- Modified `server/src/routes/sessions.ts` — bearer auth
- Modified `server/src/services/relay.ts` — summary jobs queued via `queueSummaryJob()`
- Modified `client/src/hooks/useVoiceSession.ts` — auto-connect, `authToken` state, cleanup on unmount
- Modified `client/src/App.tsx` — hero block, passes `authToken` to InfoDrawer
- Modified `client/src/components/InfoDrawer.tsx` — bearer auth, loading/error states
- Modified `client/src/components/Transcript.tsx` — status-aware empty states
- Modified `client/src/components/StatusBar.tsx` — cleaner status labels
- Modified other client components — minor polish
- Modified `README.md` — full rewrite with demo walkthrough, honest limitations
- Modified `package.json` — added vitest, `verify` script, `engines`, `packageManager`
- Deleted `server/.env.example`

**Verification of Codex changes (run today):**
| Check | Result |
|-------|--------|
| `pnpm typecheck` | Pass (3 packages) |
| `pnpm lint` | Pass (69 files) |
| `pnpm test` | Pass (10 tests, 4 files, 573ms) |
| `pnpm build` | Pass (server tsc + client vite) |

---

## Files to Change

### M1: Review and Commit Codex Changes

These files are already modified. M1 reviews them for correctness and commits.

| File | Change | Why |
|------|--------|-----|
| `shared/src/types.ts` | Remove dead `status` variant from `ServerMessage` union | Never sent by server, never handled by client. Dead code confuses readers. |
| `client/src/components/SessionControls.tsx` | Verify `connectedAt` prop is used correctly | Codex added it; confirm it renders properly |
| All 18 modified + 15 new files | Review for correctness, commit | Land the Codex polish pass cleanly |

### M2: Remaining High-Leverage Improvements

| File | Change | Why |
|------|--------|-----|
| `server/src/services/weather.test.ts` | New test: freshness enforcement logic | Weather freshness is a core trust guarantee (3-min SLA). Currently untested. |
| `server/src/tools/memory.test.ts` | New test: keyword matching, timeframe filtering | Memory recall is a P0 requirement. Keyword matching logic is non-trivial. |
| `server/src/config.test.ts` | New test: required vars throw, optional vars default | Config validation is the first thing that runs. Should be verified. |
| `server/src/index.ts` | Add `@fastify/static` to serve `client/dist/` in production | No mechanism to serve client build outside Vite dev proxy. Blocks any deployment. |
| `server/package.json` | Add `@fastify/static` dependency | Required for static file serving. |
| `docs/PRD.md` | Remove ApiCache/GitHubCache from data model section | These tables were never implemented. Doc/code divergence. |
| `.env.example` | Add comment noting pgvector requirement | New devs hit opaque errors when pgvector extension is missing. |

---

## Files to Create

### M2

| File | Purpose |
|------|---------|
| `server/src/services/weather.test.ts` | Tests for weather tool freshness logic (cache fresh/stale/missing paths) |
| `server/src/tools/memory.test.ts` | Tests for keyword matching, timeframe date math |
| `server/src/config.test.ts` | Tests for env var validation |

---

## Milestone Outline

### M1: Review and land Codex 5.4 changes

**Goal:** Get the uncommitted Codex polish pass reviewed, verified, and committed as a clean baseline.

- [ ] M1: Review and commit Codex 5.4 polish pass — clean baseline with CI, tests, auth, docs, and UX improvements

**What this covers:**
- Review all 33 changed/new files for correctness
- Remove dead `status` variant from `ServerMessage` (the one concrete code fix beyond Codex)
- Run full verification (`pnpm verify`)
- Commit with clear message

**Verification:** `pnpm verify` passes (typecheck + lint + test + build). CI workflow is present and syntactically correct.

---

### M2: Remaining high-leverage improvements

**Goal:** Add the test coverage and deployment capability that Codex didn't cover, without overengineering.

- [ ] M2: Additional tests + production static serving — close the highest-value remaining gaps

**What this covers:**
- Add 3 new test files (weather freshness, memory keyword matching, config validation) — estimated ~6-10 new tests
- Add `@fastify/static` for serving `client/dist/` in production mode
- Fix doc/code divergences (PRD data model, pgvector note in .env.example)
- Run full verification

**Verification:** `pnpm verify` passes. New tests cover the three highest-risk untested paths. `pnpm build && pnpm --filter server start` serves both API and client from a single process.

---

## Manual Setup Tasks

None required. All changes are code/config/docs. The developer's existing local setup (PostgreSQL, Redis, API keys) is sufficient.

---

## Risks

### Low risk, high confidence

1. **Codex changes already pass all checks.** The 10 tests, typecheck, lint, and build all pass. The changes are well-scoped and reversible.

2. **Removing the `status` ServerMessage variant** is safe — grep confirms it's never constructed on the server or handled on the client. It's a dead type.

3. **Adding `@fastify/static`** is a well-understood Fastify plugin. It only activates when `client/dist/` exists (production build). In dev mode, the Vite proxy still handles serving.

### Medium risk, needs care

4. **Weather freshness tests** need to mock `cacheGet`/`cacheSet` and the `fetch` API. The weather tool creates a closure over `config.openweathermapApiKey`, so testing requires either dependency injection refactoring or module-level mocking. **Approach:** Use vitest's `vi.mock()` to mock `../services/cache.js` and global `fetch`. This is standard vitest pattern and doesn't require changing production code.

5. **Memory keyword matching tests** need a mock Drizzle `db` object. The memory tool does SQL queries via Drizzle. **Approach:** Test the `keywordMatch` helper function directly (it's a pure function operating on `SummaryRow` objects) rather than mocking the full DB layer. This may require exporting the helper — a minor, safe change.

6. **`@fastify/static` path resolution** must correctly find `client/dist/` relative to the server entry point. In dev (tsx), `__dirname` approximation via `import.meta.url` differs from production (`node dist/index.js`). **Approach:** Use `path.resolve()` from the project root, not relative to the server file.

### What this plan does NOT do

- Does not add live relay integration tests (high complexity, needs OpenAI API mock or real keys)
- Does not add client-side React tests (needs JSDOM, React Testing Library setup)
- Does not add Dockerfile or Railway config (deployment docs cover the manual path)
- Does not add auth middleware for all REST endpoints (demo auth posture is documented and accepted)
- Does not add configurable production API/WS origins for split-domain deployment
- All of these are documented as future work in the existing docs

---

## Resolved Decisions

1. **Codex changes → single commit.** One coherent "polish pass" commit with a clear message.
2. **Static serving → always register.** Register `@fastify/static` unconditionally; it naturally no-ops when `client/dist/` doesn't exist (dev mode uses Vite proxy).
3. **Export `keywordMatch` → yes.** Pure function, clear utility, doesn't break encapsulation. Also export `startOfDay` and `formatSummary` if useful for testing.
