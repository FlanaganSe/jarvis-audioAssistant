# Codex 5.4 Research

## 1. Audit Summary

### Verified repo state before changes

- The workspace was clean and organized as `shared`, `server`, and `client`.
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` all worked.
- `pnpm test` exited successfully while running no tests. That made the repo look greener than it really was.
- There was no `.github/workflows` directory, so there was no meaningful CI.
- The initial client state was `disconnected`, which meant the demo loaded into a soft-dead state until the user noticed a small reconnect button.
- The companion REST routes for preferences and recent sessions trusted `userId` query params rather than the session token.
- `server/.env.example` duplicated and contradicted the root `.env.example`.
- The repo referenced `docs/architecture.md`, but that file did not exist.
- The README was directionally correct but too sparse for a serious demo handoff, and it claimed `pnpm ci` even though `pnpm ci` is a pnpm builtin that does not run project scripts.

### OpenAI-specific audit notes

- The relay already handled both `response.audio.delta` and `response.output_audio.delta`, which is worth preserving.
- That matches current OpenAI guidance that the GA Realtime API renamed beta events such as `response.audio.delta` to `response.output_audio.delta`, and the current WebSocket push-to-talk flow still depends on `response.cancel` plus `conversation.item.truncate` for client-managed interruption handling.
- Sources:
  - <https://developers.openai.com/api/docs/guides/realtime/#beta-to-ga-migration>
  - <https://developers.openai.com/api/docs/guides/realtime-conversations/#websockets>
  - <https://developers.openai.com/api/docs/guides/realtime-conversations/#interruption-and-truncation>

## 2. Priority Plan: Must / Should / Later

### Must

| Item | Why it matters | Impact | Change risk | Status | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Fake-green `pnpm test` | Reviewers could not trust green checks | Reviewer and maintainer trust | Low | Verified | Fix now |
| Missing CI | No automated proof that lint/typecheck/test/build still work | Repo credibility | Low | Verified | Fix now |
| Dead first-run UI state | Demo feels broken on load | Demo UX | Low | Verified | Fix now |
| Query-string `userId` companion routes | Auth posture diverged from the WebSocket story | Trust and reviewability | Medium | Verified | Fix now |
| Conflicting env examples | Setup drift for new contributors | DX | Low | Verified | Fix now |
| `pnpm ci` docs mismatch | Main verification command was misleading | DX and CI clarity | Low | Verified | Fix now |

### Should

| Item | Why it matters | Impact | Change risk | Status | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Missing architecture/development/testing/deployment docs | Repo was harder to review quickly | Reviewer onboarding | Low | Verified | Fix now |
| Summary shutdown best-effort only | In-flight summaries could be dropped on exit | Reliability | Low | Verified | Fix now |
| UI evidence/proposal states too rough | Demo felt more prototype than intentional | Demo polish | Low | Verified | Fix now |

### Later

| Item | Why it matters | Impact | Change risk | Status | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Live relay integration tests | Highest-value remaining verification gap | Reliability | Medium | Verified gap | Defer and document |
| Production auth and multi-tenant isolation | Needed before real deployment | Security/product | High | Verified gap | Defer |
| Configurable production API origin | Needed for split-domain hosting | Deployment flexibility | Medium | Verified gap | Defer |
| Strong readiness probes | Useful for production operations, not required for demo | Ops | Medium | Verified gap | Defer |
| Audio resampling hardening | Device compatibility edge case | Reliability | Medium | Inferred from code | Defer with note |

## 3. Changes Made, Grouped by Category

### Code quality and maintainability

- Added `server/src/services/http-auth.ts` for reusable bearer-token parsing and verification.
- Tightened `/api/auth/token` so it no longer mints tokens for arbitrary unknown users.
- Updated the companion REST routes to use bearer auth instead of raw `userId` query params.
- Added `server/src/services/summary-jobs.ts` and now wait briefly for in-flight summary work during shutdown.

### Tests and verification

- Added Vitest and a real root `pnpm test`.
- Added unit coverage for:
  - JWT sign/verify
  - bearer-token auth helpers
  - tool registry registration and dispatch
  - session-summary shutdown waiting
- Added `pnpm verify` as the supported full verification command.

### CI and repo hygiene

- Added `.github/workflows/ci.yml` that runs install plus `pnpm verify`.
- Added `.nvmrc`.
- Removed the stale `server/.env.example` so the root `.env.example` is the single setup source.

### Demo UX polish

- The client now auto-connects on load instead of starting in a dead state.
- Empty, disconnected, error, listening, processing, and speaking states now read as intentional.
- The side drawer now uses the session bearer token, shows loading/error states, and no longer depends on raw query params.
- Evidence pills are clearer and more legible.
- Proposal cards now state clearly that they are read-only previews.

### Documentation

- Rewrote the README around product value, honest status, setup, demo flow, and caveats.
- Added:
  - `docs/architecture.md`
  - `docs/DEVELOPMENT.md`
  - `docs/TESTING.md`
  - `docs/DEPLOYMENT.md`
- Added this report plus a workflow artifact in `.plans/`.

## 4. Verification Summary with Commands and Results

### Commands run

```bash
pnpm install --frozen-lockfile
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm verify
pnpm run ci
pnpm ci
```

### Results

- `pnpm install --frozen-lockfile`: passed before and after the changes.
- `pnpm install`: passed and updated the lockfile for Vitest.
- `pnpm typecheck`: passed.
- `pnpm lint`: initially failed on import ordering/formatting after edits, then passed after `pnpm lint:fix`.
- `pnpm build`: passed.
- `pnpm test`: now passes with real tests instead of exiting green with no work.
- `pnpm verify`: passed; this is now the recommended full local verification command.
- `pnpm run ci`: passed as the legacy alias.
- `pnpm ci`: failed with `ERR_PNPM_CI_NOT_IMPLEMENTED`, which is exactly why the README and workflow now use `pnpm verify` instead.

### Coverage honesty

- Verified automatically: supporting server utilities and repo verification flow.
- Improved but not fully solved: demo auth posture and shutdown reliability.
- Intentionally deferred: live provider integration, browser audio e2e, deployment manifests.

## 5. Remaining Risks and Unknown Unknowns

- Realtime relay behavior is still not covered by a live end-to-end test harness.
  - Next step: add one provider-backed smoke test or a replay harness for relay event handling.
- Audio sample-rate mismatch handling still uses a simple downsampling strategy.
  - Next step: replace skip-sample downsampling with a proper resampler if broader device support matters.
- Deployment still assumes same-origin API and WebSocket paths.
  - Next step: add configurable production API/WS origins for the client.
- Health checking is still liveness-oriented rather than full readiness.
  - Next step: decide whether DB and Redis readiness should block deployment health.
- The current auth model is intentionally anonymous and demo-oriented.
  - Next step: introduce a real identity boundary before any serious external deployment.

## 6. Recommended Next-Step Features

1. Add a lightweight relay smoke test that validates connect -> commit -> tool -> response against a controllable test harness.
2. Add configurable production API and WebSocket origins to make split deployment practical.
3. Add a small Fastify app factory to unlock route-level integration tests.
4. Add one browser-level test for the client happy path once audio mocking is in place.
5. Add a readiness endpoint that surfaces DB and optional Redis status explicitly.
6. Add an approval execution pathway only after the read-only proposal flow is judged trustworthy.

## 7. Suggested README / Repo Description / Demo Copy

### Repo description

Tool-grounded realtime voice assistant for frontline workers, with GitHub, weather, and memory-backed answers.

### Elevator pitch

Jarvis is an operational voice copilot for frontline teams. It delivers push-to-talk spoken answers grounded in live GitHub data, weather APIs, and conversation memory, with evidence shown in the UI and refusal when facts cannot be verified.

### Demo blurb

Ask Jarvis what changed in a repo, what the weather looks like at a job site, or what you discussed yesterday. It responds in natural voice, shows the tools it used, and keeps proposals read-only so the demo stays trustworthy.

### Suggested release notes

- Added real automated tests and meaningful GitHub Actions CI
- Replaced fake-green `pnpm test` behavior with a real Vitest suite
- Improved demo UX with auto-connect plus clearer empty, error, evidence, and proposal states
- Tightened companion-route auth to use bearer tokens instead of raw query params
- Added architecture, development, testing, deployment, and polish-pass documentation
- Clarified the repo’s honest deployment story and current limitations
