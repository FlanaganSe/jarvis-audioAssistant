import type { ClientMessage, ServerMessage } from "@jarvis/shared";
import type { WebSocket as WsType } from "ws";
import WebSocket from "ws";
import type { Config } from "../config.js";
import type { SessionState } from "../types.js";
import { sessionManager } from "./session.js";

const OPENAI_MODEL = "gpt-realtime-mini";

const SYSTEM_PROMPT = `You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct. Keep spoken answers to 1-3 sentences unless the user asks for more detail.

Rules:
- Be helpful and conversational for general questions.
- If you don't know something, say "I don't know" rather than guessing.
- When the user asks about your capabilities, honestly describe what you can currently do: have a voice conversation, answer general questions. You cannot yet access GitHub, APIs, or external data -- those features are coming soon.
- Keep responses concise. The user is busy and needs fast answers.`;

function send(ws: WsType, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createRelaySession(clientWs: WsType, config: Config, session: SessionState): void {
  const log = (msg: string) => console.log(`[relay:${session.sessionId.slice(0, 8)}] ${msg}`);

  const openaiUrl = `wss://api.openai.com/v1/realtime?model=${OPENAI_MODEL}`;
  const openai = new WebSocket(openaiUrl, {
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
  });

  openai.on("open", () => {
    log("OpenAI WS connected, sending session.update");
    // Style A nested schema — verified working in M0 spike and confirmed in M1 testing
    openai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: SYSTEM_PROMPT,
          output_modalities: ["audio"],
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              turn_detection: null,
              transcription: { model: "gpt-4o-mini-transcribe" },
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
              voice: "ash",
            },
          },
        },
      }),
    );
  });

  openai.on("message", (data) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(data.toString());
    } catch {
      log("Failed to parse OpenAI message");
      return;
    }

    switch (event.type) {
      case "session.created":
        log(`Session created: ${(event.session as Record<string, unknown>)?.id}`);
        break;

      case "session.updated":
        log("Session configured");
        send(clientWs, { type: "session.ready" });
        break;

      case "response.output_item.added": {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === "message" && item?.role === "assistant") {
          send(clientWs, { type: "response.started", itemId: item.id as string });
        }
        break;
      }

      case "response.audio.delta":
      case "response.output_audio.delta":
        send(clientWs, { type: "audio", data: event.delta as string });
        break;

      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        send(clientWs, {
          type: "transcript",
          role: "assistant",
          text: event.delta as string,
          delta: true,
        });
        break;

      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
        send(clientWs, {
          type: "transcript",
          role: "assistant",
          text: event.transcript as string,
          delta: false,
        });
        break;

      case "conversation.item.input_audio_transcription.completed":
        send(clientWs, {
          type: "transcript",
          role: "user",
          text: event.transcript as string,
          delta: false,
        });
        break;

      case "conversation.item.input_audio_transcription.failed":
        log(`Input transcription failed: ${JSON.stringify(event.error)}`);
        break;

      case "input_audio_buffer.committed":
        send(clientWs, { type: "turn.started" });
        break;

      case "response.done": {
        send(clientWs, { type: "response.done" });
        const response = event.response as Record<string, unknown> | undefined;
        if (response?.usage) {
          log(`Usage: ${JSON.stringify(response.usage)}`);
        }
        break;
      }

      case "error":
        log(`OpenAI error: ${JSON.stringify(event.error)}`);
        send(clientWs, {
          type: "error",
          message:
            (event.error as Record<string, unknown>)?.message?.toString() ?? "Unknown OpenAI error",
          code: (event.error as Record<string, unknown>)?.code?.toString(),
        });
        break;

      case "rate_limits.updated":
      case "response.created":
      case "response.output_item.done":
      case "response.content_part.added":
      case "response.content_part.done":
      case "conversation.item.created":
        break;

      default:
        log(`Unhandled OpenAI event: ${event.type}`);
    }
  });

  openai.on("error", (err) => {
    log(`OpenAI WS error: ${err.message}`);
    send(clientWs, { type: "error", message: `OpenAI connection error: ${err.message}` });
  });

  openai.on("close", (code, reason) => {
    log(`OpenAI WS closed: ${code} ${reason.toString()}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, "OpenAI session ended");
    }
  });

  // Handle messages from browser client
  clientWs.on("message", (rawData: Buffer) => {
    if (openai.readyState !== WebSocket.OPEN) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      log("Failed to parse client message");
      return;
    }

    switch (msg.type) {
      case "audio":
        openai.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.data }));
        break;

      case "commit":
        sessionManager.touch(session.sessionId);
        session.turnCount++;
        openai.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        openai.send(JSON.stringify({ type: "response.create" }));
        log(`Turn ${session.turnCount} committed`);
        break;

      case "cancel":
        log("Cancelling response");
        openai.send(JSON.stringify({ type: "response.cancel" }));
        break;

      case "truncate":
        log(`Truncating item ${msg.itemId} at ${msg.audioEndMs}ms`);
        openai.send(
          JSON.stringify({
            type: "conversation.item.truncate",
            item_id: msg.itemId,
            content_index: 0,
            audio_end_ms: msg.audioEndMs,
          }),
        );
        break;
    }
  });

  clientWs.on("close", () => {
    log("Client disconnected");
    if (openai.readyState === WebSocket.OPEN) {
      openai.close();
    }
  });
}
