import type { FastifyInstance } from "fastify";
import type { WebSocket as WsType } from "ws";
import WebSocket from "ws";
import { GITHUB_TOOL_DEF, SYSTEM_INSTRUCTIONS, OPENAI_MODEL, executeGitHubTool } from "./github-tool.js";

/**
 * Architecture A: WebSocket Relay
 * Browser <--WS--> Fastify <--WS--> OpenAI Realtime
 * All audio passes through the server.
 */
export function registerRelayRoute(fastify: FastifyInstance): void {
  (fastify as any).get("/api/relay", { websocket: true }, (socket: WsType, _req: any) => {
    const log = (msg: string) => console.log(`[relay] ${msg}`);
    log("Client connected, opening OpenAI WS...");

    const openaiUrl = `wss://api.openai.com/v1/realtime?model=${OPENAI_MODEL}`;
    const openai = new WebSocket(openaiUrl, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });

    openai.on("open", () => {
      log("OpenAI WS connected, sending session.update");
      openai.send(JSON.stringify({
        type: "session.update",
        session: {
          instructions: SYSTEM_INSTRUCTIONS,
          modalities: ["text", "audio"],
          voice: "ash",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: null,
          tools: [GITHUB_TOOL_DEF],
          tool_choice: "auto",
          temperature: 0.8,
        },
      }));
    });

    openai.on("message", async (data) => {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case "session.updated":
          log("Session configured");
          socket.send(JSON.stringify({ type: "session.ready" }));
          break;

        case "session.created":
          log(`Session created: ${event.session?.id}`);
          break;

        // GA audio event name
        case "response.output_audio.delta":
          // Forward audio to browser (base64 PCM16)
          socket.send(JSON.stringify({
            type: "audio",
            delta: event.delta,
            item_id: event.item_id,
            response_id: event.response_id,
          }));
          break;

        // Also handle beta name during transition
        case "response.audio.delta":
          socket.send(JSON.stringify({
            type: "audio",
            delta: event.delta,
            item_id: event.item_id,
            response_id: event.response_id,
          }));
          break;

        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
          socket.send(JSON.stringify({
            type: "transcript",
            delta: event.delta,
            item_id: event.item_id,
          }));
          break;

        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          socket.send(JSON.stringify({
            type: "transcript.done",
            transcript: event.transcript,
            item_id: event.item_id,
          }));
          break;

        case "conversation.item.input_audio_transcription.completed":
          socket.send(JSON.stringify({
            type: "user_transcript",
            transcript: event.transcript,
            item_id: event.item_id,
          }));
          break;

        case "response.function_call_arguments.done": {
          log(`Tool call: ${event.name}(${event.arguments})`);
          const toolCallStart = Date.now();
          socket.send(JSON.stringify({
            type: "tool_call",
            name: event.name,
            arguments: event.arguments,
            call_id: event.call_id,
          }));

          try {
            const args = JSON.parse(event.arguments);
            const result = await executeGitHubTool(args);
            const toolCallMs = Date.now() - toolCallStart;

            log(`Tool result in ${toolCallMs}ms`);
            socket.send(JSON.stringify({
              type: "tool_result",
              call_id: event.call_id,
              result,
              duration_ms: toolCallMs,
            }));

            // Send tool output back to OpenAI
            openai.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.call_id,
                output: result,
              },
            }));

            // Trigger response generation
            openai.send(JSON.stringify({ type: "response.create" }));
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            log(`Tool error: ${errorMsg}`);
            openai.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.call_id,
                output: JSON.stringify({ error: errorMsg }),
              },
            }));
            openai.send(JSON.stringify({ type: "response.create" }));
          }
          break;
        }

        case "response.created":
          socket.send(JSON.stringify({
            type: "response.created",
            response_id: event.response?.id,
          }));
          break;

        case "response.done":
          socket.send(JSON.stringify({
            type: "response.done",
            response_id: event.response?.id,
            usage: event.response?.usage,
          }));
          break;

        case "input_audio_buffer.committed":
          socket.send(JSON.stringify({
            type: "input_committed",
            item_id: event.item_id,
          }));
          break;

        case "error":
          log(`OpenAI error: ${JSON.stringify(event.error)}`);
          socket.send(JSON.stringify({
            type: "error",
            error: event.error,
          }));
          break;

        case "rate_limits.updated":
          break; // Ignore silently

        default:
          // Log unhandled events for debugging
          if (!event.type.startsWith("response.output_item") &&
              !event.type.startsWith("response.content_part") &&
              !event.type.startsWith("conversation.")) {
            log(`Unhandled event: ${event.type}`);
          }
      }
    });

    openai.on("error", (err) => {
      log(`OpenAI WS error: ${err.message}`);
      socket.send(JSON.stringify({ type: "error", error: { message: err.message } }));
    });

    openai.on("close", (code, reason) => {
      log(`OpenAI WS closed: ${code} ${reason.toString()}`);
      socket.close();
    });

    // Handle messages from browser
    socket.on("message", (data: Buffer) => {
      if (openai.readyState !== WebSocket.OPEN) return;

      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case "audio":
          // Forward audio to OpenAI
          openai.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: msg.audio,
          }));
          break;

        case "commit":
          openai.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openai.send(JSON.stringify({ type: "response.create" }));
          break;

        case "cancel":
          openai.send(JSON.stringify({ type: "response.cancel" }));
          break;

        case "truncate":
          openai.send(JSON.stringify({
            type: "conversation.item.truncate",
            item_id: msg.item_id,
            content_index: 0,
            audio_end_ms: msg.audio_end_ms,
          }));
          break;

        default:
          log(`Unknown client message: ${msg.type}`);
      }
    });

    socket.on("close", () => {
      log("Client disconnected");
      if (openai.readyState === WebSocket.OPEN) openai.close();
    });
  });
}
