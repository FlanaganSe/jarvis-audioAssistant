# Codex 5.4 Polish Plan

## Must Fix Before Demo

- Replace fake-green testing with a real `pnpm test` suite and CI workflow.
- Fix the first-run client dead state by auto-connecting on load and clarifying empty/error states.
- Tighten companion-route auth so preferences and session history are not keyed by raw query-string `userId`.
- Remove conflicting `.env.example` files and make local setup truthful.
- Document the real verification command (`pnpm verify`) instead of relying on the broken `pnpm ci` shorthand.

## Should Improve For Repo Trust

- Add architecture, development, testing, and deployment docs.
- Make evidence and proposal states feel intentional in the UI.
- Wait briefly for in-flight session summaries during shutdown.
- Add Node/pnpm version hints and meaningful GitHub Actions automation.

## Later / Intentionally Deferred

- Live relay e2e tests against provider sandboxes
- Production auth and multi-tenant isolation
- Configurable production API origins for split-domain hosting
- Stronger readiness probes and deployment manifests
- Write-action approval execution flow
