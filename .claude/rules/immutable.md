---
description: Non-negotiable project rules. Violations must be flagged immediately.
---
# Immutable Rules

1. **Zero hallucinations** — Jarvis must never fabricate data. Return "I don't know" rather than guessing.
2. **Latest data only** — API-sourced responses must use the most recent data fetch (max 3-minute staleness).
3. **No secrets in code** — API keys, tokens, and credentials go in environment variables, never committed.

<!-- Add new invariants as discovered, with one-line justification. -->
