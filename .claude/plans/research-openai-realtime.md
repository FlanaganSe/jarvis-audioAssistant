# OpenAI Realtime API -- Implementation Reference

> Research compiled 2026-03-18. Sources cited inline. The Realtime API went GA on 2025-08-28.
> The Beta/Preview API is deprecated starting 2026-04-30 and will be removed 2026-05-07.

---

## 1. Available Models

| Model ID | Snapshot(s) | Context | Max Output | Audio In $/1M | Audio Out $/1M | Notes |
|---|---|---|---|---|---|---|
| `gpt-realtime` | `gpt-realtime-2025-08-28` | 32k tokens (28,672 input + 4,096 output) | 4,096 | $32.00 | $64.00 | Full model. Supports images, async function calling. |
| `gpt-realtime-mini` | `gpt-realtime-mini-2025-12-15`, `gpt-realtime-mini-2025-10-06` | 32k tokens | 4,096 | (text: $0.60 in / $2.40 out) | (text pricing; audio pricing similar ratio to full) | Cost-efficient. Good for our use case. |

The old beta model IDs (`gpt-4o-realtime-preview`, `gpt-4o-mini-realtime-preview`) are deprecated. Use the `gpt-realtime` / `gpt-realtime-mini` IDs for GA.

**Voices:** alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar. Once a voice is used in a session for audio output, it cannot be changed for that session.

Sources:
- https://developers.openai.com/api/docs/models/gpt-realtime
- https://developers.openai.com/api/docs/models/gpt-realtime-mini

---

## 2. Connection Methods

The Realtime API supports three transport mechanisms:

| Transport | Use Case | Audio Handling | Event Channel |
|---|---|---|---|
| **WebSocket** | Server-to-server (relay) | Base64-encoded PCM chunks sent/received as JSON events | Same WebSocket connection |
| **WebRTC** | Browser-to-OpenAI (direct) | Native WebRTC audio track (Opus codec) | Named data channel `"oai-events"` |
| **SIP** | VoIP telephony | Standard telephony audio | N/A |

---

## 3. WebSocket Connection

### Connection URL

```
wss://api.openai.com/v1/realtime?model=gpt-realtime-mini
```

### Authentication -- Server-Side (Node.js)

```
Authorization: Bearer OPENAI_API_KEY
```

**Important:** Do NOT include the `OpenAI-Beta` header. That was removed in the GA release.

### Authentication -- Browser-Side (not recommended for production)

WebSocket subprotocols:
- `"realtime"`
- `"openai-insecure-api-key.YOUR_API_KEY"`
- (optional) `"openai-organization.YOUR_ORG_ID"`
- (optional) `"openai-project.YOUR_PROJECT_ID"`

### Event Format

All events (both directions) are JSON-serialized text strings sent over the same WebSocket connection. There is no separate channel for audio vs. control events.

### Audio Handling (WebSocket)

You must manually:
1. Capture audio (e.g., `getUserMedia` + AudioWorklet)
2. Convert to the configured input format (PCM16 at 24kHz)
3. Base64-encode audio chunks
4. Send via `input_audio_buffer.append` events
5. Receive `response.audio.delta` events containing base64-encoded audio
6. Decode and play via `AudioContext`

**Max chunk size:** 15 MiB per `input_audio_buffer.append` event.

### Session Lifecycle

1. Open WebSocket connection
2. Receive `session.created` event (contains default session config)
3. Send `session.update` to configure the session
4. Receive `session.updated` confirming the effective config
5. Begin conversation loop
6. Session max duration: **60 minutes**

Source: https://developers.openai.com/api/docs/guides/realtime-websocket

---

## 4. WebRTC Connection

### Step 1: Create Ephemeral Key (Server-Side)

**Endpoint:** `POST https://api.openai.com/v1/realtime/client_secrets`

**Headers:**
```
Authorization: Bearer OPENAI_API_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-mini",
    "audio": {
      "output": {
        "voice": "ash"
      }
    }
  }
}
```

**Response:** Returns JSON with a `value` field containing the ephemeral key (e.g., `ek_68af296e...`).

### Step 2: SDP Exchange (Unified Interface)

**Endpoint:** `POST https://api.openai.com/v1/realtime/calls`

There are two approaches:

#### Approach A: Client-side with ephemeral key

The browser sends the SDP offer directly to OpenAI:

```
Authorization: Bearer EPHEMERAL_KEY
Content-Type: application/sdp
Body: [SDP offer text]
```

#### Approach B: Server-side unified interface (recommended)

The server combines SDP + session config in a multipart form:

```javascript
const fd = new FormData();
fd.set("sdp", pc.localDescription.sdp);
fd.set("session", JSON.stringify({
  type: "realtime",
  model: "gpt-realtime-mini",
  audio: {
    output: { voice: "ash" }
  }
}));

const response = await fetch("https://api.openai.com/v1/realtime/calls", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: fd
});
```

The response body is the SDP answer. Set it as the remote description on the `RTCPeerConnection`.

### Step 3: Audio Track Setup

```javascript
// Send local audio
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));

// Receive remote audio
pc.ontrack = (event) => {
  const audioElement = document.createElement("audio");
  audioElement.autoplay = true;
  audioElement.srcObject = event.streams[0];
};
```

Audio codec: **Opus with in-band FEC**, PCMU/PCMA fallback. No DTX or RED.

### Step 4: Data Channel

The data channel is named `"oai-events"` and carries all non-audio events as JSON strings.

```javascript
// Receive events
dc.addEventListener("message", (event) => {
  const serverEvent = JSON.parse(event.data);
  // handle serverEvent.type
});

// Send events
dc.send(JSON.stringify({
  type: "response.create",
  response: {}
}));
```

### ICE / Network

- Host candidates only (no STUN/TURN)
- Multiple IP addresses across Azure datacenters (typically 3)
- Both UDP (port 3478) and TCP (port 443) supported
- Standard DTLS-SRTP encryption
- SCTP-based data channels

### WebRTC-Only Events

These events exist only in WebRTC mode:

| Event | Direction | Description |
|---|---|---|
| `output_audio_buffer.clear` | Client -> Server | Clear output audio buffer (for manual interruption) |
| `output_audio_buffer.cleared` | Server -> Client | Confirms output buffer was cleared |
| `output_audio_buffer.started` | Server -> Client | Server began streaming audio |
| `output_audio_buffer.stopped` | Server -> Client | Server finished streaming audio |

Source: https://developers.openai.com/api/docs/guides/realtime-webrtc

---

## 5. Session Configuration (GA Schema)

### GA session.update Event

The GA API introduced a `type` field and a nested `audio` configuration object.

```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "instructions": "You are Jarvis, a concise voice assistant.",
    "modalities": ["audio"],
    "voice": "ash",
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "input_audio_transcription": {
      "model": "gpt-4o-mini-transcribe"
    },
    "input_audio_noise_reduction": {
      "type": "near_field"
    },
    "turn_detection": {
      "type": "semantic_vad",
      "eagerness": "auto",
      "create_response": true,
      "interrupt_response": true
    },
    "tools": [],
    "tool_choice": "auto",
    "temperature": 0.8,
    "max_response_output_tokens": "inf"
  }
}
```

Note: The GA API also supports a nested `audio` config shape used in session creation (`/v1/realtime/client_secrets` and `/v1/realtime/calls`). The `session.update` event over WebSocket still uses the flat field names shown above. The nested shape is used in REST session creation:

```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-mini",
    "audio": {
      "input": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "turn_detection": { "type": "semantic_vad" },
        "transcription": { "model": "gpt-4o-mini-transcribe" },
        "noise_reduction": { "type": "near_field" }
      },
      "output": {
        "format": { "type": "audio/pcm" },
        "voice": "ash"
      }
    }
  }
}
```

### Session Configuration Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `"realtime"` or `"transcription"` | required | Session mode. Use `"realtime"` for speech-to-speech. |
| `modalities` | `["audio"]` or `["text"]` or `["text", "audio"]` | `["audio"]` | Output modalities. Cannot set `["audio"]` only without text -- defaults include transcript. |
| `instructions` | string | `""` | System prompt for the model. |
| `voice` | string | varies | Voice selection. Cannot be changed after first audio output. |
| `input_audio_format` | `"pcm16"`, `"g711_ulaw"`, `"g711_alaw"` | `"pcm16"` | Input audio encoding format. |
| `output_audio_format` | `"pcm16"`, `"g711_ulaw"`, `"g711_alaw"` | `"pcm16"` | Output audio encoding format. |
| `input_audio_transcription` | object or null | null (off) | Transcription config. Uses a separate model (not native). |
| `input_audio_noise_reduction` | object or null | null | Noise reduction. `"near_field"` (headphones) or `"far_field"` (laptop/conference mic). |
| `turn_detection` | object or null | `{ type: "semantic_vad" }` | VAD config. Set to `null` for push-to-talk. |
| `tools` | array | `[]` | Function tool definitions. |
| `tool_choice` | `"auto"`, `"none"`, `"required"`, or `{ type: "function", function: { name: "..." } }` | `"auto"` | Tool selection mode. |
| `temperature` | number | 0.8 | Range: 0.6 to 1.2. Cannot make responses deterministic. |
| `max_response_output_tokens` | integer or `"inf"` | `"inf"` | Max tokens per response (1-4096 or "inf"). |

### Fields That Cannot Be Updated Mid-Session

- `model` -- set at connection time only
- `voice` -- cannot change after first audio output

Source: https://learn.microsoft.com/en-us/azure/foundry/openai/realtime-audio-reference

---

## 6. Audio Format Details

| Property | Value |
|---|---|
| Codec (WebSocket) | PCM16 (raw 16-bit signed integers, little-endian) |
| Codec (WebRTC) | Opus (handled by WebRTC transport) |
| Sample rate | 24,000 Hz |
| Channels | 1 (mono) |
| Bit depth | 16-bit |
| Byte rate | 48,000 bytes/sec (24000 samples x 2 bytes) |
| ms-to-bytes conversion | `bytes = ms * 48` |
| Encoding (WebSocket) | Base64 string in JSON events |
| Supported formats | `pcm16`, `g711_ulaw`, `g711_alaw` |

---

## 7. Voice Activity Detection (VAD) and Turn Detection

### Option 1: Semantic VAD (default, recommended)

Uses the model's understanding of speech content to detect turn boundaries. Better at handling pauses, filler words ("ummm"), and natural speech patterns.

```json
{
  "turn_detection": {
    "type": "semantic_vad",
    "eagerness": "auto",
    "create_response": true,
    "interrupt_response": true
  }
}
```

| Parameter | Type | Values | Description |
|---|---|---|---|
| `eagerness` | string | `"low"`, `"medium"`, `"high"`, `"auto"` | How quickly to detect turn end. `"auto"` = `"medium"`. |
| `create_response` | boolean | default `true` | Auto-create response when speech stops. |
| `interrupt_response` | boolean | default `true` | Auto-interrupt ongoing response when new speech starts. |

### Option 2: Server VAD

Uses silence duration to detect turn boundaries. Simpler but more prone to false positives (e.g., pauses mid-thought).

```json
{
  "turn_detection": {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 500,
    "create_response": true,
    "interrupt_response": true
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `threshold` | number | 0.5 | Voice activation threshold (0.0-1.0). Higher = louder required. |
| `prefix_padding_ms` | number | 300 | Audio to include before detected speech start. |
| `silence_duration_ms` | number | 200 | Silence duration to detect speech end. Lower = faster response, risk of cutoff. |
| `create_response` | boolean | true | Auto-create response when speech stops. |
| `interrupt_response` | boolean | true | Auto-interrupt ongoing response when new speech starts. |

### Option 3: Disabled (Push-to-Talk)

```json
{
  "turn_detection": null
}
```

Client must manually:
1. Send audio via `input_audio_buffer.append` (WS) or unmuted audio track (WebRTC)
2. Call `input_audio_buffer.commit` when user stops speaking
3. Call `response.create` to trigger model response

### Hybrid Mode

Keep VAD enabled but set `create_response: false`. VAD detects turns and fires speech events, but client controls when to actually request a response. Useful for moderation, input validation, or RAG patterns.

Source: https://developers.openai.com/api/docs/guides/realtime-vad

---

## 8. Client Events (Complete Reference)

### 8.1 session.update

Updates session configuration. Any field can be updated except `voice` (after first audio) and `model`.

```json
{
  "type": "session.update",
  "event_id": "optional-client-id",
  "session": {
    "type": "realtime",
    "instructions": "...",
    "turn_detection": { ... },
    "tools": [ ... ]
  }
}
```

Only fields present in the payload are updated. To clear:
- `instructions`: pass `""`
- `tools`: pass `[]`
- `turn_detection`: pass `null`

Server responds with: `session.updated`

### 8.2 input_audio_buffer.append

Streams audio to the input buffer.

```json
{
  "type": "input_audio_buffer.append",
  "audio": "<base64-encoded-audio>"
}
```

| Field | Type | Description |
|---|---|---|
| `audio` | string | Base64-encoded audio in the configured `input_audio_format`. Max 15 MiB per event. |

**No server confirmation is sent** for this event (unlike most other events).

### 8.3 input_audio_buffer.commit

Commits the audio buffer, creating a user message item. Audio is transcribed if `input_audio_transcription` is configured.

```json
{
  "type": "input_audio_buffer.commit"
}
```

- Not needed when server VAD is enabled (server auto-commits).
- Does NOT automatically create a response -- you must also send `response.create`.
- Errors if buffer is empty.

Server responds with: `input_audio_buffer.committed`

### 8.4 input_audio_buffer.clear

Clears the audio buffer without committing.

```json
{
  "type": "input_audio_buffer.clear"
}
```

Server responds with: `input_audio_buffer.cleared`

### 8.5 response.create

Triggers model inference. Can override session-level config for this response only.

```json
{
  "type": "response.create",
  "response": {
    "instructions": "Override instructions for this response only",
    "tools": [],
    "modalities": ["audio"],
    "output_audio_format": "pcm16",
    "temperature": 0.8,
    "max_response_output_tokens": 1000,
    "conversation": "auto",
    "metadata": { "topic": "github-prs" },
    "input": [
      { "type": "item_reference", "id": "existing-item-id" },
      {
        "type": "message",
        "role": "user",
        "content": [{ "type": "input_text", "text": "Summarize the above." }]
      }
    ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `instructions` | string | Override session instructions for this response. |
| `tools` | array | Override session tools for this response. |
| `modalities` | array | `["audio"]`, `["text"]`, or `["text", "audio"]`. |
| `temperature` | number | Override temperature (0.6-1.2). |
| `max_response_output_tokens` | int or `"inf"` | Override max tokens. |
| `conversation` | `"auto"` or `"none"` | `"none"` = out-of-band response (not added to conversation). |
| `metadata` | object | Up to 16 key-value pairs for client-side identification. |
| `input` | array | Custom context. Supports `item_reference` and new message items. |

Server responds with: `response.created`, then streaming events, then `response.done`.

### 8.6 response.cancel

Cancels an in-progress response.

```json
{
  "type": "response.cancel"
}
```

Server responds with: `response.cancelled` (or error if no active response).

### 8.7 conversation.item.create

Adds a new item to the conversation (messages, function calls, function call outputs).

```json
{
  "type": "conversation.item.create",
  "previous_item_id": "optional-insert-after-id",
  "item": {
    "type": "message",
    "role": "user",
    "content": [
      { "type": "input_text", "text": "Hello" }
    ]
  }
}
```

#### Item Types

**Message (user):**
```json
{
  "type": "message",
  "role": "user",
  "content": [
    { "type": "input_text", "text": "..." }
  ]
}
```

**Message (system):**
```json
{
  "type": "message",
  "role": "system",
  "content": [
    { "type": "input_text", "text": "..." }
  ]
}
```

**Message (assistant) -- text only, cannot populate audio:**
```json
{
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "..." }
  ]
}
```

**Function call output (tool result):**
```json
{
  "type": "function_call_output",
  "call_id": "call_abc123",
  "output": "{\"prs\": [{\"number\": 1, \"title\": \"...\"}]}"
}
```

| Field | Type | Description |
|---|---|---|
| `previous_item_id` | string (optional) | Insert after this item. If omitted, appended to end. |
| `item.id` | string (optional) | Client-specified ID. Server generates one if omitted. |
| `item.type` | `"message"`, `"function_call"`, `"function_call_output"` | Item type. |
| `item.role` | `"system"`, `"user"`, `"assistant"` | Only for `message` type. |
| `item.content` | array | Content parts. Types depend on role. |
| `item.call_id` | string | Required for `function_call` and `function_call_output`. |
| `item.name` | string | Function name (for `function_call`). |
| `item.arguments` | string | JSON string of args (for `function_call`). |
| `item.output` | string | Result string (for `function_call_output`). |

Server responds with: `conversation.item.created`

### 8.8 conversation.item.truncate

Truncates assistant audio to synchronize server context with client playback position.

```json
{
  "type": "conversation.item.truncate",
  "item_id": "item_abc123",
  "content_index": 0,
  "audio_end_ms": 1500
}
```

| Field | Type | Description |
|---|---|---|
| `item_id` | string | ID of the assistant message item. Only assistant items can be truncated. |
| `content_index` | integer | Always `0` (first content part). |
| `audio_end_ms` | integer | Inclusive duration up to which audio is kept, in ms. Must not exceed actual duration. |

**Critical behavior:** Truncating audio also deletes the server-side text transcript for the truncated portion. This ensures the model's context only contains what the user actually heard.

Server responds with: `conversation.item.truncated`

### 8.9 conversation.item.delete

Removes an item from conversation history.

```json
{
  "type": "conversation.item.delete",
  "item_id": "item_abc123"
}
```

Server responds with: `conversation.item.deleted`

### 8.10 output_audio_buffer.clear (WebRTC only)

Clears the output audio buffer. Should be preceded by `response.cancel`.

```json
{
  "type": "output_audio_buffer.clear"
}
```

Server responds with: `output_audio_buffer.cleared`

Source: https://learn.microsoft.com/en-us/azure/foundry/openai/realtime-audio-reference

---

## 9. Server Events (Complete Reference)

### Session Events

| Event | Description |
|---|---|
| `session.created` | First event on new connection. Contains default session config. |
| `session.updated` | Confirms session config update. Contains full effective config. |

### Conversation Events

| Event | Description |
|---|---|
| `conversation.created` | Sent right after `session.created`. One conversation per session. |
| `conversation.item.created` | Item added to conversation (by client or server). |
| `conversation.item.deleted` | Item removed from conversation. |
| `conversation.item.truncated` | Assistant item was truncated. |
| `conversation.item.input_audio_transcription.completed` | Input audio transcription finished. |
| `conversation.item.input_audio_transcription.failed` | Input audio transcription failed. |

**GA-only events:**
| `conversation.item.added` | New item added (broader lifecycle event). |
| `conversation.item.done` | Item processing complete. |

### Input Audio Buffer Events

| Event | Key Fields | Description |
|---|---|---|
| `input_audio_buffer.committed` | `item_id`, `previous_item_id` | Buffer committed, user message created. |
| `input_audio_buffer.cleared` | -- | Buffer cleared. |
| `input_audio_buffer.speech_started` | `audio_start_ms`, `item_id` | VAD detected speech start. |
| `input_audio_buffer.speech_stopped` | `audio_end_ms`, `item_id` | VAD detected speech end. |

### Output Audio Buffer Events (WebRTC only)

| Event | Key Fields | Description |
|---|---|---|
| `output_audio_buffer.started` | `response_id` | Server began streaming audio to client. |
| `output_audio_buffer.stopped` | `response_id` | Audio buffer fully drained. |
| `output_audio_buffer.cleared` | `response_id` | Output buffer cleared (interruption or manual). |

### Response Lifecycle Events (in order)

```
response.created
  response.output_item.added          (one per output item)
    response.content_part.added       (one per content part)
      response.output_text.delta      (streaming text, if text modality)
      response.output_audio.delta     (streaming audio, if audio modality)
      response.output_audio_transcript.delta  (streaming transcript of audio)
    response.output_text.done
    response.output_audio.done
    response.output_audio_transcript.done
    response.content_part.done
  response.output_item.done
response.done                         (always emitted, includes usage stats)
```

**Important GA renames from Beta:**

| Beta Event Name | GA Event Name |
|---|---|
| `response.text.delta` | `response.output_text.delta` |
| `response.text.done` | `response.output_text.done` |
| `response.audio.delta` | `response.output_audio.delta` |
| `response.audio.done` | `response.output_audio.done` |
| `response.audio_transcript.delta` | `response.output_audio_transcript.delta` |
| `response.audio_transcript.done` | `response.output_audio_transcript.done` |

Note: The Azure reference (which mirrors the OpenAI API closely) still uses the old names (`response.audio.delta` etc.) in some places. Both may work during the transition period. Prefer the GA names for new code.

### Function Call Events

| Event | Key Fields | Description |
|---|---|---|
| `response.function_call_arguments.delta` | `call_id`, `delta` | Streaming function call arguments (JSON string fragments). |
| `response.function_call_arguments.done` | `call_id`, `arguments` | Complete function call arguments (full JSON string). |

### Audio Delta Event Payload

```json
{
  "type": "response.output_audio.delta",
  "event_id": "event_123",
  "response_id": "resp_456",
  "item_id": "item_789",
  "output_index": 0,
  "content_index": 0,
  "delta": "<base64-encoded-PCM16-audio>"
}
```

### response.done Payload (includes usage)

```json
{
  "type": "response.done",
  "event_id": "event_123",
  "response": {
    "id": "resp_456",
    "object": "realtime.response",
    "status": "completed",
    "output": [ ... ],
    "usage": {
      "total_tokens": 500,
      "input_tokens": 200,
      "output_tokens": 300,
      "input_token_details": {
        "cached_tokens": 100,
        "text_tokens": 50,
        "audio_tokens": 150
      },
      "output_token_details": {
        "text_tokens": 50,
        "audio_tokens": 250
      }
    }
  }
}
```

### Error Event

```json
{
  "type": "error",
  "event_id": "event_123",
  "error": {
    "type": "invalid_request_error",
    "code": "invalid_value",
    "message": "Human-readable description",
    "param": "session.tools[0].name",
    "event_id": "client_event_id_that_caused_error"
  }
}
```

### Rate Limits Event

```json
{
  "type": "rate_limits.updated",
  "rate_limits": [
    { "name": "requests", "limit": 200, "remaining": 199, "reset_seconds": 60 },
    { "name": "tokens", "limit": 40000, "remaining": 39500, "reset_seconds": 60 }
  ]
}
```

Source: https://learn.microsoft.com/en-us/azure/foundry/openai/realtime-audio-reference

---

## 10. Tool Calling Flow

### Step 1: Define tools in session

```json
{
  "type": "session.update",
  "session": {
    "tools": [
      {
        "type": "function",
        "name": "github_list_open_prs",
        "description": "List open pull requests for a GitHub repository.",
        "parameters": {
          "type": "object",
          "properties": {
            "owner": { "type": "string" },
            "repo": { "type": "string" }
          },
          "required": ["owner", "repo"]
        }
      }
    ],
    "tool_choice": "auto"
  }
}
```

### Step 2: Model decides to call a function

Server emits:
1. `response.output_item.added` -- item with `type: "function_call"`
2. `response.function_call_arguments.delta` -- streaming JSON fragments
3. `response.function_call_arguments.done` -- complete arguments JSON string
4. `response.output_item.done` -- item complete
5. `response.done` -- response complete (status may be `completed`)

### Step 3: Client executes the function and returns result

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "function_call_output",
    "call_id": "call_abc123",
    "output": "{\"prs\": [{\"number\": 28432, \"title\": \"Fix hydration mismatch\"}]}"
  }
}
```

### Step 4: Client requests model to respond with the result

```json
{
  "type": "response.create"
}
```

**CRITICAL:** You MUST send `response.create` after `conversation.item.create` with the tool result. Without it, the model will not generate a response. The tool result is added to the conversation but no inference is triggered automatically.

### GA Feature: Async Function Calling

The GA `gpt-realtime` model supports async function calling -- the model can generate a placeholder audio response ("Let me look that up...") while waiting for the function to complete, preventing hallucination during tool execution delays.

Source: https://developers.openai.com/api/docs/guides/realtime-conversations

---

## 11. Interruption Protocol

### With VAD Enabled (automatic interruption)

When `turn_detection.interrupt_response` is `true` (default):

1. User starts speaking during model output
2. Server detects speech: emits `input_audio_buffer.speech_started`
3. Server automatically cancels the in-progress response
4. In WebRTC mode: server automatically clears the output audio buffer (emits `output_audio_buffer.cleared`)
5. In WebSocket mode: client must stop playback and track playback position

### With Push-to-Talk (manual interruption)

When `turn_detection` is `null`, the client must handle interruption manually:

1. User presses push-to-talk while model is speaking
2. Client immediately stops audio playback
3. Client records the playback cursor (ms of audio actually played)
4. Client sends `response.cancel`:
   ```json
   { "type": "response.cancel" }
   ```
5. Client sends `conversation.item.truncate`:
   ```json
   {
     "type": "conversation.item.truncate",
     "item_id": "item_id_of_assistant_message",
     "content_index": 0,
     "audio_end_ms": 1500
   }
   ```

### Playback Cursor Tracking (WebSocket mode)

Track cumulative audio duration as chunks arrive:
- Each `response.audio.delta` (or `response.output_audio.delta` in GA) contains base64 audio
- Decode to get byte count: `duration_ms = decoded_bytes / 48` (at 24kHz, 16-bit mono = 48 bytes/ms)
- On interruption: `audio_end_ms = total_scheduled_ms - remaining_unplayed_ms`

### Why Truncation Matters

The server generates audio faster than realtime. Without truncation, the model's context includes content the user never heard. Follow-up responses would reference unheard material, breaking conversation coherence.

Source: https://developers.openai.com/api/docs/guides/realtime-conversations

---

## 12. Out-of-Band Responses

Generate responses outside the default conversation by setting `conversation: "none"` in `response.create`. Useful for:
- Background classification/analysis
- Running parallel operations
- Moderation checks

```json
{
  "type": "response.create",
  "response": {
    "conversation": "none",
    "metadata": { "purpose": "classify-intent" },
    "modalities": ["text"],
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [{ "type": "input_text", "text": "Classify this intent: ..." }]
      }
    ]
  }
}
```

Multiple out-of-band responses can run in parallel. Only one response can write to the default conversation at a time.

---

## 13. GA Migration Summary (from Beta)

| Change | Beta | GA |
|---|---|---|
| Model IDs | `gpt-4o-realtime-preview`, `gpt-4o-mini-realtime-preview` | `gpt-realtime`, `gpt-realtime-mini` |
| Session type field | Not required | Required: `type: "realtime"` or `type: "transcription"` |
| OpenAI-Beta header | Required: `OpenAI-Beta: realtime=v1` | Do NOT include |
| Event names | `response.text.delta`, `response.audio.delta` | `response.output_text.delta`, `response.output_audio.delta` |
| Content part types | `type: "text"`, `type: "audio"` | `type: "output_text"`, `type: "output_audio"` |
| WebRTC SDP endpoint | `POST /v1/realtime` (with SDP) | `POST /v1/realtime/calls` |
| Ephemeral key endpoint | `POST /v1/realtime/sessions` | `POST /v1/realtime/client_secrets` |
| New events | -- | `conversation.item.added`, `conversation.item.done` |
| New features | -- | Async function calling, MCP, hosted prompts, idle timeouts, sideband connections |
| Deprecation | -- | Beta removed 2026-05-07 |

Source: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio-preview-api-migration-guide

---

## 14. Input Audio Transcription

Input audio transcription is NOT native to the model (the model consumes audio directly). It runs asynchronously on a separate speech recognition model and should be treated as a rough guide rather than what the model actually "heard."

Available transcription models:
- `whisper-1`
- `gpt-4o-transcribe`
- `gpt-4o-mini-transcribe`
- `gpt-4o-transcribe-diarize`
- `gpt-4o-mini-transcribe-2025-12-15`

Configuration:
```json
{
  "input_audio_transcription": {
    "model": "gpt-4o-mini-transcribe",
    "language": "en",
    "prompt": "expect words related to technology and programming"
  }
}
```

Transcription results arrive via: `conversation.item.input_audio_transcription.completed`

---

## 15. Noise Reduction

```json
{
  "input_audio_noise_reduction": {
    "type": "near_field"
  }
}
```

| Type | Use Case |
|---|---|
| `near_field` | Close-talking microphones (headphones, earbuds) |
| `far_field` | Far-field microphones (laptop mic, conference room) |

Filters audio before it reaches VAD and the model. Improves VAD accuracy (reduces false positives) and model perception.

---

## 16. Prompting Best Practices (for Realtime Models)

From the official guide:

- Organize instructions into labeled sections: Role, Personality, Context, Tool Usage, Rules, Safety/Escalation
- Bullets outperform paragraphs for instruction clarity
- Use ALL CAPS for emphasis on critical rules
- Add pacing instructions: "Deliver audio response fast, but do not sound rushed"
- Handle unclear audio: "If the user's audio is not clear, ask for clarification"
- Include explicit variety instructions to prevent robotic repetition
- Define escalation criteria: safety risks, repeated complaints, multiple failed attempts
- Sessions can reference stored prompts by ID with version pinning and variable substitution (GA feature)

Source: https://developers.openai.com/api/docs/guides/realtime-models-prompting

---

## 17. Rate Limits

For `gpt-realtime`:
- Tier 1: 200 RPM, 40K TPM
- Tier 5: 20K RPM, 15M TPM

For `gpt-realtime-mini`: Expected to have higher limits given lower cost.

---

## 18. Key Implementation Considerations for Jarvis

1. **Model choice:** `gpt-realtime-mini` for cost efficiency. Sufficient for our use case (voice Q&A + tool calling).

2. **Transport decision (M0 spike):**
   - WebSocket relay: Full server control, simpler tool execution, but audio passes through server (adds latency, bandwidth cost).
   - WebRTC direct: Lower latency audio, but tool calls must round-trip through a sideband connection to the server.

3. **Push-to-talk (WebSocket):** Set `turn_detection: null`. Client sends audio chunks, then `input_audio_buffer.commit` + `response.create` on button release.

4. **Push-to-talk (WebRTC):** Set `turn_detection: null`. Mute/unmute audio track. Send `input_audio_buffer.commit` + `response.create` via data channel on button release. If muting doesn't work cleanly, try `input_audio_buffer.clear` before each push.

5. **Interruption:** Always send both `response.cancel` AND `conversation.item.truncate` with accurate `audio_end_ms`. Without truncation, context will drift.

6. **Tool results:** Always follow `conversation.item.create` (with tool output) with `response.create`. The model does NOT auto-respond to tool results.

7. **Session duration:** Max 60 minutes. Plan for reconnection in production.

8. **Audio format for WebSocket:** PCM16, 24kHz, mono. 48 bytes per ms. Base64-encode for transmission.

9. **Noise reduction:** Enable `near_field` for headphone users (our frontline workers likely use headsets).

10. **GA vs Beta:** Use GA endpoints and event names. The beta is being removed in May 2026.
