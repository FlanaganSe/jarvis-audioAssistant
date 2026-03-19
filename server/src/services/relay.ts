import type { ClientMessage, ServerMessage } from "@jarvis/shared";
import { eq } from "drizzle-orm";
import type { WebSocket as WsType } from "ws";
import WebSocket from "ws";
import type { Config } from "../config.js";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import type { ProposalToolResult } from "../tools/github-proposals.js";
import type { ToolContext } from "../tools/types.js";
import type { SessionState } from "../types.js";
import { endDbSession, saveMessage } from "./persistence.js";
import { sessionManager } from "./session.js";
import { queueSummaryJob } from "./summary-jobs.js";
import { generateSessionSummary } from "./summary.js";
import { toolRegistry } from "./tool-registry.js";

const OPENAI_MODEL = "gpt-realtime-mini";

const BASE_SYSTEM_PROMPT = `You are Jarvis, a voice assistant for frontline workers. You are calm, concise, and direct.

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
- For past conversation recall: use memory_recall. Never fabricate memories. Cite the session date and specific facts.
- For capability questions ("what can you do"): use jarvis_capabilities. Report actual capabilities accurately — never claim abilities you don't have.
- For preference management: when the user says "remember that...", "from now on...", or "always/never", you MUST call preference_set. Use preference_list when asked about preferences. Use preference_delete when told to "forget that" or "stop doing X".
- For fix proposals, PR drafts, or comment drafts: use github_propose_action. ALWAYS explain that the proposal needs approval — you cannot execute changes directly.

TRUST RULES:
- Never fabricate repository data, PR numbers, issue counts, weather readings, or memories.
- If a tool returns an error, report it honestly.
- If the user asks about something outside your capabilities, say so clearly and suggest what you can do instead.
- For action proposals, always be clear: "This is a proposal. It would need your approval before any changes are made."`;

async function buildSystemPrompt(userId?: string): Promise<string> {
  if (!userId) return BASE_SYSTEM_PROMPT;

  try {
    const db = getDb();
    const [user] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const prefs = Array.isArray(user?.preferences) ? (user.preferences as string[]) : [];
    if (prefs.length === 0) return BASE_SYSTEM_PROMPT;

    const prefSection = prefs.map((p, i) => `${i + 1}. ${p}`).join("\n");
    return `${BASE_SYSTEM_PROMPT}\n\nUSER PREFERENCES (follow these standing instructions):\n${prefSection}`;
  } catch (err) {
    console.warn(`[relay] Failed to load user preferences: ${err}`);
    return BASE_SYSTEM_PROMPT;
  }
}

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

  // Keepalive pings to prevent Railway's ~60s TCP idle timeout
  const PING_INTERVAL_MS = 25_000;
  const pingInterval = setInterval(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.ping();
    }
  }, PING_INTERVAL_MS);

  openai.on("open", () => {
    log("OpenAI WS connected, building system prompt");
    void buildSystemPrompt(session.userId).then((instructions) => {
      log("Sending session.update with preferences injected");
      openai.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions,
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

    const toolContext: ToolContext = {
      userId: session.userId,
      sessionId: session.sessionId,
      db: getDb(),
    };

    const startTime = Date.now();
    try {
      const result = await toolRegistry.execute(name, args, toolContext);
      const durationMs = Date.now() - startTime;

      send(clientWs, {
        type: "tool.done",
        callId,
        name,
        durationMs,
        evidence: result.evidence,
      });

      // Send proposal card to client if this was a proposal tool
      const proposalResult = result as ProposalToolResult;
      if (proposalResult.proposalData) {
        send(clientWs, {
          type: "proposal",
          callId,
          proposalType: proposalResult.proposalData.type as
            | "fix_plan"
            | "pr_outline"
            | "comment_draft",
          title: proposalResult.proposalData.title,
          issueRef: proposalResult.proposalData.issueRef,
          data: proposalResult.proposalData.data,
        });
      }

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
    clearInterval(pingInterval);
    if (openai.readyState === WebSocket.OPEN) {
      openai.close();
    }
    // End the DB session and generate summary async
    if (session.dbSessionId) {
      const db = getDb();
      const summaryJob = (async () => {
        try {
          await endDbSession(db, session.dbSessionId);
          await generateSessionSummary(db, session.dbSessionId, config.openaiApiKey);
          log("Session summary generated");
        } catch (err) {
          log(`Session summary failed: ${err}`);
        }
      })();

      queueSummaryJob(summaryJob);
    }
  });
}
