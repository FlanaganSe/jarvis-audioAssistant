# M4: Showcase Layer — Demo-Ready Features and Final Polish

## Context

Jarvis is a fully functional voice assistant with a trustworthy voice loop (M1), grounded GitHub and weather tools with evidence (M2), cross-session memory recall, user preferences, capability self-awareness, and a polished dark-theme UI (M3). **M4 is the final milestone.** It adds the showcase features that make stakeholders say "wow" and ensures the end-to-end demo flows flawlessly.

After M4, the product is ready for the stakeholder demo described in PRD section 13.

### What exists (do not break):

**Server tools (11 registered):**
- `github_list_open_prs`, `github_get_pr_details`, `github_list_issues`, `github_get_issue_details`, `github_get_recent_merges` — Octokit, evidence-backed
- `weather_get_current` — OpenWeatherMap, Redis cache, 180s freshness enforcement
- `memory_recall` — Keyword + pgvector search over session summaries
- `jarvis_capabilities` — Live tool registry introspection
- `preference_set`, `preference_list`, `preference_delete` — User preferences JSONB

**Server infrastructure:**
- `services/relay.ts` — OpenAI Realtime WS relay with consolidated system prompt (VOICE STYLE / TOOLS AND EVIDENCE / TRUST RULES sections), dynamic user preference injection, tool call dispatch via ToolRegistry, message persistence, session summary generation on close
- `services/tool-registry.ts` — ToolRegistry class: register, get, getAll, execute(name, args, context), getOpenAITools()
- `tools/types.ts` — `ToolContext { userId?, sessionId, db }`, `ToolDefinition { name, description, parameters, execute }`, `ToolResult { output, evidence }`
- `services/summary.ts` — GPT-4o-mini summary + text-embedding-3-small embedding generation
- `services/persistence.ts` — createDbSession, endDbSession, saveMessage
- `services/cache.ts` — Redis wrapper (cacheGet/Set/Del, graceful degradation)
- `db/schema.ts` — 6 tables: users, sessions, messages, sessionSummaries (with pgvector embedding), apiCache, githubCache
- OpenAI npm package already installed (used for summary generation — reusable for proposal analysis)

**Client:**
- `hooks/useVoiceSession.ts` — State machine, handles all ServerMessage types including tool.started/done/error
- `hooks/useAudioCapture.ts` — AudioWorklet PCM16 capture with 48→24kHz downsampling
- `hooks/useAudioPlayback.ts` — Gapless playback with position tracking for interruption
- `types.ts` — `TranscriptTurn { id, role, text, timestamp, interrupted?, evidence?, toolCalls? }`, `ToolCallInfo { callId, name, status, durationMs?, args?, error? }`
- `styles.ts` — Dark theme design system (colors, spacing, radii, fonts)
- Components: StatusBar, PushToTalkButton (animated states), Transcript (chat bubbles + evidence + tool indicators), SessionControls, InfoDrawer (preferences + sessions tabs), EvidenceCard, ToolCallIndicator

**Shared types** (`shared/src/types.ts`):
- `Evidence { source, entity, fetchedAt, freshnessSec, citationRef }`
- `ClientMessage`: audio | commit | cancel | truncate
- `ServerMessage`: audio | transcript | status | response.started | response.done | turn.started | error | session.timeout | session.ready | tool.started | tool.done | tool.error

**Key patterns to preserve:**
- Tools are registered in `tools/index.ts` via `toolRegistry.register()`
- Tool execution receives `ToolContext { userId, sessionId, db }`
- Tool results return `{ output: string, evidence: Evidence | null }`
- Server sends tool.started/done/error to client
- useVoiceSession switch handles all server message types
- Extend shared type discriminated unions for new message types

### Read before planning:
- `docs/PRD.md` — Section 13 (Demo Narrative), Section 14 (M4 milestones), Section 8 (R7 self-awareness, R11 action previews)
- All M3 source files listed above (understand the current tool pattern before adding new tools)
- `server/src/services/relay.ts` — understand the system prompt structure and tool dispatch

---

## Objective

Add the showcase features that complete the demo narrative: repo briefing, "what changed" delta summaries, dry-run action proposals with an approval UX, and audio level visualization. Then verify the entire 6-step demo flow works flawlessly end-to-end.

### M4 delivers:
1. **Repo briefing mode** — "Give me the state of this repo in 30 seconds" → one comprehensive spoken briefing from aggregated GitHub data.
2. **"What changed since last time?" summaries** — Combines session memory with GitHub temporal queries to show what's new since the user last asked.
3. **Dry-run action proposals** — "Propose a fix for issue #42" → Jarvis analyzes the issue, presents a structured plan with an approval card. Does NOT execute.
4. **Audio level visualization** — Push-to-talk button animates with real microphone volume.
5. **Final demo polish** — The complete 6-step demo narrative runs perfectly.

### M4 does NOT deliver:
- Actual execution of proposals (write actions are P2)
- Mobile client (P2)
- Wake word (P2)
- Additional data sources beyond GitHub + OpenWeatherMap
- Deployment to Railway (can be done post-M4 if desired)

---

## Build Order (Checkpoints)

### Checkpoint 1: Repo Briefing Mode

A single tool call that gives a comprehensive 15-second spoken summary of a repository's current state.

**New tool** (`server/src/tools/github-briefing.ts`):

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `github_repo_briefing` | owner (string), repo (string) | Aggregated repo health snapshot: open PRs, open issues, recent merges, contributor activity. |

Implementation:
1. Fetch in parallel using `Promise.all`:
   - `octokit.pulls.list({ owner, repo, state: "open", per_page: 5, sort: "created", direction: "desc" })`
   - `octokit.issues.listForRepo({ owner, repo, state: "open", per_page: 5, sort: "created", direction: "desc" })`
   - `octokit.pulls.list({ owner, repo, state: "closed", sort: "updated", direction: "desc", per_page: 5 })` filtered to merged only
   - `octokit.repos.get({ owner, repo })` for repo metadata (stars, forks, description)
2. Assemble a structured snapshot:
   ```json
   {
     "repo": "facebook/react",
     "description": "...",
     "stars": 230000,
     "open_prs": { "count": 42, "notable": [{ "number": 1234, "title": "...", "author": "..." }] },
     "open_issues": { "count": 890, "notable": [{ "number": 5678, "title": "...", "labels": ["bug"] }] },
     "recent_merges": { "count": 5, "items": [{ "number": 1200, "title": "...", "merged_at": "..." }] },
     "snapshot_at": "2026-03-19T..."
   }
   ```
3. Return as ToolResult with evidence: `{ source: "github", entity: "repo:owner/repo", citationRef: "GitHub API (aggregated)" }`

The model receives this and speaks a natural 15-second summary: "Here's the state of facebook/react: 42 open pull requests, the most recent from [author] about [topic]. 890 open issues, [count] labeled as bugs. Last 5 merges were in the past [timeframe], including [notable merge]. The repo has [stars] stars."

**System prompt addition** (add to the TOOLS AND EVIDENCE section):
```
- For repo overview, status, or briefing requests ("state of this repo", "give me a summary", "what's the health of"), use github_repo_briefing. Speak a concise 15-second summary covering PRs, issues, and recent merges.
```

**Register** in `tools/index.ts` alongside existing GitHub tools.

**Verify CP1:**
- Ask: "Give me the state of facebook/react in 30 seconds" → Jarvis speaks a comprehensive briefing covering PRs, issues, merges. One tool call, one evidence card.
- Ask: "How's vercel/next.js looking?" → Same pattern, different repo.
- The briefing is concise (model speaks ~15-20 seconds) and cites real data.

---

### Checkpoint 2: "What Changed Since Last Time?" Summaries

Combines cross-session memory with GitHub temporal queries to show what's new.

**New tool** (`server/src/tools/github-changes.ts`):

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `github_repo_changes` | owner (string), repo (string) | Finds when the user last discussed this repo (from session memory), queries GitHub for changes since then. |

Implementation:
1. Using the `ToolContext.userId` and `ToolContext.db`, query `session_summaries` joined with `sessions` where:
   - `sessions.userId = context.userId`
   - `session_summaries.entities` contains a reference to `repo:owner/repo` (JSONB containment query or text search on the serialized entities)
   - Ordered by `sessions.startedAt DESC`, limit 1
2. If a previous session is found: use its `startedAt` as the `since` timestamp.
3. If no previous session found: default to 24 hours ago. Note this in the output.
4. Query GitHub for changes since `since`:
   - `octokit.pulls.list({ owner, repo, state: "closed", sort: "updated", since, per_page: 10 })` → filter to merged
   - `octokit.issues.listForRepo({ owner, repo, state: "all", since, sort: "created", per_page: 10 })` → split into opened vs closed
5. Return structured delta:
   ```json
   {
     "repo": "facebook/react",
     "since": "2026-03-18T14:30:00Z",
     "since_description": "your last session on March 18",
     "prs_merged": [{ "number": ..., "title": ..., "author": ..., "merged_at": ... }],
     "issues_opened": [{ "number": ..., "title": ..., "labels": ... }],
     "issues_closed": [{ "number": ..., "title": ..., "closed_at": ... }],
     "summary": "3 PRs merged, 5 new issues opened, 2 issues closed since your last session"
   }
   ```
6. Evidence: `{ source: "github+memory", entity: "repo:owner/repo", citationRef: "GitHub API + Session from [date]" }`

**System prompt addition:**
```
- For "what changed", "what's new", or "any updates since last time" about a repo, use github_repo_changes. It checks your past conversations to find the right timeframe automatically.
```

**Verify CP2:**
- Session A: Ask about facebook/react PRs. End session (summary generates).
- Session B: Ask "What changed on facebook/react since last time?" → Jarvis finds the previous session date, speaks the delta ("Since our conversation on [date], 3 PRs were merged...").
- If no prior session exists: "I don't have a record of a previous conversation about this repo, so here's what changed in the last 24 hours..."
- Evidence card shows source "GitHub + Memory."

---

### Checkpoint 3: Dry-Run Action Proposals

Jarvis can analyze an issue and propose a plan — but explicitly stops short of executing. This demonstrates the approval boundary and "safe agentic future" narrative.

**New tool** (`server/src/tools/github-proposals.ts`):

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `github_propose_action` | owner (string), repo (string), issue_number (number), action_type ("fix_plan" \| "pr_outline" \| "comment_draft") | Fetches the issue, analyzes it with GPT-4o-mini, returns a structured proposal. |

Implementation:
1. Fetch the issue details via Octokit: title, body, labels, comments (first 10).
2. Call GPT-4o-mini (via the `openai` npm package, already installed) with a structured prompt:

   For `fix_plan`:
   ```
   Analyze this GitHub issue and propose a fix plan.

   Issue #${number}: ${title}
   Body: ${body}
   Labels: ${labels}
   Recent comments: ${comments}

   Return JSON with:
   - analysis: 2-3 sentence summary of the problem
   - approach: proposed fix approach (1-2 paragraphs)
   - files_likely_involved: list of file paths or areas that would need changes
   - estimated_complexity: "small" | "medium" | "large"
   - risks: potential risks or side effects of the fix
   ```

   For `pr_outline`:
   ```
   Draft a PR outline to address this issue.
   Return JSON with:
   - title: PR title
   - description: PR body (markdown, 3-5 paragraphs)
   - branch_name: suggested branch name
   - key_changes: list of key changes to make
   ```

   For `comment_draft`:
   ```
   Draft a helpful comment for this issue.
   Return JSON with:
   - comment: the comment text (markdown)
   - tone: "technical" | "supportive" | "questioning"
   ```

3. Parse the GPT-4o-mini response. If parsing fails, return the raw text.
4. Return as `ToolResult`:
   - `output`: the proposal JSON (goes to OpenAI Realtime, model speaks about it)
   - `evidence`: `{ source: "github+analysis", entity: "issue:owner/repo#number", citationRef: "Issue analysis via GPT-4o-mini" }`
   - Include an extra field: the parsed proposal data for the client UI (see below)

**Extend shared types** (`shared/src/types.ts`):

Add a new `ServerMessage` variant for proposals:
```typescript
| { type: "proposal"; callId: string; proposalType: "fix_plan" | "pr_outline" | "comment_draft"; title: string; data: Record<string, unknown> }
```

**Modify `relay.ts`** tool dispatch: After executing `github_propose_action`, in addition to sending `tool.done`, also send a `proposal` message to the client with the parsed proposal data.

**New client component** — `client/src/components/ProposalCard.tsx`:
- Renders below the assistant's spoken message (within the Transcript turn)
- Card with a distinct visual treatment (blue/purple accent border, slightly elevated)
- Header: "Draft Proposal: {type}" + issue reference
- Content sections depend on proposal type:
  - **fix_plan**: Analysis → Approach → Files Involved → Complexity badge → Risks
  - **pr_outline**: Title → Description (rendered markdown) → Branch Name → Key Changes
  - **comment_draft**: Comment text preview
- Footer with two buttons:
  - **"Approve"** (green accent): On click, shows a toast/inline message: "Approval workflows are coming soon. In a future version, clicking Approve would execute this action with your permission."
  - **"Dismiss"** (subtle gray): Collapses/hides the proposal card

**Modify `client/src/types.ts`** — add proposal tracking to TranscriptTurn:
```typescript
export interface TranscriptTurn {
  // ... existing fields
  proposal?: {
    type: "fix_plan" | "pr_outline" | "comment_draft";
    title: string;
    data: Record<string, unknown>;
  };
}
```

**Modify `client/src/hooks/useVoiceSession.ts`**:
- Handle new `proposal` server message: find the current assistant turn and attach the proposal data
- The Transcript component renders ProposalCard when a turn has proposal data

**System prompt addition:**
```
- When the user asks to fix an issue, propose a solution, draft a PR, or draft a comment, use github_propose_action. ALWAYS explain that this is a proposal only — you cannot execute changes. Say something like "Here's what I'd propose. This would need your approval before any changes are made."
- For action requests you can't fulfill (e.g., "deploy this", "send an email"), explain that it's outside your current capabilities.
```

**Verify CP3:**
- Ask: "Can you propose a fix for issue #1 on [some repo with open issues]?" → Jarvis fetches the issue, analyzes it, speaks a summary of the proposal. ProposalCard appears in the UI with analysis, approach, and files.
- Click "Approve" → shows "coming soon" message.
- Click "Dismiss" → card collapses.
- Ask: "Draft a PR outline for that issue" → different proposal type renders correctly.
- The experience clearly communicates "I can plan, but I need your approval to act."

---

### Checkpoint 4: Audio Level Visualization

Make the push-to-talk button come alive with real microphone levels.

**Modify AudioWorklet** (`client/src/lib/audio-worklet-processor.ts`):
- In the `process()` method, after converting to PCM16, also calculate RMS level:
  ```typescript
  let sumSquares = 0;
  for (let i = 0; i < input.length; i++) {
    sumSquares += input[i] * input[i];
  }
  const rms = Math.sqrt(sumSquares / input.length);
  this.port.postMessage({ type: "level", level: Math.min(1, rms * 3) }); // amplified for visual effect
  ```
- Keep the existing PCM16 data message as-is. Add a separate "level" message type.

**Modify `useAudioCapture.ts`:**
- Expose a `level` state value (number 0-1) updated from the worklet's level messages
- Use `requestAnimationFrame` or a throttled update (every ~50ms) to avoid excessive re-renders
- Return `level` from the hook

**Modify `useVoiceSession.ts`:**
- Pass `capture.level` through the return value (or make it available to the button)

**Modify `PushToTalkButton.tsx`:**
- When status is `listening`: use the level value to drive a visual ring or glow:
  - A ring around the button whose scale/opacity is driven by `level`
  - CSS: `transform: scale(${1 + level * 0.3})`, `opacity: ${0.3 + level * 0.7}`
  - This makes the button "pulse" with the user's voice — much more alive than a static animation
- When status is `speaking`: a subtle pulsing animation (can be CSS-only since we don't have output level data easily)
- When status is `idle`/`connected`: a very subtle breathing animation to indicate "ready"

**Verify CP4:**
- Press push-to-talk, speak loudly → the ring grows. Speak quietly → the ring shrinks. Silence → minimal ring.
- The visual response to voice volume is immediate (no perceptible lag).
- The effect is subtle and professional, not distracting.

---

### Checkpoint 5: Final Demo Polish + Full Narrative Walkthrough

This is the final quality gate. Run through the entire demo narrative and fix every issue.

**Demo narrative walkthrough** (PRD section 13, all 6 steps):

**Step 1 — Capability intro:**
- Ask: "What can you do, Jarvis?"
- **Expected:** Jarvis speaks an accurate summary of its capabilities: GitHub repo analysis (briefings, PRs, issues, merges, what-changed), weather, cross-session memory, user preferences. Mentions it can propose fixes but can't execute them yet.
- **Fix if:** Jarvis claims abilities it doesn't have, or misses tools it does have. Update capabilities.ts static metadata.

**Step 2 — Live trust moment:**
- Ask: "What's the weather in Dallas?"
- **Expected:** Jarvis speaks temperature, conditions, and freshness reference. Evidence card shows OpenWeatherMap source and fetch time.
- **Fix if:** Freshness reference is missing or evidence card doesn't appear.

**Step 3 — GitHub repo intelligence:**
- Ask: "Give me the state of facebook/react in 30 seconds"
- **Expected:** Jarvis speaks a concise briefing: PR count, notable PRs, issue count, recent merges. One evidence card. Should take ~15-20 seconds of speech.
- **Fix if:** Briefing is too long (>30s), too short (missing data), or not cohesive.
- Follow up: "Tell me more about the top open PR" → Jarvis calls github_get_pr_details, speaks details.

**Step 4 — Interruption:**
- While Jarvis is giving the repo briefing (or any long answer), interrupt by pressing push-to-talk.
- Ask: "Actually, what about the open issues?"
- **Expected:** Jarvis stops immediately, processes the new question, answers about issues. No reference to content from the interrupted portion.
- **Fix if:** Audio doesn't stop promptly, or follow-up references truncated content.

**Step 5 — Memory moment:**
- (Requires a prior session. Seed one if needed — see below.)
- Ask: "What were we talking about last time?"
- **Expected:** Jarvis recalls the previous session with date, topics, and entities. Evidence card shows "Source: Memory, Session from [date]."
- Follow up: "What changed on that repo since then?" → github_repo_changes kicks in.
- **Fix if:** Memory recall fails, or "what changed" doesn't find the prior session.

**Step 6 — Safe agentic future:**
- Ask: "Can you propose a fix for issue #1 on [repo]?"
- **Expected:** Jarvis fetches the issue, speaks a concise analysis, and says "Here's what I'd propose — this would need your approval." ProposalCard appears with analysis, approach, files, and approve/dismiss buttons.
- Click Approve → "coming soon" message.
- **Fix if:** ProposalCard doesn't render, or Jarvis claims it can execute the fix.

**Demo seed script** (optional but strongly recommended — `server/src/scripts/seed-demo.ts`):
- Creates a demo user (if not exists)
- Creates a fake prior session with a session summary about facebook/react (topics: ["open pull requests", "react performance"], entities: { repos: ["facebook/react"] }, key_facts: ["42 open PRs", "discussed performance-related issues"])
- This ensures Step 5 (memory) works reliably without requiring the presenter to have had a real prior session.
- Run with: `pnpm --filter server seed-demo`

**Update `capabilities.ts`** to include M4 tools:
- Add github_repo_briefing to the tool list
- Add github_repo_changes to the tool list
- Add github_propose_action to the tool list with note: "proposes actions but requires approval to execute"
- Update "coming soon" to reflect what's actually coming in future versions

**Final system prompt review:**
After adding all M4 tools and prompt additions, review the full system prompt for:
- Coherence (no contradictions between sections)
- Completeness (all tools are mentioned)
- Conciseness (no unnecessary repetition)
- Print the full system prompt to console on startup for easy review

**Final checks:**
- `pnpm typecheck` passes
- `pnpm lint` passes
- No console errors in the browser during the full demo walkthrough
- All 6 demo steps work on the first try (not the third try after refreshing)

**Verify CP5:**
- Record yourself (or mentally note) running through all 6 demo steps.
- Each step works on the first attempt.
- The transitions between steps feel natural.
- Evidence cards appear for every grounded answer.
- The ProposalCard renders and the approve/dismiss buttons work.
- Audio level visualization is visible during push-to-talk.
- The UI is polished and doesn't distract from the demo.

---

## Technical Specifications

### New Tool Definitions for OpenAI

```json
{
  "type": "function",
  "name": "github_repo_briefing",
  "description": "Get a comprehensive status briefing for a GitHub repository: open PRs, open issues, recent merges, and repo metadata. Use when the user asks for a repo overview, status summary, or briefing.",
  "parameters": {
    "type": "object",
    "properties": {
      "owner": { "type": "string", "description": "Repository owner" },
      "repo": { "type": "string", "description": "Repository name" }
    },
    "required": ["owner", "repo"]
  }
}
```

```json
{
  "type": "function",
  "name": "github_repo_changes",
  "description": "Get what changed in a GitHub repository since the user last asked about it. Automatically determines the timeframe from session memory. Use when the user asks 'what changed', 'any updates', or 'what's new' about a repo.",
  "parameters": {
    "type": "object",
    "properties": {
      "owner": { "type": "string", "description": "Repository owner" },
      "repo": { "type": "string", "description": "Repository name" }
    },
    "required": ["owner", "repo"]
  }
}
```

```json
{
  "type": "function",
  "name": "github_propose_action",
  "description": "Analyze a GitHub issue and propose an action plan. Returns a structured proposal that requires user approval. Use when the user asks to fix an issue, propose a solution, draft a PR, or draft a comment.",
  "parameters": {
    "type": "object",
    "properties": {
      "owner": { "type": "string", "description": "Repository owner" },
      "repo": { "type": "string", "description": "Repository name" },
      "issue_number": { "type": "number", "description": "Issue number" },
      "action_type": { "type": "string", "enum": ["fix_plan", "pr_outline", "comment_draft"], "description": "Type of proposal to generate" }
    },
    "required": ["owner", "repo", "issue_number", "action_type"]
  }
}
```

### New ServerMessage Types

Add to `shared/src/types.ts`:
```typescript
| { type: "proposal"; callId: string; proposalType: "fix_plan" | "pr_outline" | "comment_draft"; title: string; issueRef: string; data: Record<string, unknown> }
```

### Updated System Prompt

The full system prompt after M4 (replace the existing one in relay.ts). The preference section is dynamically injected as before.

```
You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct.

VOICE STYLE:
- Keep spoken answers to 1-3 sentences unless asked for more detail.
- When you need to look something up, briefly say "Let me check that" before calling a tool.
- When reporting data, cite exact values from tool results. Never round or embellish.
- If you're unsure or lack evidence, say "I don't know" or "I don't have that information right now."

TOOLS AND EVIDENCE:
- For repo overviews or briefings ("state of this repo", "how's it looking"): use github_repo_briefing. Speak a concise 15-second summary.
- For "what changed" or "any updates" about a repo: use github_repo_changes. It finds the timeframe from your past conversations automatically.
- For specific GitHub questions (PRs, issues, merges): use the appropriate github_* tool.
- For weather questions: use weather_get_current. Include how old the data is.
- For past conversation recall: use memory_recall.
- For capability questions ("what can you do"): use jarvis_capabilities.
- For preference management ("remember that...", "forget that..."): use preference_set/list/delete.
- For fix proposals, PR drafts, or comment drafts: use github_propose_action. ALWAYS explain that the proposal needs approval — you cannot execute changes directly.

TRUST RULES:
- Never fabricate repository data, PR numbers, issue counts, weather readings, or memories.
- If a tool returns an error, report it honestly.
- If the user asks about something outside your capabilities, say so clearly and suggest what you can do instead.
- For action proposals, always be clear: "This is a proposal. It would need your approval before any changes are made."

{USER_PREFERENCES_SECTION}
```

---

## Handling Unknown-Unknowns

1. **Repo briefing might hit GitHub rate limits on large repos.** The briefing makes 4 parallel API calls. If rate-limited, catch the error and return partial data with a note: "I was rate-limited on some queries — here's what I have."

2. **"What changed" lookup in session_summaries might not find the repo.** The JSONB entity matching (looking for "repo:owner/repo" in entities) depends on how summaries are structured. Test the actual JSONB query. If entities are stored as `{ repos: ["facebook/react"] }`, the query is `entities->'repos' ? 'facebook/react'`. If stored differently, adjust.

3. **GPT-4o-mini proposal generation might return invalid JSON.** Wrap in try/catch. If JSON parsing fails, return the raw text as the proposal. The model will still speak about it; the ProposalCard might render a simplified version.

4. **Large issues with many comments could overwhelm the GPT-4o-mini context.** Cap comments to the first 10 and note "showing first 10 of N comments" in the prompt. Truncate individual comment bodies to 500 chars.

5. **The AudioWorklet level messages fire very frequently (~100/sec at 10ms frames).** Throttle in `useAudioCapture.ts` — only update the React state every 50ms (use a requestAnimationFrame or timestamp check). Don't trigger React re-renders 100 times per second.

6. **The demo seed script might conflict with existing data.** Make it idempotent: check if the demo session already exists before creating. Use a deterministic session ID or a special marker in metadata.

7. **ProposalCard might not render if the proposal message arrives before the assistant turn is created.** The `proposal` server message should reference the `callId` which links it to a `tool.done` event which links to the current assistant turn. Make sure the timing is correct: send `proposal` after (or alongside) `tool.done`.

8. **The full system prompt is getting long.** With 14 tools and all the rules, the system prompt will be 400+ tokens. This is fine — OpenAI caches the system prompt aggressively (90% discount on cached tokens). Don't try to compress it at the cost of clarity.

---

## What NOT to Do

- **Do not actually execute proposals.** The Approve button is a demo of the UX pattern. It shows "coming soon," not a real action.
- **Do not refactor the relay.ts message handler.** Add the new tool dispatch and proposal message alongside existing logic.
- **Do not add new database tables.** M4 uses existing tables only.
- **Do not add complex state management** (Redux, Zustand, etc.) for the ProposalCard. Local state within the component + the existing turn-based data flow is sufficient.
- **Do not spend more than 1 hour on CSS polish beyond what's specified.** The dark theme from M3 is the foundation. M4 adds ProposalCard styling and audio level animation. That's it.
- **Do not attempt deployment.** M4 is local dev only. Deployment to Railway can be done as a follow-up.

---

## Success Criteria (End of M4 — Final Product)

### Feature verification:

1. **Repo briefing:** "Give me the state of facebook/react in 30 seconds" → comprehensive spoken briefing, one evidence card, ~15-20s of speech.

2. **What changed:** (After a prior session about a repo) "What changed since last time?" → Jarvis finds the prior session date, speaks the delta with counts and details.

3. **Action proposal:** "Propose a fix for issue #[N] on [repo]" → Jarvis analyzes, speaks a summary, ProposalCard renders with analysis/approach/files. Approve shows "coming soon." Dismiss hides the card.

4. **Audio levels:** Push-to-talk button ring/glow responds to voice volume in real-time.

### Full demo narrative (all 6 steps, in order, no refresh between steps):

5. "What can you do?" → accurate capability summary including new M4 features.
6. "What's the weather in Dallas?" → fresh answer with evidence.
7. "Give me the state of facebook/react" → repo briefing.
8. Interrupt mid-briefing, ask about issues → interruption works, follow-up coherent.
9. "What were we talking about last time?" → memory recall with provenance.
10. "What changed on that repo since then?" → delta summary.
11. "Propose a fix for issue #1 on [repo]" → proposal with approval card.

### Quality checks:

12. No console errors in browser during the full demo walkthrough.
13. `pnpm typecheck` passes.
14. `pnpm lint` passes.
15. The whole demo feels like a product, not a prototype.
