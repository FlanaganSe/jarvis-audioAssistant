# Jarvis Audio Assistant

Real-time voice assistant for frontline workers — low-latency, accurate, natural conversation with GitHub and API integrations.

## Commands
```bash
pnpm dev              # Local dev
pnpm test             # Unit tests
pnpm lint             # Lint + format check
pnpm typecheck        # TypeScript type checking
pnpm ci               # Full CI: typecheck, lint, test
```

## Rules
<!-- Auto-discovered from .claude/rules/ — listed here for visibility -->
@.claude/rules/immutable.md
@.claude/rules/conventions.md
@.claude/rules/stack.md

## System
<!-- Uncomment when SYSTEM.md has real content: -->
<!-- @docs/SYSTEM.md -->

## Decisions
See `docs/decisions.md` — append-only ADR log. Read during planning, not loaded every session.

## Personal Overrides
Create `CLAUDE.local.md` (gitignored) for personal, project-specific preferences.

## Workflow
`/prd` → `/research` → `/plan` → `/milestone` (repeat) → `/complete`

## Escalation Policy
- If you discover a new invariant, add it to `.claude/rules/immutable.md`.
