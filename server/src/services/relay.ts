import type { ClientMessage, ServerMessage } from "@jarvis/shared";
import type { WebSocket as WsType } from "ws";
import WebSocket from "ws";
import type { Config } from "../config.js";
import { getDb } from "../db/index.js";
import type { SessionState } from "../types.js";
import { endDbSession, saveMessage } from "./persistence.js";
import { sessionManager } from "./session.js";
import { generateSessionSummary } from "./summary.js";
import { toolRegistry } from "./tool-registry.js";

const OPENAI_MODEL = "gpt-realtime-mini";

const SYSTEM_PROMPT = `You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct. Keep spoken answers to 1-3 sentences unless the user asks for more detail.

Rules:
- For questions about GitHub repositories, PRs, issues, or merges, you MUST use the appropriate github_ tool. NEVER fabricate repository data, PR numbers, issue counts, or author names.
- For questions about weather, temperature, or conditions at a location, you MUST use the weather_get_current tool. Never guess weather data.
- When you need to look something up, briefly acknowledge the request first (e.g., "Let me check that for you"), then call the tool.
- When reporting tool results, cite the exact numbers and names from the tool response. Do not round, approximate, or embellish.
- When reporting weather data, mention how recent the data is (e.g., "based on data from about 30 seconds ago").
- If you don't have a tool to answer a question, say "I don't have that information right now."
- If a tool returns an error, report the error honestly.
- Be helpful and conversational for general questions.
- If you don't know something, say "I don't know" rather than guessing.
- Keep responses concise. The user is busy and needs fast answers.`;

function send(ws: WsType, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function persistMessage(
  session: SessionState,
  msg: {
    role: string;
    content: string;
    toolCalls?: unknown;
    toolName?: string;
    evidence?: unknown;
  },
): void {
  if (!session.dbSessionId) return;
  const db = getDb();
  void saveMessage(db, session.dbSessionId, msg).catch((err) => {
    console.warn(`[relay] Failed to persist message: ${err}`);
  });
}

export function createRelaySession(clientWs: WsType, config: Config, session: SessionState): void {
  const log = (msg: string) => console.log(`[relay:${session.sessionId.slice(0, 8)}] ${msg}`);

  session.wsRef = clientWs;

  const openaiUrl = `wss://api.openai.com/v1/realtime?model=${OPENAI_MODEL}`;
  const openai = new WebSocket(openaiUrl, {
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
  });

  openai.on("open", () => {
    log("OpenAI WS connected, sending session.update");
    openai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: SYSTEM_PROMPT,
          output_modalities: ["audio"],
          tools: toolRegistry.getOpenAITools(),
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

  function sendToOpenAI(payload: string): void {
    if (openai.readyState === WebSocket.OPEN) {
      openai.send(payload);
    }
  }

  async function handleToolCall(callId: string, name: string, rawArgs: string): Promise<void> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArgs);
    } catch {
      const errorMsg = `Failed to parse tool arguments for ${name}`;
      send(clientWs, { type: "tool.error", callId, name, error: errorMsg });
      sendToOpenAI(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ error: errorMsg }),
          },
        }),
      );
      sendToOpenAI(JSON.stringify({ type: "response.create" }));
      return;
    }

    send(clientWs, { type: "tool.started", callId, name, args });

    const startTime = Date.now();
    try {
      const result = await toolRegistry.execute(name, args);
      const durationMs = Date.now() - startTime;

      send(clientWs, {
        type: "tool.done",
        callId,
        name,
        durationMs,
        evidence: result.evidence,
      });

      persistMessage(session, {
        role: "tool",
        content: result.output,
        toolName: name,
        evidence: result.evidence,
      });

      sendToOpenAI(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: result.output,
          },
        }),
      );
      sendToOpenAI(JSON.stringify({ type: "response.create" }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown tool error";
      send(clientWs, { type: "tool.error", callId, name, error: errorMsg });

      persistMessage(session, {
        role: "tool",
        content: JSON.stringify({ error: errorMsg }),
        toolName: name,
      });

      sendToOpenAI(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ error: errorMsg }),
          },
        }),
      );
      sendToOpenAI(JSON.stringify({ type: "response.create" }));
    }
  }

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
        persistMessage(session, {
          role: "assistant",
          content: event.transcript as string,
        });
        break;

      case "conversation.item.input_audio_transcription.completed":
        send(clientWs, {
          type: "transcript",
          role: "user",
          text: event.transcript as string,
          delta: false,
        });
        persistMessage(session, {
          role: "user",
          content: event.transcript as string,
        });
        break;

      case "conversation.item.input_audio_transcription.failed":
        log(`Input transcription failed: ${JSON.stringify(event.error)}`);
        break;

      case "input_audio_buffer.committed":
        send(clientWs, { type: "turn.started" });
        break;

      case "response.function_call_arguments.done": {
        const callId = event.call_id as string;
        const name = event.name as string;
        const rawArgs = event.arguments as string;
        void handleToolCall(callId, name, rawArgs).catch((err) => {
          log(`Tool call error: ${err}`);
        });
        break;
      }

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
      case "response.function_call_arguments.delta":
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
    // End the DB session and generate summary async
    if (session.dbSessionId) {
      const db = getDb();
      void (async () => {
        try {
          await endDbSession(db, session.dbSessionId);
          await generateSessionSummary(db, session.dbSessionId, config.openaiApiKey);
          log("Session summary generated");
        } catch (err) {
          log(`Session summary failed: ${err}`);
        }
      })();
    }
  });
}
