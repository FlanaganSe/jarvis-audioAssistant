# M0 Spike: Prove Voice Loop and Decide Transport Architecture

## Context

You are working in the Jarvis Audio Assistant project at the repository root. This is a real-time voice assistant for frontline workers -- a demo project that needs to be technically sound and impressive.

**The project has no application code yet.** Only documentation and configuration exist. Your job is to build the M0 spike: a minimal, throwaway proof-of-concept that validates the core voice loop and determines which browser audio transport architecture to use for the real build.

Before you begin planning, read these project files for full context:
- `docs/PRD.md` -- Product requirements (especially sections 2, 3, 8 R1-R4, 10, 14)
- `docs/research.md` -- Technical research (especially sections 3, 5, 9 for architecture, voice pipeline, and hallucination prevention)
- `docs/research-providers.md` -- Provider details (especially sections 1.1 for OpenAI Realtime, 6 for agent frameworks, 9 for Fastify, 18 for WebSocket auth patterns)
- `.claude/rules/stack.md` -- Technology choices
- `CLAUDE.md` -- Project conventions

Also fetch and read the current OpenAI Realtime API documentation before planning:
- OpenAI Realtime conversations guide (covers interruption, truncation, push-to-talk, tool calling)
- OpenAI Realtime WebRTC guide (covers ephemeral keys, unified SDP interface, data channel)
- OpenAI Realtime WebSocket guide (covers connection, audio format, manual response control)
- OpenAI Realtime API reference for client events (session.update, input_audio_buffer.*, response.create, response.cancel, conversation.item.truncate, conversation.item.create)

---

## Objective

Build TWO minimal implementations of the Jarvis voice loop -- one using a **WebSocket relay server**, one using **client WebRTC with server-side tool execution** -- and produce a transport recommendation based on measured results.

The spike must prove five things:
1. **Push-to-talk voice conversation works** -- user holds button, speaks, releases, hears Jarvis respond.
2. **Interruption works correctly** -- user can interrupt mid-response, and the follow-up conversation is coherent (no context drift from unheard content).
3. **Tool calling works with grounded answers** -- Jarvis can answer "What are the open PRs on facebook/react?" using a live GitHub API call via `tool_choice` enforcement.
4. **Latency is acceptable** -- measured end-to-end from button release to first audio playback.
5. **One transport is clearly better** -- the spike produces a recommendation with data.

---

## Architecture A: WebSocket Relay

```
Browser --[WS: audio + events]--> Fastify --[WS: audio + events]--> OpenAI Realtime
Browser <--[WS: audio + events]-- Fastify <--[WS: audio + events]-- OpenAI Realtime
```

All audio passes through the Fastify server. The server manages the full OpenAI Realtime session.

### Implementation steps

1. Fastify server opens a WebSocket to the OpenAI Realtime API.
   - Endpoint: `wss://api.openai.com/v1/realtime?model=MODEL_NAME`
   - Headers: `Authorization: Bearer $OPENAI_API_KEY`, `OpenAI-Beta: realtime=v1`
   - **Model name:** Check the current OpenAI docs for the realtime mini model. The PRD calls it `gpt-realtime-mini` but the API model ID may be `gpt-4o-mini-realtime-preview` or similar. Use whatever the docs say is current.
2. Server sends `session.update` to configure:
   - `turn_detection: null` (push-to-talk mode -- no server VAD)
   - `tools`: the GitHub tool definition (see below)
   - `instructions`: "You are Jarvis, a voice assistant. Answer questions concisely. For questions about GitHub repositories, you MUST use the github_list_open_prs tool. Never fabricate repository data."
   - `input_audio_format: "pcm16"`
   - `output_audio_format: "pcm16"`
3. Browser captures audio via `getUserMedia` + AudioWorklet (PCM16, 24kHz, mono). If AudioWorklet is too complex for a spike, `MediaRecorder` with a raw PCM output or `ScriptProcessorNode` (deprecated but simpler) is acceptable.
4. Browser sends audio chunks to Fastify via a client WebSocket connection.
5. Fastify base64-encodes the PCM16 chunks and sends `input_audio_buffer.append` events to OpenAI.
6. When user releases the push-to-talk button:
   - Fastify sends `input_audio_buffer.commit`
   - Fastify sends `response.create`
7. Fastify receives `response.audio.delta` events from OpenAI (base64-encoded PCM16), forwards the raw audio bytes to the browser.
8. Browser plays audio via `AudioContext` (decode PCM16 into an AudioBuffer, schedule playback).
9. **Tool calls:** When Fastify receives function call events (`response.function_call_arguments.done`):
   - Fastify executes the GitHub API call using Octokit
   - Fastify sends `conversation.item.create` with the tool result (role: "tool")
   - Fastify sends `response.create` to continue generation
10. **Interruption:** See the shared interruption protocol below.

---

## Architecture B: WebRTC + Server-Side Tool Execution

```
Browser --[WebRTC: audio]-----------> OpenAI Realtime
Browser <--[WebRTC: audio]----------- OpenAI Realtime
Browser <--[data channel: events]---> OpenAI Realtime

Browser --[WS: tool requests]-------> Fastify (executes tools, returns results)
```

Audio flows directly between the browser and OpenAI. No audio passes through your server. Events (including tool calls) flow via the WebRTC data channel.

### Implementation steps

1. Fastify server exposes a POST endpoint for SDP exchange (the "unified interface" pattern):
   - Client sends its SDP offer to `POST /api/rtc/connect`
   - Server forwards the SDP offer + session configuration (model, tools, instructions, turn_detection: null) to `POST https://api.openai.com/v1/realtime/calls` with the API key in the Authorization header
   - OpenAI returns an answer SDP
   - Server returns the answer SDP to the client
   - The API key never leaves the server
2. Browser creates an `RTCPeerConnection` with the answer SDP.
3. Audio flows directly between browser and OpenAI via the WebRTC audio track.
4. The WebRTC data channel carries all non-audio events (session updates, tool calls, responses, etc.).
5. **Push-to-talk:** This is the part the spike needs to figure out. Possible approaches (try in order):
   - **Option A:** Set `turn_detection: null`. Mute the audio track when the button is not pressed (`audioTrack.enabled = false`). Unmute when pressed. On release, send `input_audio_buffer.commit` + `response.create` via the data channel.
   - **Option B:** If Option A doesn't work cleanly (e.g., muting doesn't interact correctly with the input buffer), try keeping the track enabled but sending `input_audio_buffer.clear` before each push, then `commit` + `response.create` on release.
   - **Option C:** If manual buffer management doesn't work over the data channel, try using server VAD (`turn_detection: { type: "server_vad" }`) with the audio track muted/unmuted as a push-to-talk proxy.
   - Document which approach you used and why.
6. **Tool calls:** When the browser receives a function call event via the data channel:
   - Browser forwards the tool call details to Fastify via a separate WebSocket connection (e.g., `ws://localhost:3000/api/tools`)
   - Fastify executes the GitHub API call using Octokit
   - Fastify returns the result to the browser
   - Browser sends `conversation.item.create` (with the tool result) + `response.create` via the data channel
7. **Interruption:** See the shared interruption protocol below. In WebRTC mode, `response.cancel` and `conversation.item.truncate` are sent via the data channel.

---

## Shared: GitHub Tool Definition

```json
{
  "type": "function",
  "name": "github_list_open_prs",
  "description": "List open pull requests for a public GitHub repository. Returns PR number, title, author, and created date for the most recent open PRs.",
  "parameters": {
    "type": "object",
    "properties": {
      "owner": {
        "type": "string",
        "description": "Repository owner (e.g., 'facebook')"
      },
      "repo": {
        "type": "string",
        "description": "Repository name (e.g., 'react')"
      }
    },
    "required": ["owner", "repo"]
  }
}
```

Server-side execution uses `@octokit/rest` to call `octokit.pulls.list({ owner, repo, state: "open", per_page: 5, sort: "created", direction: "desc" })`. Return a JSON string with PR number, title, author login, and created_at for each PR.

The tool result sent back to OpenAI should be a `conversation.item.create` event with:
- `type: "function_call_output"`
- `call_id`: matching the call_id from the function call event
- `output`: JSON string of the results

---

## Shared: Interruption Protocol (Critical)

This is the most important thing to get right. Without proper truncation, the model's conversation history will include content the user never heard, breaking follow-up coherence.

### State machine (both approaches):

1. User presses push-to-talk while Jarvis is speaking.
2. Browser immediately stops audio playback and records the **playback cursor** -- how many milliseconds of assistant audio were actually played to the user.
3. Send `response.cancel` to halt ongoing model generation.
4. Send `conversation.item.truncate` with:
   - `item_id`: the ID of the assistant message being interrupted (from the `response.audio.delta` or `response.content_part.added` events)
   - `content_index`: 0 (first content part)
   - `audio_end_ms`: the playback cursor value (ms of audio actually heard)
5. The model's conversation history is now trimmed to only include what the user actually heard.

### How to track the playback cursor:

- When audio chunks arrive, track the cumulative duration of audio sent to the AudioContext for playback.
- When an interruption occurs, calculate: `audio_end_ms = total_audio_scheduled_ms - remaining_unplayed_ms`
- A simpler approximation for the spike: track `total_bytes_played` and convert to ms using the sample rate (24000 Hz, 16-bit mono = 48000 bytes/sec, so `ms = bytes_played / 48`).

### Verification test:

After implementing interruption, run this test manually:
1. Ask Jarvis something that produces a long response (e.g., "Tell me about the history of JavaScript in detail").
2. Interrupt after ~2 seconds of audio.
3. Ask a follow-up: "What was the last thing you said?"
4. **Pass condition:** Jarvis references only the content that was actually played before the interruption, not the truncated portion.
5. **Fail condition:** Jarvis references content from after the interruption point, or says something like "As I was saying about [topic from truncated portion]."

---

## Shared: System Prompt

Use this for both approaches:

```
You are Jarvis, a concise voice assistant for frontline workers. Keep spoken answers to 1-3 sentences unless asked for more detail.

Rules:
- For questions about GitHub repositories, you MUST use the github_list_open_prs tool. Never make up PR numbers, titles, or authors.
- If you don't have a tool to answer a question, say "I don't have that information right now."
- When reporting tool results, cite the exact numbers from the tool response.
```

---

## Browser Client

Minimal UI -- just enough to test. A single HTML page with:

- A **push-to-talk button** (mousedown = start recording, mouseup = stop and send). Make it large and obvious.
- A **mode toggle** to switch between "Relay (WS)" and "WebRTC" mode. This should reconnect when toggled.
- A **status indicator** showing: idle / connecting / listening / processing / speaking / error.
- A **log area** showing timestamped events: user turns, assistant turns (with text if available from transcription events), tool calls (name + args + result summary + duration), latency measurements, errors.
- A **connection status** indicator.

No React. No build tooling for the client. Plain HTML + inline `<script type="module">` is fine. The Fastify server serves this as a static file.

---

## Measurements

For EACH approach, measure and log (print to both browser console and the log area):

| Metric | How to measure |
|--------|---------------|
| End-to-end latency | ms from `input_audio_buffer.commit` send to first `response.audio.delta` received |
| Time to first playback | ms from button release to `AudioContext` playing the first audio chunk |
| Tool call round-trip | ms from function call event received to `conversation.item.create` sent back |
| Interruption latency | ms from interrupt (button press) to audio playback actually stopping |

Run at least **5 conversational turns** for each approach, including:
- 2 simple conversational turns (e.g., "Hello Jarvis", "What time is it?")
- 2 tool-calling turns (e.g., "What are the open PRs on facebook/react?", "Tell me about open PRs on vercel/next.js")
- 1 interruption test (long response, interrupt mid-stream, follow-up)

Record all measurements in the browser's log area. At the end, manually copy the numbers into the findings document.

---

## Tech Stack and Constraints

### Use:
- **Node.js 22+**, **TypeScript**, **pnpm**
- **Fastify** for the server
- **@octokit/rest** for GitHub API calls
- **tsx** for running TypeScript without a build step (`pnpm tsx src/server.ts`)
- **dotenv** for environment variables
- **ws** for WebSocket (server-side, if not using Fastify's built-in WebSocket support)

### Do NOT:
- Set up PostgreSQL, Redis, or any database
- Implement auth or JWT
- Implement memory or conversation persistence
- Build a companion UI beyond the minimal test page described above
- Use React, Vite, or any frontend framework/build tooling
- Write tests
- Set up Biome or linting
- Deploy anywhere
- Spend time on code quality, error handling, or edge cases beyond what's needed to get measurements
- Use the `openai` npm package for the Realtime API -- use raw WebSocket/WebRTC connections so you understand exactly what's happening

### Project structure:
```
spike/
  package.json
  tsconfig.json
  .env.example
  src/
    server.ts           -- Fastify server entry point
    relay.ts            -- WebSocket relay: manages OpenAI WS connection, forwards audio
    webrtc.ts           -- WebRTC: SDP exchange endpoint, tool-forwarding WS
    github-tool.ts      -- GitHub tool execution via Octokit
    public/
      index.html        -- Browser client with push-to-talk, mode toggle, log area
  FINDINGS.md           -- Transport recommendation (written after testing)
```

---

## Deliverables

1. **Working code** in `spike/` that can be started with a single command (e.g., `cd spike && pnpm install && pnpm dev`).
2. **Both modes working**: a toggle in the browser switches between relay and WebRTC. Both should support push-to-talk, audio playback, tool calling, and interruption.
3. **If one mode can't be made to work**, document exactly why in FINDINGS.md and proceed with the working mode. A clear "X doesn't work because Y" is a valid spike result.
4. **`spike/FINDINGS.md`** answering:
   - Which transport should we use for the real build (M1+) and why?
   - Latency numbers for each approach (table format).
   - What push-to-talk pattern worked for each approach?
   - Did interruption + truncation work correctly? Did the coherence test pass?
   - What surprised you? What was harder than expected?
   - Are there any dealbreakers for either approach?

---

## Environment Variables

Create `spike/.env.example`:
```
OPENAI_API_KEY=sk-your-openai-api-key
GITHUB_TOKEN=ghp_your-github-personal-access-token
```

The server reads these via `dotenv`. The `GITHUB_TOKEN` is a personal access token with no special scopes (public repo access only).

---

## Important Notes

- **Model name:** The PRD calls the model `gpt-realtime-mini`. The actual API model ID may differ (e.g., `gpt-4o-mini-realtime-preview-2024-12-17`). Check the OpenAI Realtime API docs for the current model name. If you can't determine it, try `gpt-4o-mini-realtime-preview` first.
- **Audio format for WebSocket mode:** PCM16, 24kHz, mono, little-endian. Sent as base64-encoded strings in `input_audio_buffer.append` events.
- **Audio format for WebRTC mode:** Handled by the WebRTC transport layer (typically Opus). You don't manage raw audio bytes.
- **The OpenAI Realtime API may have changed** since the project research was written (docs/research.md). Always defer to the current official documentation over the research notes.
- **This is throwaway code.** It will be deleted after M0. Do not over-engineer. The goal is data for a decision, not production code.
- **Commit convention:** If you commit, keep messages to 1 line. No Co-Authored-By lines.
