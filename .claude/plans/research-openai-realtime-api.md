# OpenAI Realtime API -- Schema Research

**Date:** 2026-03-18
**Purpose:** Verify exact event schemas for building a WebSocket relay to OpenAI's Realtime API.
**API Version:** GA (Generally Available, released 2025-08-28). Beta deprecated April 30, 2026.

---

## CRITICAL: Two Coexisting Schema Styles

There is a well-documented discrepancy between the OpenAI GA documentation and what the raw WebSocket API actually accepts. This matters because our relay uses raw `ws`, not the OpenAI SDK.

### Style A: GA nested schema (developers.openai.com, OpenAI guides)

Used in the OpenAI guides at developers.openai.com and in the WebRTC `POST /v1/realtime/calls` FormData flow. The M0 spike's `relay.ts` used this style and it worked.

```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "instructions": "...",
    "output_modalities": ["audio"],
    "audio": {
      "input": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "turn_detection": null,
        "transcription": { "model": "gpt-4o-mini-transcribe" }
      },
      "output": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "voice": "ash"
      }
    },
    "tools": [...],
    "tool_choice": "auto"
  }
}
```

### Style B: Flat schema (Azure reference, OpenAI API reference, beta-era)

Documented in the Azure/Microsoft Foundry reference and the OpenAI API reference pages. Used by the openai-node SDK internally.

```json
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "instructions": "...",
    "voice": "alloy",
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "input_audio_transcription": { "model": "whisper-1" },
    "turn_detection": null,
    "tools": [...],
    "tool_choice": "auto",
    "temperature": 0.8,
    "max_response_output_tokens": "inf"
  }
}
```

### Which to use?

**The M0 spike proved Style A works** on the raw WebSocket endpoint with `gpt-realtime-mini`. The spike's `relay.ts` uses the nested `audio.input.format` / `audio.output.format` structure and successfully connects and streams audio.

**However**, community reports (openai-node issue #1641) show that sending `session.audio` over WebSocket returned `"Unknown parameter: 'session.audio'"` for some users -- this was resolved by removing the `OpenAI-Beta` header (which forced the beta code path).

**Recommendation for M1:** Since the M0 spike used Style A without the `OpenAI-Beta` header and it worked, continue with Style A. Handle both event name variants defensively (see Event Names section below).

---

## 1. `session.update` Client Event

**Shape:** `{ type: "session.update", session: { ... } }`

An optional `event_id` (string) can be included at the top level for error correlation. The server responds with `session.updated` (or `error` if invalid).

### Session object fields (Style A -- GA nested):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"realtime"` or `"transcription"` | Yes (GA) | Required in GA. Omit only if on beta path. |
| `model` | string | No | e.g., `"gpt-realtime"`, `"gpt-realtime-mini"` |
| `instructions` | string | No | System prompt. Empty string to clear. |
| `output_modalities` | `string[]` | No | `["audio"]`, `["text"]`, or `["text", "audio"]`. Cannot be `["audio"]` alone per Azure docs, but M0 used it successfully. |
| `audio.input.format` | `{ type: string, rate?: number }` | No | `{ type: "audio/pcm", rate: 24000 }`. Also: `"audio/pcmu"` for G.711. |
| `audio.input.turn_detection` | object or `null` | No | `null` disables VAD (push-to-talk). See Turn Detection below. |
| `audio.input.transcription` | `{ model: string }` | No | Enables user input transcription. See Transcription below. |
| `audio.input.noise_reduction` | `{ type: string }` or `null` | No | `"near_field"` or `"far_field"`. |
| `audio.output.format` | `{ type: string, rate?: number }` | No | Same format options as input. |
| `audio.output.voice` | string | No | `"alloy"`, `"ash"`, `"ballad"`, `"coral"`, `"echo"`, `"sage"`, `"shimmer"`, `"verse"`, `"marin"`, `"cedar"`. Cannot change after first audio output. |
| `tools` | `RealtimeFunctionTool[]` | No | Array of function tool definitions. Empty array to clear. |
| `tool_choice` | `"auto"` / `"none"` / `"required"` / `{ type: "function", function: { name: string } }` | No | |
| `temperature` | number | No | `0.6` to `1.2`. Default `0.8`. |
| `max_response_output_tokens` | number or `"inf"` | No | 1-4096 or `"inf"`. Default `"inf"`. |

### Session object fields (Style B -- flat):

| Field | Type | Notes |
|-------|------|-------|
| `modalities` | `string[]` | `["text", "audio"]` |
| `instructions` | string | |
| `voice` | string | At session top level |
| `input_audio_format` | `"pcm16"` / `"g711_ulaw"` / `"g711_alaw"` | String enum, not object |
| `output_audio_format` | `"pcm16"` / `"g711_ulaw"` / `"g711_alaw"` | String enum, not object |
| `input_audio_transcription` | `{ model: string, language?: string, prompt?: string }` or `null` | |
| `input_audio_noise_reduction` | `{ type: string }` or `null` | |
| `turn_detection` | object or `null` | At session top level |
| `tools` | array | |
| `tool_choice` | string or object | |
| `temperature` | number | |
| `max_response_output_tokens` | number or `"inf"` | |

### Turn Detection configuration:

```json
// Disable VAD (push-to-talk mode):
"turn_detection": null

// Semantic VAD (GA default):
"turn_detection": { "type": "semantic_vad", "eagerness": "auto" }

// Server VAD (classic):
"turn_detection": {
  "type": "server_vad",
  "threshold": 0.5,
  "prefix_padding_ms": 300,
  "silence_duration_ms": 200,
  "create_response": true,
  "interrupt_response": true
}
```

When `turn_detection` is `null`, the client must manually send `input_audio_buffer.commit` and `response.create`.

---

## 2. `input_audio_buffer.append` Client Event

```json
{
  "type": "input_audio_buffer.append",
  "audio": "<base64-encoded audio bytes>"
}
```

- `audio`: Base64-encoded audio in the format specified by session config (`pcm16` / `audio/pcm`).
- Max 15 MiB per event.
- **No server confirmation is sent** for this event (unlike most other client events).
- Smaller chunks allow VAD to be more responsive (when VAD is enabled).

Source: Azure reference (line 184-206 of realtime-audio-reference.md), OpenAI guides.

---

## 3. `input_audio_buffer.commit` Client Event

```json
{
  "type": "input_audio_buffer.commit"
}
```

- Creates a new user message item in the conversation from the buffered audio.
- Produces an error if the input audio buffer is empty.
- Audio is transcribed if `input_audio_transcription` is configured.
- **Committing does NOT automatically create a response.** You must send `response.create` separately (when VAD is disabled).
- Server responds with `input_audio_buffer.committed` (containing `item_id` and `previous_item_id`).

Source: Azure reference (lines 228-251).

---

## 4. `response.create` Client Event

```json
{
  "type": "response.create",
  "response": {
    "modalities": ["text", "audio"],
    "instructions": "override instructions for this response only",
    "voice": "alloy",
    "output_audio_format": "pcm16",
    "tools": [...],
    "tool_choice": "auto",
    "temperature": 0.8,
    "max_response_output_tokens": 1000,
    "conversation": "auto",
    "metadata": { "key": "value" },
    "input": [...]
  }
}
```

- The `response` object is **optional**. Sending `{ "type": "response.create" }` with no response object uses session defaults.
- **When VAD is enabled:** The server auto-creates responses after speech stops. Manual `response.create` is not needed.
- **When VAD is disabled (push-to-talk):** You MUST send `response.create` after `input_audio_buffer.commit` to trigger a response.
- `conversation: "none"` creates an out-of-band response (items not added to default conversation).
- Server responds with `response.created`, then streaming events, then `response.done`.

Source: Azure reference (lines 299-325), OpenAI conversations guide.

---

## 5. `response.cancel` Client Event

```json
{
  "type": "response.cancel"
}
```

- Cancels an in-progress response.
- Server responds with `response.cancelled` (or `error` if nothing to cancel).
- Use this with `conversation.item.truncate` for interruption handling.

Source: Azure reference (lines 279-297).

---

## 6. `conversation.item.truncate` Client Event

```json
{
  "type": "conversation.item.truncate",
  "item_id": "<assistant message item ID>",
  "content_index": 0,
  "audio_end_ms": 1500
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `item_id` | string | Yes | The ID of the assistant message item to truncate. Only assistant message items can be truncated. |
| `content_index` | integer | Yes | The index of the content part to truncate. **Always set to 0.** |
| `audio_end_ms` | integer | Yes | Inclusive duration up to which audio is truncated, in milliseconds. Error if greater than actual audio duration. |

- Truncating deletes the server-side text transcript to ensure no text in context that the user hasn't heard.
- Server responds with `conversation.item.truncated`.

**Where to get `item_id`:** From the `response.output_item.added` server event, which contains an `item` object with an `id` field.

Source: Azure reference (lines 156-183), OpenAI client events reference.

---

## 7. Server Events for Response Audio

### IMPORTANT: Event Name Discrepancy

The GA documentation names and actual WebSocket event names diverge:

| Documented GA Name | Actual WebSocket Event Name | Status |
|--------------------|-----------------------------|--------|
| `response.output_audio.delta` | `response.audio.delta` | API sends the shorter name |
| `response.output_audio_transcript.delta` | `response.audio_transcript.delta` | API sends the shorter name |
| `response.output_audio_transcript.done` | `response.audio_transcript.done` | API sends the shorter name |
| `response.output_text.delta` | `response.text.delta` | API sends the shorter name |

The M0 spike handled both variants (lines 60-97 of `spike/src/relay.ts`). Community reports confirm that the WebSocket API actually sends the shorter beta-style names (`response.audio.delta`, etc.) even with GA models.

**Recommendation:** Handle both variants defensively. Listen for both `response.output_audio.delta` and `response.audio.delta`.

### `response.audio.delta` (audio streaming)

```json
{
  "type": "response.audio.delta",
  "event_id": "event_123",
  "response_id": "resp_001",
  "item_id": "item_001",
  "output_index": 0,
  "content_index": 0,
  "delta": "<base64-encoded audio data>"
}
```

- `delta`: Base64-encoded audio chunk in the session's output audio format.

### `response.audio_transcript.delta` (assistant transcript streaming)

```json
{
  "type": "response.audio_transcript.delta",
  "event_id": "event_124",
  "response_id": "resp_001",
  "item_id": "item_001",
  "output_index": 0,
  "content_index": 0,
  "delta": "partial transcript text"
}
```

### `response.audio_transcript.done` (assistant transcript complete)

```json
{
  "type": "response.audio_transcript.done",
  "event_id": "event_125",
  "response_id": "resp_001",
  "item_id": "item_001",
  "output_index": 0,
  "content_index": 0,
  "transcript": "full transcript of the assistant's audio response"
}
```

Source: Azure reference (lines 811-923), OpenAI community reports.

---

## 8. `response.output_item.added` Server Event

```json
{
  "type": "response.output_item.added",
  "event_id": "event_126",
  "response_id": "resp_001",
  "output_index": 0,
  "item": {
    "id": "item_001",
    "object": "realtime.item",
    "type": "message",
    "role": "assistant",
    "status": "in_progress",
    "content": []
  }
}
```

- **Yes, it contains the item ID** inside `item.id`.
- This is the event you use to capture the `item_id` needed for `conversation.item.truncate` during interruption.
- Also emitted for `function_call` type items.

Source: Azure reference (lines 1089-1111).

---

## 9. Input Audio Transcription

### Configuration

**Style A (GA nested):**
```json
"audio": {
  "input": {
    "transcription": { "model": "gpt-4o-mini-transcribe" }
  }
}
```

**Style B (flat):**
```json
"input_audio_transcription": {
  "model": "whisper-1",
  "language": "en",
  "prompt": "optional keywords or context"
}
```

### Available transcription models:

| Model | Notes |
|-------|-------|
| `whisper-1` | Classic. Works in flat schema. |
| `gpt-4o-transcribe` | Higher quality. |
| `gpt-4o-mini-transcribe` | Recommended by OpenAI (best accuracy/cost). M0 spike used this. |
| `gpt-4o-transcribe-diarize` | Multi-speaker support. |

### Server event fired:

```json
{
  "type": "conversation.item.input_audio_transcription.completed",
  "event_id": "event_127",
  "item_id": "item_002",
  "content_index": 0,
  "transcript": "what the user said"
}
```

- Transcription runs **asynchronously** with response creation. This event can arrive before or after response events.
- Transcription is separate from the model's audio understanding. It uses a different model (whisper/gpt-4o-transcribe) and may diverge from what the model "heard."
- There is also a `conversation.item.input_audio_transcription.failed` event for errors.

Source: Azure reference (lines 484-548), OpenAI transcription guide.

---

## 10. WebSocket Connection

### URL

```
wss://api.openai.com/v1/realtime?model=gpt-realtime-mini
```

The model is specified as a query parameter.

### Required Headers

| Header | Value | Notes |
|--------|-------|-------|
| `Authorization` | `Bearer <OPENAI_API_KEY>` | Always required |
| `OpenAI-Beta` | `realtime=v1` | **Removed in GA.** Do NOT include this header with GA models. Including it may force the beta code path. |

### Available models:

| Model | Description |
|-------|-------------|
| `gpt-realtime` | Full-featured GA model. Alias for latest snapshot. |
| `gpt-realtime-mini` | Cost-efficient GA model. What M0 used successfully. |
| `gpt-4o-realtime-preview` | Beta/preview model (deprecated April 30, 2026). |
| `gpt-4o-mini-realtime-preview` | Beta/preview mini model (deprecated). |

Source: OpenAI WebSocket guide, OpenAI model docs, M0 spike code.

---

## Additional Server Events Reference

### `response.function_call_arguments.done`

```json
{
  "type": "response.function_call_arguments.done",
  "event_id": "event_128",
  "response_id": "resp_001",
  "item_id": "item_003",
  "output_index": 0,
  "call_id": "call_001",
  "arguments": "{\"owner\":\"facebook\",\"repo\":\"react\"}"
}
```

Used to handle tool calls. The `call_id` is needed for the `conversation.item.create` response.

### `conversation.item.create` (tool result submission)

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "function_call_output",
    "call_id": "call_001",
    "output": "{\"result\": \"...\"}"
  }
}
```

After submitting the tool result, send `response.create` to trigger the model to continue.

### `input_audio_buffer.committed`

```json
{
  "type": "input_audio_buffer.committed",
  "event_id": "event_129",
  "previous_item_id": "item_001",
  "item_id": "item_002"
}
```

### `input_audio_buffer.speech_started` (VAD only)

```json
{
  "type": "input_audio_buffer.speech_started",
  "event_id": "event_130",
  "audio_start_ms": 1500,
  "item_id": "item_003"
}
```

### `input_audio_buffer.speech_stopped` (VAD only)

```json
{
  "type": "input_audio_buffer.speech_stopped",
  "event_id": "event_131",
  "audio_end_ms": 3200,
  "item_id": "item_003"
}
```

### `error`

```json
{
  "type": "error",
  "event_id": "event_132",
  "error": {
    "type": "invalid_request_error",
    "code": "invalid_value",
    "message": "Human-readable error message",
    "param": "session.audio.input.format",
    "event_id": "client_event_id_if_applicable"
  }
}
```

### `session.created`

First server event on connection. Contains a `session` object with the full default session configuration.

### `session.updated`

Sent after a successful `session.update`. Contains the full effective session configuration.

### `response.created` / `response.done`

Both contain a `response` object with `id`, `status`, `output` (items), and `usage` (token counts).

### `rate_limits.updated`

Emitted at the beginning of a response. Contains rate limit info. Can be safely ignored.

---

## Differences from M0 Assumptions

The M1 plan's Checkpoint 2 lists these assumptions. Here is the verification status:

| M0/M1 Assumption | Verified? | Actual Status |
|-------------------|-----------|---------------|
| GA API uses `input_audio_format`/`output_audio_format` at session level (not nested) | **CONTRADICTED by M0 spike code itself** | The M0 spike (`relay.ts`) actually uses the nested `audio.input.format` / `audio.output.format` Style A schema and it works. The flat Style B also works but is the older beta-era pattern. The M1 plan assumption came from an earlier (wrong) understanding. |
| `turn_detection: null` for push-to-talk | **CONFIRMED** | Setting `turn_detection` to `null` (or `audio.input.turn_detection: null` in Style A) disables VAD and requires manual commit + response.create. |
| `input_audio_transcription: { model: "whisper-1" }` | **PARTIALLY CORRECT** | The flat Style B uses `input_audio_transcription: { model: "whisper-1" }`. Style A uses `audio.input.transcription: { model: "gpt-4o-mini-transcribe" }`. Both work. `gpt-4o-mini-transcribe` is now recommended over `whisper-1`. |
| Model name: `gpt-realtime-mini` | **CONFIRMED** | GA model name. Works. |
| Headers: `Authorization: Bearer`, `OpenAI-Beta: realtime=v1` | **PARTIALLY WRONG** | `Authorization: Bearer` is correct. **Do NOT include `OpenAI-Beta: realtime=v1`** with GA models. The M0 spike does not include it and works. Including it may force the beta code path and cause schema errors. |

### Additional findings not in M0 assumptions:

1. **`type: "realtime"` is required** in the session object for GA. The M0 spike includes it. Removing it causes errors.
2. **Event names:** The WebSocket API sends beta-style short names (`response.audio.delta`) not the documented GA long names (`response.output_audio.delta`). Handle both defensively.
3. **`output_modalities`** in Style A replaces `modalities` from Style B. The M0 spike uses `output_modalities: ["audio"]`.
4. **Committing audio does NOT auto-create a response** when VAD is disabled. Must send `response.create` explicitly.
5. **`content_index` in truncate** should always be `0`.
6. **New GA events:** `conversation.item.added` and `conversation.item.done` were added for long-running operations (e.g., MCP). Not critical for M1.

---

## Sources

- [OpenAI Realtime API Guide](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime WebSocket Guide](https://platform.openai.com/docs/guides/realtime-websocket)
- [OpenAI Client Events Reference](https://platform.openai.com/docs/api-reference/realtime-client-events)
- [OpenAI Server Events Reference](https://platform.openai.com/docs/api-reference/realtime-server-events)
- [OpenAI Conversations Guide (developers.openai.com)](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Azure Migration Guide (Preview to GA)](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio-preview-api-migration-guide)
- [Azure Audio Events Reference](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/realtime-audio-reference?view=foundry-classic)
- [openai-node SDK issue #1641](https://github.com/openai/openai-node/issues/1641) -- SDK vs API schema mismatch
- [Community: response.output_audio.delta not sent](https://community.openai.com/t/response-output-audio-delta-does-not-ever-get-sent-via-webrtc-or-websocket/1360707)
- [Community: GA session.audio.input.format type error](https://community.openai.com/t/realtime-api-beta-realtime-api-ga-receiving-type-error-with-session-audio-input-format/1355366)
- [N1-AI Migration Guide (GitHub)](https://github.com/N1-AI/openai-realtime-webrtc-migration-guide)
- [OpenAI Realtime API Developer Blog](https://developers.openai.com/blog/realtime-api)
- [gpt-realtime-mini Model Page](https://platform.openai.com/docs/models/gpt-realtime-mini)
- M0 spike code: `spike/src/relay.ts`, `spike/src/webrtc.ts`, `spike/src/github-tool.ts`
