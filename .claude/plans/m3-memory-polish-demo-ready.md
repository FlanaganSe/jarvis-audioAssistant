# M3: Memory, Self-Awareness, Preferences, and Demo-Ready Polish

## Context

Jarvis has a fully working voice loop (M1) with grounded GitHub and weather tools, evidence cards, conversation persistence, and session summaries (M2). M3 makes Jarvis *smart* and *polished*: it remembers past conversations, knows its own capabilities, respects user preferences, and looks like a designed product -- not a prototype.

**M3 is the last milestone before the demo showcase (M4).** After M3, the product must feel coherent enough that a stakeholder would be impressed, not distracted by rough edges. M4 adds showcase features (repo briefing, "what changed" summaries, dry-run proposals) on top of a solid foundation. M3 IS that foundation.

### What exists (do not break):

**Server** (`server/src/`):
- `services/relay.ts` — OpenAI Realtime WS relay. Handles audio, transcripts, tool calls (`response.function_call_arguments.done` → tool-registry execute → `conversation.item.create` + `response.create`), and message persistence. 367 lines. System prompt instructs GitHub/weather tool use and acknowledgement before tool calls.
- `services/tool-registry.ts` — `ToolRegistry` class: register, get, getOpenAITools(), execute(name, args). Singleton `toolRegistry`.
- `services/session.ts` — `SessionManager` in-memory Map. Methods: create, get, touch, remove, forEachSession. `SessionState` includes: sessionId, dbSessionId, connectedAt, lastActivityAt, turnCount, status, wsRef?.
- `services/persistence.ts` — `createDbSession()`, `endDbSession()`, `saveMessage()`.
- `services/summary.ts` — `generateSessionSummary()` via GPT-4o-mini. Extracts topics, entities (repos, prs, issues, locations), key_facts, unresolved. Runs async on session close.
- `services/cache.ts` — Redis wrapper: cacheGet, cacheSet, cacheDel. Graceful degradation.
- `services/weather-poller.ts` — Background 3-min poll, LRU 50 cities, addPolledCity/startWeatherPoller/stopWeatherPoller.
- `services/idle.ts` — 30s interval, checks lastActivityAt, closes WS + sends session.timeout if >10min idle.
- `tools/github.ts` — 5 tools via Octokit (list_open_prs, get_pr_details, list_issues, get_issue_details, get_recent_merges). Returns Evidence.
- `tools/weather.ts` — weather_get_current with Redis cache, 180s freshness enforcement, refusal on stale.
- `tools/github-url-parser.ts` — parseGitHubUrl() → { owner, repo, type, number? }.
- `tools/types.ts` — `ToolDefinition` (name, description, parameters, execute) and `ToolResult` (output, evidence).
- `tools/index.ts` — registerAllTools(config).
- `db/schema.ts` — 6 tables: users, sessions, messages, sessionSummaries, apiCache, githubCache. Users has `preferences jsonb default '{}'`. SessionSummaries has topics text[], entities jsonb, keyFacts jsonb, unresolved jsonb.
- `db/index.ts` — connectDb, disconnectDb, getDb. Drizzle singleton.
- `routes/ws.ts` — WS upgrade at `/ws/relay`, JWT validation, creates DB session, sets up relay, cleans up on close (endDbSession + generateSessionSummary).
- `routes/auth.ts` — POST `/api/auth/token`, signs JWT with sessionId.
- `config.ts` — `Config`: port, openaiApiKey, jwtSecret, databaseUrl, redisUrl, githubToken, openweathermapApiKey.

**Shared** (`shared/src/`):
- `types.ts` — `SessionStatus`, `Evidence` (source, entity, fetchedAt, freshnessSec, citationRef), `ClientMessage` (audio|commit|cancel|truncate), `ServerMessage` (audio|transcript|status|response.started|response.done|turn.started|error|session.timeout|session.ready|tool.started|tool.done|tool.error).

**Client** (`client/src/`):
- `hooks/useVoiceSession.ts` — 336 lines. State machine, WS management, handles all ServerMessage types including tool.started/done/error. Returns: status, turns, connectedAt, error, connect, disconnect, startListening, stopListening.
- `hooks/useAudioCapture.ts` — AudioWorklet capture with 48→24kHz downsampling.
- `hooks/useAudioPlayback.ts` — Gapless PCM16 playback with position tracking for interruption.
- `types.ts` — `TranscriptTurn` (id, role, text, timestamp, interrupted?, evidence?, toolCalls?), `ToolCallInfo` (callId, name, status, durationMs?, args?, error?).
- `components/` — StatusBar (color dot + status), PushToTalkButton (press-and-hold + interrupt), Transcript (scrollable turns + evidence + tools), SessionControls (end/reconnect + turn count), EvidenceCard (source + entity + freshness color), ToolCallIndicator (icon + name + duration).
- All components use inline styles. No CSS system. Layout is single-column max-width 600px.

**Key patterns to preserve:**
- Tools are registered via `toolRegistry.register()` in `tools/index.ts`
- Tool results return `{ output: string, evidence: Evidence | null }`
- Server sends `tool.started`/`tool.done`/`tool.error` to client
- Client `useVoiceSession` switch handles all server message types
- Shared types are the contract — extend the discriminated unions

### Read these before planning:
- `docs/PRD.md` — Sections 3.1 (Truth Contract), 8 (R7, R13, R13+, R15), 10.3 (Memory Architecture), 13 (Demo Narrative)
- All M2 source files listed above (understand them before modifying)
- `.claude/rules/immutable.md` — Zero hallucinations, latest data, no secrets

---

## Objective

Add cross-session memory recall, capability self-awareness, user preferences, and make the entire UX demo-ready. After M3, every step of the demo narrative (PRD section 13) works except the M4 showcase features (repo briefing, "what changed," dry-run proposals).

### M3 delivers:
1. **Cross-session memory recall** — Jarvis answers "What were we talking about yesterday?" from stored session summaries, with provenance.
2. **Semantic memory enhancement** — pgvector embeddings on session summaries for fuzzy recall across many sessions.
3. **Capability self-awareness** — Jarvis accurately describes what it can and can't do, from a live capability registry.
4. **User preferences** — "Remember that I prefer..." stored in DB, injected into system prompt, manageable via voice or UI.
5. **User identity** — Simple demo user (localStorage ID) so preferences and memory persist across sessions.
6. **UX polish** — Consistent design system, the product feels intentional and demo-ready.

### M3 does NOT deliver:
- Repo briefing mode (M4)
- "What changed since last time?" summaries (M4)
- Dry-run action proposals (M4)
- Audio level visualization (M4 if time)
- Wake word, mobile, write actions (P2)

---

## Build Order (Checkpoints)

### Checkpoint 1: User Identity

M2 has anonymous sessions — a new JWT/session is created on each page load with no persistent identity. For preferences and memory to work across sessions, Jarvis needs to know WHO is asking. For a demo, this is a simple localStorage-based identity, not a login system.

**Server changes:**

1. **New route** — `POST /api/auth/register`:
   - Creates a user row in the `users` table with a generated email like `demo-{uuid}@jarvis.local`
   - Returns `{ userId: string }`
   - Idempotent: if called with an existing userId (in body), returns it unchanged

2. **Modify** `POST /api/auth/token` (`routes/auth.ts`):
   - Accept optional `userId` in request body
   - If provided, include `userId` in the JWT payload
   - If not provided, behave as before (anonymous session)

3. **Modify** `TokenPayload` (`server/src/types.ts`):
   - Add `userId?: string`

4. **Modify** `routes/ws.ts`:
   - Extract `userId` from the verified JWT payload
   - When creating the DB session (`createDbSession`), associate it with the userId
   - Store `userId` on `SessionState`

5. **Modify** `SessionState` (`server/src/types.ts`):
   - Add `userId?: string`

6. **Modify** `persistence.ts` — `createDbSession`:
   - Accept optional `userId`, set it on the sessions row

**Client changes:**

1. **Modify** `useVoiceSession.ts` connect flow:
   - On first visit: POST `/api/auth/register` → store `userId` in localStorage
   - On subsequent visits: read `userId` from localStorage
   - POST `/api/auth/token` with `{ userId }` in body
   - The rest of the flow is unchanged

**Verify CP1:**
- First visit: userId created and stored in localStorage
- Second visit (new tab): same userId used, token includes it
- DB sessions have the userId associated
- Existing voice loop still works

---

### Checkpoint 2: User Preferences

Users can tell Jarvis to remember preferences, and they persist across sessions.

**Three new tools** (new file `server/src/tools/preferences.ts`):

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `preference_set` | instruction (string) | Store the preference in user's preferences JSONB. Return confirmation. |
| `preference_list` | (none) | Return all current preferences for the user. |
| `preference_delete` | index (number) or keyword (string) | Remove a matching preference. Return confirmation. |

Implementation:
- Read/write to `users.preferences` via Drizzle
- Preferences are stored as a JSON array of strings: `["Always flag security issues", "Prefer concise answers about React repos"]`
- `preference_set`: append to the array, update the DB row
- `preference_list`: return the array
- `preference_delete`: remove by index or by substring match

**The preference tools need the userId from the session.** Modify `ToolDefinition` and tool execution to accept a `context` parameter:

```typescript
// Modify tools/types.ts
interface ToolContext {
  userId?: string;
  sessionId: string;
  db: Db;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}
```

Update `tool-registry.ts` execute() to accept and pass context. Update `relay.ts` to pass context when executing tools. Update existing GitHub and weather tools to accept the context parameter (they can ignore it).

**Inject preferences into system prompt:**
- In `relay.ts`, when building the session.update message, fetch the user's preferences from the DB
- Append to the system prompt:
  ```
  User Preferences (follow these standing instructions):
  1. Always flag security issues
  2. Prefer concise answers about React repos
  ```
- If no preferences, omit this section

**System prompt additions** for preference tools:
```
- When the user says "remember that..." or "from now on..." or sets a standing instruction, use the preference_set tool.
- When the user asks about their preferences or what you remember about them, use the preference_list tool.
- When the user says "forget that" or "stop doing X", use the preference_delete tool.
```

**Client: Preferences panel** (new component `client/src/components/PreferencesPanel.tsx`):
- Fetched from a new REST endpoint: `GET /api/preferences?userId={userId}`
- Displays the list of preferences with a delete button for each
- Delete calls: `DELETE /api/preferences/{index}?userId={userId}`
- Collapsible panel in the UI (toggle button in App.tsx or SessionControls)
- Keep it simple — a list of strings with delete buttons

**New server routes** — `server/src/routes/preferences.ts`:
- `GET /api/preferences` — returns preferences array for the userId (from query param or JWT)
- `DELETE /api/preferences/:index` — removes preference at index

**Verify CP2:**
- Say "Jarvis, remember that I always want to see security-labeled issues first" → preference_set tool fires, preference stored
- End session, start a new one → the system prompt includes the preference
- Ask "What are my preferences?" → preference_list returns the stored instruction
- Say "Forget that preference about security issues" → preference_delete removes it
- Preferences panel in UI shows the list, delete button works
- Existing tools still work

---

### Checkpoint 3: Cross-Session Memory Recall

Jarvis can answer "What were we talking about yesterday?" by querying stored session summaries.

**New tool** (new file `server/src/tools/memory.ts`):

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `memory_recall` | query (string), timeframe? ("today" \| "yesterday" \| "this_week" \| "all") | Search session summaries for the user, return matching sessions with provenance. |

Implementation:
1. Query `session_summaries` joined with `sessions` for the user's userId
2. Filter by timeframe:
   - "today": sessions started today
   - "yesterday": sessions started yesterday
   - "this_week": sessions started in the last 7 days
   - "all" or not specified: last 20 sessions
3. For each summary: check if `topics`, `entities`, or `keyFacts` contain keywords from the query (case-insensitive substring match on JSON-serialized fields)
4. Return top 3 matching summaries with:
   - Session date and duration
   - Topics discussed
   - Key entities (repos, issues, locations)
   - Key facts
   - Unresolved follow-ups
5. Evidence: `{ source: "memory", entity: "session:{date}", fetchedAt: now, freshnessSec: 0, citationRef: "Session from {date}" }`

**pgvector enhancement** (implement in same checkpoint):
1. Add `embedding vector(1536)` column to `session_summaries` table (via Drizzle schema update + db:push)
2. In `summary.ts` `generateSessionSummary()`: after generating the summary, call OpenAI embeddings API (`text-embedding-3-small`) on the stringified summary text, store the embedding
3. In `memory_recall` tool: if a query doesn't match via keyword search, fall back to vector similarity search:
   - Embed the query using `text-embedding-3-small`
   - Query: `ORDER BY embedding <=> query_embedding LIMIT 3`
   - This handles fuzzy queries like "we talked about that React thing"
4. If pgvector extension is not available or embedding fails, fall back to keyword search only. Don't crash.

**System prompt additions:**
```
- When the user asks about a previous conversation, what was discussed before, or references a past session (e.g., "yesterday I asked about...", "what were we talking about?", "remind me about..."), use the memory_recall tool. Never fabricate memories.
- When reporting recalled memories, cite the session date and the specific facts from the summary. Say "Based on our conversation from [date]..." or "I don't have a record of that conversation."
```

**Verify CP3:**
- Have a conversation about "open PRs on facebook/react" in one session. End the session (summary generates).
- Start a new session. Ask "What were we talking about last time?" → memory_recall finds the session, Jarvis speaks: "In our last conversation on [date], we discussed open pull requests on facebook/react..."
- Evidence card shows "Source: Memory, Session from [date]"
- Ask about something never discussed → Jarvis says it has no record of that
- pgvector: ask a fuzzy question like "that thing about the React repo" → still finds the session (if embedding is available)

---

### Checkpoint 4: Capability Self-Awareness

Jarvis knows what it can and can't do, from a live data structure.

**New tool** (`server/src/tools/capabilities.ts`):

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `jarvis_capabilities` | (none) | Return a structured description of current capabilities from the tool registry + static metadata. |

Implementation:
1. Read all registered tools from `toolRegistry`: names and descriptions
2. Add static metadata:
   - Connected integrations: "GitHub (public repos, read-only via PAT)", "OpenWeatherMap (current conditions)"
   - Data sources: list active tools by category
   - Limitations: "Read-only — I cannot create PRs, post comments, or modify external systems", "English only", "Weather data has a 3-minute freshness window"
   - Coming soon (for demo narrative): "Connected GitHub workspaces", "Issue analysis and draft PR proposals"
3. Return as structured JSON that the model can speak naturally

**System prompt addition:**
```
- When the user asks "What can you do?", "What are your capabilities?", or similar, use the jarvis_capabilities tool. Report your actual capabilities accurately — never claim abilities you don't have.
```

**Verify CP4:**
- Ask "What can you do, Jarvis?" → Jarvis speaks an accurate capability summary from the registry
- Ask "Can you send an email?" → Jarvis says no, that's outside its capabilities
- Ask "Can you create a PR?" → Jarvis says it can't yet but it's coming soon
- The capability list matches the actually registered tools

---

### Checkpoint 5: UX Polish — Demo-Ready

Transform the prototype UI into something that looks intentional. The goal is not pixel-perfect design — it's removing distractions. A stakeholder should focus on the voice interaction and trust signals, not on broken layout or inconsistent styling.

**Design system** (new file `client/src/styles.ts` or CSS custom properties):
- Color palette: dark background (#0f1117), card backgrounds (#1a1d27), accent blue (#3b82f6), success green (#22c55e), warning amber (#f59e0b), error red (#ef4444), text primary (#e2e8f0), text secondary (#94a3b8)
- Typography: system-ui font stack, sizes for headings/body/small
- Spacing scale: 4px increments
- Border radius: 8px for cards, 12px for button
- This is an operational tool — dark theme, clean, minimal

**Component restyling** (replace inline styles with the design system):

`App.tsx`:
- Two-section layout: main voice area (transcript + push-to-talk) and a collapsible info drawer (preferences, past sessions)
- Header bar: "JARVIS" text logo, connection status dot, session timer
- Max-width 720px, centered, full height

`StatusBar.tsx`:
- Integrated into the header bar
- Colored status dot + label + connection time
- Error displayed as a dismissible toast, not inline text

`PushToTalkButton.tsx`:
- Large circular button (80px), centered below transcript
- Animated states: idle (subtle pulse), listening (red ring animation), processing (rotating dots or pulse), speaking (blue wave)
- Clear visual hierarchy — this is the most important UI element
- CSS transitions between states

`Transcript.tsx`:
- Card-based turn display on dark background
- User turns: right-aligned, lighter card
- Assistant turns: left-aligned, darker card
- Evidence cards and tool indicators styled consistently within turn cards
- Smooth scroll, auto-scroll to bottom
- Interrupted turns: faded with "[interrupted]" label

`EvidenceCard.tsx`:
- Compact chip/badge design within turn cards
- Icon for source type (GitHub icon, weather icon, memory icon)
- Freshness with colored dot (green/amber/red)

`ToolCallIndicator.tsx`:
- Inline within assistant turns
- Subtle animation while "running" (pulse or shimmer)

**New component** — `client/src/components/InfoDrawer.tsx`:
- Toggleable side/bottom drawer
- Two tabs: "Preferences" and "Recent Sessions"
- Preferences tab: list of stored preferences with delete buttons (fetched from /api/preferences)
- Recent Sessions tab: list of past sessions (date, duration, topics) fetched from a new endpoint
- Toggle button in the header or a tab at the edge of the screen

**New server route** — `GET /api/sessions/recent?userId={userId}`:
- Returns last 10 sessions for the user with their summaries (joined from session_summaries)
- Fields: sessionId, startedAt, endedAt, topics, entities

**Verify CP5:**
- The UI looks like a coherent product, not a debug page
- Dark theme with consistent colors and spacing
- Push-to-talk button has clear, animated state transitions
- Transcript is readable with clear turn separation
- Evidence cards and tool indicators are unobtrusive but informative
- Info drawer opens/closes smoothly, shows preferences and past sessions
- Responsive at common screen widths (don't need mobile, but don't break at 1024px-1440px)

---

### Checkpoint 6: System Prompt Consolidation + Demo Narrative Walkthrough

Consolidate the system prompt (which has grown across milestones) and verify the full demo flow works.

**Consolidate system prompt** in `relay.ts`:

The system prompt should now be a clean, coherent document — not a pile of appended rules. Rewrite it as a single well-structured prompt:

```
You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct.

VOICE STYLE:
- Keep spoken answers to 1-3 sentences unless asked for more detail.
- When you need to look something up, briefly say "Let me check that" before calling a tool.
- When reporting data, cite exact values from tool results. Never round or embellish.
- If you're unsure or lack evidence, say "I don't know" or "I don't have that information right now."

TOOLS AND EVIDENCE:
- For GitHub questions (repos, PRs, issues, merges): use the github_* tools. Never fabricate repo data.
- For weather questions: use weather_get_current. Include how old the data is.
- For questions about past conversations or "what we discussed before": use memory_recall.
- For "what can you do" or capability questions: use jarvis_capabilities.
- For preference management ("remember that...", "forget that..."): use preference_set/list/delete.

TRUST RULES:
- Never fabricate repository data, PR numbers, issue counts, weather readings, or memories.
- If a tool returns an error, report it honestly.
- If the user asks about something outside your capabilities, say so clearly.

{USER_PREFERENCES_SECTION}
```

Where `{USER_PREFERENCES_SECTION}` is dynamically injected if the user has preferences:
```
USER PREFERENCES (follow these standing instructions):
1. Always flag security issues
2. ...
```

**Demo narrative walkthrough** (PRD section 13):

Run through ALL 6 demo steps and verify each works:

1. **Capability intro:** "What can you do?" → Jarvis uses jarvis_capabilities, speaks an accurate summary.
2. **Live trust moment:** "What's the weather in Dallas?" → Fresh answer with temperature, freshness reference, evidence card.
3. **GitHub repo intelligence:** "Tell me about the open pull requests on facebook/react" → Grounded answer with PR numbers/titles, evidence card.
4. **Interruption:** Ask for a long detailed answer, interrupt after 2 seconds, ask a follow-up → coherent (no context drift).
5. **Memory:** (Requires a prior session with a summary.) "What were we talking about last time?" → Jarvis recalls from session summary with provenance.
6. **Safe agentic future:** "Can you fix issue #42 on that repo?" → Jarvis explains it can propose but not execute, suggests this feature is coming. (This is capability awareness, not a real tool — handled by the system prompt and capabilities tool.)

For each step: verify the spoken answer is correct, the evidence card appears, the transcript updates, and the UX feels smooth.

**Fix any issues found during the walkthrough.** This is the final polish pass.

**Verify CP6:**
- All 6 demo narrative steps complete successfully
- System prompt is clean and consolidated (not fragmented)
- No visual or functional regressions
- Typecheck and lint pass

---

## Handling Unknown-Unknowns

1. **pgvector extension might not be installed.** Drizzle push may fail if the `vector` type is unavailable. Check if the PostgreSQL instance has pgvector: `SELECT * FROM pg_extension WHERE extname = 'vector'`. If not, `CREATE EXTENSION vector`. If that fails (extension not available), skip the embedding column and fall back to keyword-only memory recall. Document the issue.

2. **Embedding API call in summary generation adds latency.** The `text-embedding-3-small` call is an HTTP request that takes 100-500ms. Since summary generation already runs async after session close, this is fine. Don't block the session close on it.

3. **User's preferences array could get long.** Cap at 20 preferences. If the user tries to add more, the tool should say "You've reached the maximum number of preferences. Please remove one first."

4. **The model might not reliably call preference tools.** "Remember that..." is ambiguous — the model might just acknowledge conversationally without calling the tool. Test this. If unreliable, make the system prompt more forceful: "When the user says 'remember', 'from now on', or 'always/never', you MUST call preference_set."

5. **ToolContext changes ripple through all existing tools.** Adding a `context` parameter to tool execution changes the ToolDefinition interface. All existing tools (GitHub, weather) need to accept it. Make context optional or use a default empty context so the change is backward-compatible.

6. **Dark theme CSS might break readability of evidence cards or status indicators.** Test with actual evidence data. Ensure color contrast meets WCAG AA (4.5:1 for text).

7. **Past sessions endpoint might be slow with many sessions.** Add a LIMIT 10 and ORDER BY started_at DESC. For a demo with <100 sessions, this is fine.

8. **The preferences REST endpoints need auth.** Use the same JWT validation as the WebSocket — extract userId from a Bearer token or query param. Don't expose preferences to unauthenticated requests.

---

## What NOT to Do

- **Do not add repo briefing mode or "what changed" summaries.** Those are M4.
- **Do not add dry-run action proposals.** That's M4.
- **Do not add audio level visualization.** That's M4 if time allows.
- **Do not refactor relay.ts beyond adding tools and consolidating the prompt.** The relay works. Don't restructure it.
- **Do not add a full user authentication system** (email/password/registration UI). The demo user identity via localStorage is sufficient.
- **Do not spend excessive time on CSS animation polish.** The states should be clear and smooth, but don't spend hours on custom animations. CSS transitions on background-color, opacity, and transform are enough.
- **Do not add pgvector at the cost of the structured recall working.** Implement keyword-based recall FIRST. Add pgvector as an enhancement. If pgvector causes issues, ship without it.

---

## Success Criteria (End of M3)

1. **Memory recall:** Have a session about GitHub PRs on facebook/react. End it. Start new session. Ask "What were we talking about last time?" → Jarvis speaks about the React PRs with session date. Evidence card shows "Source: Memory."

2. **Fuzzy memory** (if pgvector works): Ask "that thing about the React repo" → still finds the correct session.

3. **Capability intro:** "What can you do?" → Jarvis lists GitHub tools, weather, memory recall, and preferences accurately. Does not claim abilities it doesn't have.

4. **Boundary awareness:** "Can you send an email?" → clean refusal. "Can you create a PR?" → explains it's coming but not available yet.

5. **Preference set:** "Remember that I always want security issues flagged first" → preference stored, confirmed.

6. **Preference persistence:** End session, start new one. Ask about issues on a repo → Jarvis's behavior reflects the preference (or at minimum, the system prompt includes it).

7. **Preference management:** Preferences panel shows the stored preference. Delete button removes it.

8. **UX polish:** Dark theme, consistent styling, animated push-to-talk states, card-based transcript, info drawer with preferences and past sessions.

9. **Full demo narrative:** All 6 demo steps (capability intro → weather trust → GitHub intelligence → interruption → memory → safe agentic future) complete successfully without issues.

10. **No regressions:** GitHub tools, weather tool, interruption, evidence cards, session persistence all still work.

11. **Typecheck + lint:** `pnpm typecheck` and `pnpm lint` pass.
