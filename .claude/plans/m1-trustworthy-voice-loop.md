# M1: Trustworthy Voice Loop

## Context

You are building the Jarvis Audio Assistant -- a real-time voice assistant for frontline workers. This is a demo project that must be technically sound, architecturally clean, and impressive.

**The project currently has documentation and a throwaway M0 spike in `spike/`.** The spike proved the voice loop works but the code is messy and carries forward nothing. M1 is a clean-room build of the real application.

### What M0 proved (so you don't re-discover these):
- WebSocket relay to OpenAI Realtime works with acceptable latency (1190-2434ms E2E)
- Tool calling works (369ms round-trip for GitHub PR queries)
- Push-to-talk requires `turn_detection: null` and manual buffer management
- Interruption requires `response.cancel` + `conversation.item.truncate` with `audio_end_ms`
- The model name `gpt-realtime-mini` works for the Realtime API
- Audio format: PCM16, 24kHz, mono throughout the relay path
- GA API session config uses `input_audio_format`/`output_audio_format` at the session level (not nested under `audio.input`/`audio.output`)

### What M0 got wrong (do NOT repeat):
- **Research docs were wrong.** The research mixed beta and GA API schemas. Code was written against bad docs, then patched reactively. YOU MUST fetch and verify the current OpenAI Realtime API documentation before writing any WebSocket code. Do not trust `docs/research.md` or `docs/research-providers.md` for API schemas.
- **A reviewer suggested removing `type: "realtime"` which was actually required.** Always verify suggestions against primary docs before applying.
- **Audio byte tracking grew organically through bug fixes.** Design the audio state management upfront instead of patching.

### Read these project files before planning:
- `docs/PRD.md` -- Full product requirements (especially sections 2, 3, 6, 8 R1-R4/R8-R12, 10, 12, 14)
- `.claude/rules/stack.md` -- Technology choices (finalized)
- `.claude/rules/conventions.md` -- Code conventions
- `.claude/rules/immutable.md` -- Non-negotiable rules
- `CLAUDE.md` -- Project-level instructions and workflow
- `docs/decisions.md` -- Architectural decisions (ADR-001 through ADR-003)

### Fetch and verify these before writing any OpenAI code:
- The current OpenAI Realtime API documentation (conversations guide, WebSocket guide, API reference for client/server events)
- Specifically verify: the `session.update` event schema, `input_audio_buffer.append`/`commit` events, `response.create` event, `response.cancel` event, `conversation.item.truncate` event, `conversation.item.create` event for tool results, and the function calling event flow
- If any schema differs from what this prompt describes, trust the docs over this prompt

---

## Objective

Build the foundational application: a push-to-talk voice assistant with a React companion UI, proper interruption handling, JWT auth, session management, and idle timeout. This is the platform that all subsequent milestones build on. It must be clean, modular, and correct.

### M1 delivers (from PRD section 14):
1. Push-to-talk voice conversation works end-to-end
2. Audible acknowledgement pattern for slow operations (infrastructure ready; actual tool calls come in M2)
3. Interruption works reliably with full `response.cancel` + `conversation.item.truncate` protocol
4. Companion UI shows session state and transcript
5. JWT auth and session management
6. 10-minute idle timeout with cost tracking

### M1 does NOT deliver:
- No GitHub tool calling (M2)
- No OpenWeatherMap integration (M2)
- No database (PostgreSQL, Redis) -- all state is in-memory for M1
- No conversation persistence (M2)
- No cross-session memory (M2)
- No evidence cards, citations, or freshness timestamps in the UI (M2)
- No user preferences (M3)
- No deployment (local dev only)

---

## Architecture (Decided)

```
+---------------------------+
|   React + Vite Client     |
|  - Push-to-talk button    |
|  - AudioWorklet capture   |
|  - AudioContext playback   |
|  - Companion transcript   |
|  - Status indicator       |
+-----------+---------------+
            | WebSocket (PCM16 audio + JSON events)
            v
+---------------------------+
|   Fastify Server          |
|  - JWT auth on WS upgrade |
|  - OpenAI Realtime WS     |
|  - Session manager        |
|  - Idle timeout           |
|  - Latency logging        |
+-----------+---------------+
            | WebSocket (PCM16 audio + JSON events)
            v
+---------------------------+
|   OpenAI Realtime API     |
|   (gpt-realtime-mini)     |
+---------------------------+
```

- **Transport:** WebSocket relay (ADR-001)
- **Audio format:** PCM16 24kHz mono throughout (ADR-002)
- **No Opus encoding/decoding** for MVP
- **No database** -- sessions are in-memory Maps/objects

---

## Build Order (Checkpoints)

Build in this order. **Do not proceed past a checkpoint until it is verified working.** If something fails 3 times after attempted fixes, STOP and report what you've tried.

### Checkpoint 1: Project Scaffold

Set up the project structure, dev tooling, and verify everything builds and runs.

**Structure:**
```
server/
  src/
    index.ts              -- Fastify entry, registers routes + plugins
    routes/
      ws.ts               -- WebSocket upgrade + relay endpoint
      auth.ts             -- POST /api/auth/token (JWT issuance)
      health.ts           -- GET /api/health
    services/
      relay.ts            -- OpenAI Realtime WS session management
      session.ts          -- In-memory session tracking + idle timeout
      auth.ts             -- JWT sign/verify via jose
    config.ts             -- Environment variables, typed
    types.ts              -- Server-side types
  package.json
  tsconfig.json

client/
  src/
    App.tsx               -- Main layout
    components/
      PushToTalkButton.tsx
      Transcript.tsx
      StatusBar.tsx
      SessionControls.tsx
    hooks/
      useVoiceSession.ts  -- Core hook: WS connection, audio, state machine
      useAudioCapture.ts  -- Microphone → PCM16 via AudioWorklet
      useAudioPlayback.ts -- PCM16 → AudioContext with position tracking
    lib/
      audio-worklet-processor.ts  -- AudioWorklet processor (runs in separate thread)
    types.ts              -- Client-side types
  index.html
  package.json
  tsconfig.json
  vite.config.ts

shared/
  src/
    types.ts              -- Types shared between client and server (WS message schemas)
    constants.ts          -- Shared constants (timeouts, audio params)
  package.json
  tsconfig.json

package.json              -- Workspace root
pnpm-workspace.yaml
biome.json
tsconfig.base.json
```

**Setup tasks:**
1. Initialize pnpm workspace with `server/`, `client/`, `shared/` packages
2. Configure TypeScript (strict mode, `tsconfig.base.json` with shared settings)
3. Configure Biome for the workspace
4. Server: Fastify with `@fastify/websocket`, `@fastify/cors`
5. Client: Vite + React + TypeScript
6. Configure Vite to proxy `/api/*` and `/ws/*` to `http://localhost:3001` (Fastify)
7. Add root dev script that starts both server and client concurrently (e.g., via `concurrently` or separate terminal instructions)
8. Verify: `pnpm install` succeeds, `pnpm dev` starts both servers, client loads in browser at `http://localhost:5173`, health check at `/api/health` returns 200

**Do not write application logic yet.** Just scaffold, tooling, and verify the dev loop works.

### Checkpoint 2: Voice Loop (the hard part)

Get audio flowing: user speaks → server → OpenAI → server → user hears response. This is the core of the entire product.

**Server side (`services/relay.ts`):**
1. When a WebSocket client connects, open a new WebSocket to OpenAI Realtime:
   - URL: `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini`
   - Headers: `Authorization: Bearer ${OPENAI_API_KEY}`, `OpenAI-Beta: realtime=v1`
2. Send `session.update` to configure:
   ```
   turn_detection: null        -- push-to-talk, no VAD
   input_audio_format: "pcm16"
   output_audio_format: "pcm16"
   modalities: ["text", "audio"]
   instructions: <system prompt>
   voice: "alloy"              -- or another available voice
   input_audio_transcription: { model: "whisper-1" }  -- for transcript display
   ```
   **IMPORTANT:** Verify the exact `session.update` schema from the current OpenAI docs before implementing. The schema above is based on M0 findings but may need adjustment.
3. Define a bidirectional message protocol between browser and server:
   - Browser → Server: `{ type: "audio", data: "<base64 PCM16>" }`, `{ type: "commit" }`, `{ type: "cancel" }`, `{ type: "truncate", audioEndMs: number, itemId: string }`
   - Server → Browser: `{ type: "audio", data: "<base64 PCM16>" }`, `{ type: "transcript", role: "user"|"assistant", text: string, final: boolean }`, `{ type: "status", status: string }`, `{ type: "response.started" }`, `{ type: "response.done" }`, `{ type: "error", message: string }`
4. Message relay logic:
   - Browser audio → `input_audio_buffer.append` to OpenAI
   - Browser commit → `input_audio_buffer.commit` + `response.create` to OpenAI
   - OpenAI `response.audio.delta` → audio to browser
   - OpenAI `response.audio_transcript.delta`/`.done` → transcript to browser
   - OpenAI `input_audio_buffer.speech_started` → could be used for UI feedback
   - OpenAI transcript events for user input → transcript to browser
5. Track the current response item ID (from `response.output_item.added` or similar event) for use in truncation.

**Client side -- Audio Capture (`hooks/useAudioCapture.ts`):**
1. On first push-to-talk press: request microphone via `getUserMedia({ audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true } })`
2. Create AudioContext (must be after user gesture for Chrome autoplay policy)
3. Connect a MediaStreamSource to an AudioWorklet processor
4. The AudioWorklet processor (`lib/audio-worklet-processor.ts`):
   - Receives Float32 audio samples from the microphone
   - Converts Float32 [-1, 1] to Int16 [-32768, 32767] (PCM16)
   - Posts the Int16 buffer to the main thread via `port.postMessage`
5. Main thread receives PCM16 buffers and sends them via WebSocket (base64-encoded)
6. **Fallback if AudioWorklet is problematic:** Use a ScriptProcessorNode (deprecated but simpler) or MediaRecorder. Note the fallback in comments but try AudioWorklet first.
7. **Sample rate handling:** If the browser captures at 48kHz instead of 24kHz (some browsers ignore the constraint), you must downsample to 24kHz before sending. A simple approach: skip every other sample. Document if this is needed.

**Client side -- Audio Playback (`hooks/useAudioPlayback.ts`):**
1. Maintain an AudioContext for playback
2. When a PCM16 audio chunk arrives from the server:
   - Decode base64 → Uint8Array → Int16Array
   - Convert Int16 to Float32 (divide by 32768)
   - Create an AudioBuffer with the Float32 data (sampleRate: 24000, 1 channel)
   - Schedule it for playback using AudioBufferSourceNode
3. **Continuous scheduling (critical for gap-free playback):**
   - Track `nextPlayTime` (the AudioContext time when the next chunk should start playing)
   - For the first chunk: `nextPlayTime = audioContext.currentTime + small_buffer` (e.g., 0.05s)
   - For subsequent chunks: schedule at `nextPlayTime`, then `nextPlayTime += chunk.duration`
   - If `nextPlayTime` falls behind `audioContext.currentTime`, reset to current time (gap recovery)
4. **Track playback position for interruption:**
   - Maintain `totalScheduledMs` -- cumulative duration of all chunks scheduled for playback
   - On interruption, calculate `audioPlayedMs = totalScheduledMs - remainingUnplayedMs`
   - A simpler approximation: `audioPlayedMs = (totalBytesScheduled / 48) - bufferMs` (PCM16 at 24kHz = 48 bytes/ms)
5. Expose: `play(chunk)`, `stop()` (returns `audioPlayedMs`), `isPlaying` state

**Client side -- Push-to-Talk (`hooks/useVoiceSession.ts`):**
1. State machine: `idle` → `connecting` → `connected` → `listening` → `processing` → `speaking` → back to `connected`
2. Button press (mousedown/touchstart): transition to `listening`, start sending audio
3. Button release (mouseup/touchend): send `commit`, transition to `processing`
4. When first audio arrives from server: transition to `speaking`
5. When response completes: transition back to `connected`
6. **Use refs for real-time state** (WebSocket, AudioContext, buffers, playback position). Use React state only for UI-visible values (status, transcript). WebSocket events fire many times per second -- do not trigger React re-renders for audio chunks.

**Verify checkpoint 2:**
- Start the app, click push-to-talk, say "Hello Jarvis", release, hear a spoken response
- The transcript shows both user and assistant turns
- Repeat 3 times -- all turns work without refresh
- Measure: time from button release to first audio heard. Log it to console.

### Checkpoint 3: Interruption

Make interruption work correctly. This is the highest-risk feature.

**Implementation:**
1. If user presses push-to-talk while status is `speaking`:
   - Call `audioPlayback.stop()` to halt playback and get `audioPlayedMs`
   - Send `{ type: "cancel" }` to server
   - Send `{ type: "truncate", audioEndMs: audioPlayedMs, itemId: currentResponseItemId }` to server
   - Server forwards `response.cancel` and `conversation.item.truncate` to OpenAI
   - Transition to `listening` state (user is now recording)
2. The interrupted assistant turn should remain in the transcript as a partial response (if transcript text is available)
3. The server must track the current response item ID to pass to `conversation.item.truncate`

**Verify checkpoint 3:**
1. Ask Jarvis a question that produces a long response (e.g., "Explain the history of JavaScript in great detail")
2. After ~2 seconds of audio, press push-to-talk to interrupt
3. Say: "What was the last thing you said?"
4. **Pass:** Jarvis references only content from before the interruption point
5. **Fail:** Jarvis references content from the truncated portion, or says something incoherent
6. Repeat 3 times

### Checkpoint 4: Companion UI

Build the visual companion that makes the voice experience observable and trustworthy.

**Components:**

`StatusBar.tsx`:
- Connection status: connected / reconnecting / disconnected / error
- Session status: idle / listening / processing / speaking
- Session duration timer (time since connection)
- Visual state should be immediately obvious (color-coded or icon-based)

`PushToTalkButton.tsx`:
- Large, central, obvious button
- Visual states: idle (ready to press), recording (active, pulsing), disabled (during processing/speaking unless interrupting)
- Press-and-hold interaction (mousedown/touchstart to start, mouseup/touchend/mouseleave to stop)
- When status is `speaking`, pressing the button triggers interruption

`Transcript.tsx`:
- Scrolling list of conversation turns
- Each turn shows: role (user/assistant), text content, timestamp
- User turns show the transcribed text (from OpenAI's input transcription)
- Assistant turns show the transcribed text (from `response.audio_transcript` events)
- Interrupted turns are visually marked (e.g., "..." or "[interrupted]")
- Auto-scrolls to bottom on new turns

`SessionControls.tsx`:
- "End Session" button
- Session info: connection time, turn count
- Error messages if any

**Layout:** Single-page layout. Status bar at top. Push-to-talk button prominently centered or at bottom. Transcript takes the main space. Session controls in a corner or footer. Keep it clean and functional -- this is not the final design but it should look intentional, not broken.

**Verify checkpoint 4:**
- All status transitions are visually reflected in real-time
- Transcript updates as turns happen
- Interrupted turns show as partial
- The UI looks like a coherent product, not a debug page

### Checkpoint 5: Auth, Session Management, Idle Timeout

Add the security and lifecycle layer.

**JWT Auth (`server/src/services/auth.ts`):**
1. Use `jose` to sign and verify JWTs
2. `POST /api/auth/token` -- issues a JWT with a `sessionId` (UUID) and `exp` (1 hour)
3. The JWT secret is from environment variable `JWT_SECRET`
4. WebSocket upgrade validates the JWT from a query parameter: `/ws/relay?token=<JWT>`
5. If the token is invalid or expired, reject the WebSocket upgrade with 4001

**Session Manager (`server/src/services/session.ts`):**
1. In-memory Map of active sessions: `Map<sessionId, SessionState>`
2. SessionState tracks: userId (from JWT), connectedAt, lastActivityAt, turnCount, status
3. On each user audio commit: update `lastActivityAt`
4. **Idle timeout:** Check every 30 seconds. If `now - lastActivityAt > 10 minutes`, close the WebSocket with a clean message ("Session ended due to inactivity") and clean up
5. On WebSocket close: remove session from the map, log session duration

**Client auth flow:**
1. On app load: `POST /api/auth/token` to get a JWT
2. Connect WebSocket with `?token=<JWT>`
3. If WebSocket closes with auth error: show "Session expired" and offer a reconnect button
4. Store the token in memory (not localStorage for security)

**Verify checkpoint 5:**
- App requests a token on load, connects WebSocket with it
- Conversation works as before
- After 10 minutes of no activity, the session disconnects and UI shows the timeout message
- Invalid token is rejected on WebSocket upgrade

---

## System Prompt for OpenAI

Use this for M1 (will be expanded in M2 when tools are added):

```
You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct. Keep spoken answers to 1-3 sentences unless the user asks for more detail.

Rules:
- Be helpful and conversational for general questions.
- If you don't know something, say "I don't know" rather than guessing.
- When the user asks about your capabilities, honestly describe what you can currently do: have a voice conversation, answer general questions. You cannot yet access GitHub, APIs, or external data -- those features are coming soon.
- Keep responses concise. The user is busy and needs fast answers.
```

---

## Technical Specifications

### Audio Constants (shared/src/constants.ts)
```typescript
export const AUDIO = {
  SAMPLE_RATE: 24000,
  CHANNELS: 1,
  BIT_DEPTH: 16,
  BYTES_PER_SAMPLE: 2,
  BYTES_PER_MS: 48, // 24000 * 2 / 1000
} as const;

export const SESSION = {
  IDLE_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes
  IDLE_CHECK_INTERVAL_MS: 30 * 1000, // check every 30s
  TOKEN_EXPIRY_S: 3600, // 1 hour
} as const;
```

### Environment Variables (server)
```
OPENAI_API_KEY=sk-...        # Required
JWT_SECRET=<random-string>    # Required, 32+ chars
PORT=3001                     # Optional, default 3001
```

### WebSocket Message Protocol (shared/src/types.ts)

Define typed message schemas for the client↔server WebSocket. Use discriminated unions:

```typescript
// Client → Server
type ClientMessage =
  | { type: "audio"; data: string }       // base64 PCM16
  | { type: "commit" }                    // end of user turn
  | { type: "cancel" }                    // interrupt
  | { type: "truncate"; itemId: string; audioEndMs: number };

// Server → Client
type ServerMessage =
  | { type: "audio"; data: string }       // base64 PCM16
  | { type: "transcript"; role: "user" | "assistant"; text: string; delta: boolean }
  | { type: "status"; status: SessionStatus }
  | { type: "response.started"; itemId: string }
  | { type: "response.done" }
  | { type: "turn.started" }             // user turn detected
  | { type: "error"; message: string; code?: string }
  | { type: "session.timeout" };
```

---

## Handling Unknown-Unknowns

Things that might go wrong and how to handle them:

1. **AudioWorklet won't load or process correctly.** Fallback: use ScriptProcessorNode with a deprecation comment. This is acceptable for M1. Note the issue.

2. **Browser captures audio at 48kHz instead of 24kHz.** The `sampleRate` constraint in `getUserMedia` is a hint, not a guarantee. Check `audioContext.sampleRate` after creation. If it's not 24000, downsample: the simplest approach is to skip every other sample (48→24kHz) or use a proper resampling algorithm. Document whichever approach you use.

3. **Audio playback has clicks/pops between chunks.** This usually means chunks aren't scheduled seamlessly. Ensure `nextPlayTime` is tracked precisely and there's no gap. If clicks persist, try adding a tiny crossfade (10-20 samples) between chunks.

4. **OpenAI Realtime API schema differs from what's described here.** Trust the actual docs. Adjust the implementation. Document what differed.

5. **WebSocket drops unexpectedly.** For M1, don't implement auto-reconnection. Show a clear error state ("Connection lost") and a manual "Reconnect" button. Auto-reconnect is a polish item.

6. **The response.create event isn't needed after commit (model auto-responds).** The Realtime API behavior here may depend on configuration. Test both: with `response.create` after `commit` and without. Use whichever works.

7. **input_audio_transcription events don't fire or are unreliable.** User transcript from OpenAI is best-effort. If it's too slow or unreliable, the transcript can show "[user speaking]" for user turns and rely on assistant transcript only. Don't block on this.

8. **CORS issues between Vite dev server and Fastify.** Configure Vite proxy in `vite.config.ts` and `@fastify/cors` on the server. Standard setup, shouldn't be hard, but verify early in checkpoint 1.

---

## What NOT to Do

- **Do not copy code from `spike/`.** The spike code was built against bad research and patched reactively. Start clean. You may reference the spike to understand patterns that worked, but do not copy-paste.
- **Do not install the `openai` npm package** for the Realtime API. Use raw WebSocket (`ws` on server) so you control the exact message flow and can debug issues directly.
- **Do not add tools or external API integrations.** Those are M2. M1 is the voice loop foundation.
- **Do not set up PostgreSQL or Redis.** All state is in-memory for M1.
- **Do not over-style the UI.** It should look clean and functional but CSS polish is not the goal. Use a minimal approach (CSS modules, inline styles, or a utility library -- your choice, but keep it simple).
- **Do not spend more than 30 minutes on any single issue before stepping back** to re-read docs or reconsider the approach. The M0 failure mode was patching blindly. If something doesn't work, understand why first.

---

## Success Criteria (End of M1)

Run through this complete sequence to verify M1:

1. **App startup:** `pnpm dev` starts server + client. Browser loads the UI. Status shows "Connected."
2. **First conversation:** Press push-to-talk, say "Hello Jarvis, how are you?", release. Hear a spoken response within ~2 seconds. Transcript shows both turns.
3. **Multi-turn:** Have 3 back-and-forth turns. All work without refresh. Transcript shows full history.
4. **Interruption:** Ask a long question. Interrupt after 2 seconds. Ask "What was the last thing you said?" Jarvis references only pre-interruption content. Transcript shows the interrupted turn as partial.
5. **Idle timeout:** Leave the session idle for 10+ minutes. The connection closes with a timeout message. UI shows "Session ended."
6. **Auth:** Open a new tab, load the app. It gets a fresh token and connects independently.
7. **Error recovery:** Kill the server while connected. UI shows error state. Restart server. "Reconnect" button works.
8. **Typecheck:** `pnpm typecheck` passes with no errors.
9. **Lint:** `pnpm lint` passes with no errors.

If all 9 pass, M1 is complete.
