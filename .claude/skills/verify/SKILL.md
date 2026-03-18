---
name: verify
description: Run full verification suite
user_invocable: true
---

# Verify Skill

Run all checks to confirm the project is in a correct state.

## Process

1. Launch the verifier agent
2. Run: typecheck, lint, tests
3. Report pass/fail summary
4. If failures exist, list each with file and line number
