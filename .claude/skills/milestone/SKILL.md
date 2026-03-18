---
name: milestone
description: Implement the next milestone from the current plan
user_invocable: true
---

# Milestone Skill

Implement one milestone from the active plan.

## Process

1. Read the current plan from `.claude/plans/plan-*.md`
2. Identify the next incomplete milestone
3. Implement it, following `.claude/rules/conventions.md` and `.claude/rules/immutable.md`
4. Run tests after implementation
5. Use the reviewer agent for a code review
6. Use the verifier agent to confirm everything passes
7. Update the plan to mark the milestone complete
