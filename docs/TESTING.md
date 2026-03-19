# Testing

## Supported Commands

```bash
pnpm test
pnpm verify
pnpm run ci
```

Use `pnpm verify` before merging changes. It runs typecheck, lint, tests, and build.

## What Is Covered Today

The automated suite is intentionally small and high-signal. It currently covers:

- JWT signing and verification
- Bearer token parsing and companion-route auth helpers
- Tool registry registration, OpenAI tool definition generation, and dispatch
- Session summary job tracking and shutdown wait behavior

## What Is Not Covered Yet

- Live relay sessions against the OpenAI Realtime API
- Live GitHub and weather tool integrations
- Database integration and migration behavior
- Browser audio capture and playback across devices
- End-to-end UI flows in a real browser

## Manual Smoke Path

1. Run `pnpm dev`.
2. Open the client.
3. Confirm the session auto-connects.
4. Ask one GitHub question, one weather question, and one memory question.
5. Open the info drawer and confirm preferences and recent sessions load.
6. Trigger a proposal flow and confirm it renders as read-only.

## Why The Suite Is Still Small

This repo is a serious demo, not a production platform. The current goal is to make the checks trustworthy and easy to maintain, not to add broad shallow coverage that creates fake confidence.
