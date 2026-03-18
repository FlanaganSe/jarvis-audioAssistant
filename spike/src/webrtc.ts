import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { GITHUB_TOOL_DEF, SYSTEM_INSTRUCTIONS, OPENAI_MODEL, executeGitHubTool } from "./github-tool.js";

/**
 * Architecture B: WebRTC + Server-Side Tool Execution
 *
 * Browser <--WebRTC audio--> OpenAI Realtime (direct)
 * Browser <--data channel events--> OpenAI Realtime (direct)
 * Browser <--WS tool calls--> Fastify (tool execution only)
 *
 * The server only handles:
 * 1. SDP exchange (proxies to OpenAI, keeps API key server-side)
 * 2. Tool execution (receives tool calls from browser, executes, returns results)
 */
export function registerWebRTCRoutes(fastify: FastifyInstance): void {
  // POST /api/rtc/connect — SDP exchange proxy
  fastify.post("/api/rtc/connect", async (request, reply) => {
    const log = (msg: string) => console.log(`[webrtc] ${msg}`);
    const { sdp } = request.body as { sdp: string };

    if (!sdp) {
      return reply.code(400).send({ error: "Missing SDP offer" });
    }

    log("SDP exchange: forwarding offer to OpenAI");

    // Build multipart form with SDP + session config
    const formData = new FormData();
    formData.set("sdp", sdp);
    formData.set("session", JSON.stringify({
      type: "realtime",
      model: OPENAI_MODEL,
      instructions: SYSTEM_INSTRUCTIONS,
      modalities: ["text", "audio"],
      voice: "ash",
      input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
      turn_detection: null,
      tools: [GITHUB_TOOL_DEF],
      tool_choice: "auto",
      temperature: 0.8,
    }));

    try {
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`OpenAI SDP error: ${response.status} ${errorText}`);
        return reply.code(response.status).send({ error: errorText });
      }

      const answerSdp = await response.text();
      log("SDP exchange complete");
      return reply.type("application/sdp").send(answerSdp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`SDP exchange failed: ${msg}`);
      return reply.code(500).send({ error: msg });
    }
  });

  // WebSocket /api/tools — tool execution forwarding
  (fastify as any).get("/api/tools", { websocket: true }, (socket: WebSocket, _req: any) => {
    const log = (msg: string) => console.log(`[webrtc-tools] ${msg}`);
    log("Tool WS connected");

    socket.on("message", async (data: Buffer) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "tool_call") {
        const start = Date.now();
        log(`Executing tool: ${msg.name}(${msg.arguments})`);

        try {
          const args = JSON.parse(msg.arguments);
          const result = await executeGitHubTool(args);
          const duration = Date.now() - start;
          log(`Tool completed in ${duration}ms`);

          socket.send(JSON.stringify({
            type: "tool_result",
            call_id: msg.call_id,
            output: result,
            duration_ms: duration,
          }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          log(`Tool error: ${errorMsg}`);
          socket.send(JSON.stringify({
            type: "tool_result",
            call_id: msg.call_id,
            output: JSON.stringify({ error: errorMsg }),
            duration_ms: Date.now() - start,
          }));
        }
      }
    });

    socket.on("close", () => log("Tool WS disconnected"));
  });
}
