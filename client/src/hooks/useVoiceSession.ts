import { AUDIO } from "@jarvis/shared";
import type { ClientMessage, ServerMessage, SessionStatus } from "@jarvis/shared";
import { useCallback, useRef, useState } from "react";

/** OpenAI requires >=100ms; use 150ms for safety margin */
const MIN_COMMIT_BYTES = AUDIO.BYTES_PER_MS * 150;
import type { TranscriptTurn } from "../types.js";
import { useAudioCapture } from "./useAudioCapture.js";
import { useAudioPlayback } from "./useAudioPlayback.js";

type DisplayStatus = SessionStatus | "disconnected" | "error";

interface VoiceSession {
  status: DisplayStatus;
  turns: readonly TranscriptTurn[];
  connectedAt: Date | null;
  error: string | null;
  userId: string | null;
  audioLevel: number;
  connect: () => void;
  disconnect: () => void;
  startListening: () => void;
  stopListening: () => void;
}

export function useVoiceSession(): VoiceSession {
  const [status, setStatus] = useState<DisplayStatus>("disconnected");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem("jarvis_userId"));

  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<DisplayStatus>("disconnected");
  const currentItemIdRef = useRef<string | null>(null);
  const currentAssistantTextRef = useRef("");
  const currentAssistantTurnIdRef = useRef<string | null>(null);
  const pendingUserTurnIdRef = useRef<string | null>(null);
  const audioBytesSentRef = useRef(0);

  const capture = useAudioCapture();
  const { play, stop: stopPlayback } = useAudioPlayback();

  const updateStatus = useCallback((s: DisplayStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(async () => {
    // Guard against duplicate connect calls
    if (statusRef.current === "connecting") return;

    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    updateStatus("connecting");
    setError(null);

    try {
      // Ensure persistent user identity
      let userId = localStorage.getItem("jarvis_userId");
      if (!userId) {
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!regRes.ok) throw new Error("Failed to register user");
        const regData = await regRes.json();
        userId = regData.userId as string;
        localStorage.setItem("jarvis_userId", userId);
        setUserId(userId);
      }

      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to get auth token");
      const { token } = await res.json();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/relay?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectedAt(new Date());
      };

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "session.ready":
            updateStatus("connected");
            break;

          case "audio":
            if (statusRef.current === "processing") {
              updateStatus("speaking");
              console.log(`[latency] First audio received at ${Date.now()}`);
            }
            play(msg.data);
            break;

          case "transcript":
            if (msg.role === "assistant") {
              if (msg.delta) {
                currentAssistantTextRef.current += msg.text;
                const turnId = currentAssistantTurnIdRef.current;
                if (turnId) {
                  setTurns((prev) =>
                    prev.map((t) =>
                      t.id === turnId ? { ...t, text: currentAssistantTextRef.current } : t,
                    ),
                  );
                }
              } else {
                const turnId = currentAssistantTurnIdRef.current;
                if (turnId) {
                  setTurns((prev) =>
                    prev.map((t) => (t.id === turnId ? { ...t, text: msg.text } : t)),
                  );
                }
              }
            } else {
              setTurns((prev) => {
                const lastUserTurn = [...prev].reverse().find((t) => t.role === "user");
                if (lastUserTurn && lastUserTurn.text === "\u2026") {
                  return prev.map((t) => (t.id === lastUserTurn.id ? { ...t, text: msg.text } : t));
                }
                return prev;
              });
            }
            break;

          case "response.started":
            currentItemIdRef.current = msg.itemId;
            currentAssistantTextRef.current = "";
            {
              const turnId = crypto.randomUUID();
              currentAssistantTurnIdRef.current = turnId;
              setTurns((prev) => [
                ...prev,
                { id: turnId, role: "assistant", text: "", timestamp: new Date() },
              ]);
            }
            break;

          case "response.done":
            currentItemIdRef.current = null;
            currentAssistantTurnIdRef.current = null;
            currentAssistantTextRef.current = "";
            // Transition to connected — handle both "speaking" and "processing" (empty/short responses)
            if (statusRef.current === "speaking" || statusRef.current === "processing") {
              setTimeout(() => {
                if (statusRef.current === "speaking" || statusRef.current === "processing") {
                  updateStatus("connected");
                }
              }, 300);
            }
            break;

          case "tool.started": {
            const turnId = currentAssistantTurnIdRef.current;
            if (turnId) {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        toolCalls: [
                          ...(t.toolCalls ?? []),
                          {
                            callId: msg.callId,
                            name: msg.name,
                            status: "running" as const,
                            args: msg.args,
                          },
                        ],
                      }
                    : t,
                ),
              );
            }
            break;
          }

          case "tool.done": {
            const turnId = currentAssistantTurnIdRef.current;
            if (turnId) {
              setTurns((prev) =>
                prev.map((t) => {
                  if (t.id !== turnId) return t;
                  const toolCalls = (t.toolCalls ?? []).map((tc) =>
                    tc.callId === msg.callId
                      ? { ...tc, status: "done" as const, durationMs: msg.durationMs }
                      : tc,
                  );
                  const evidence = msg.evidence
                    ? [...(t.evidence ?? []), msg.evidence]
                    : t.evidence;
                  return { ...t, toolCalls, evidence };
                }),
              );
            }
            break;
          }

          case "tool.error": {
            const turnId = currentAssistantTurnIdRef.current;
            if (turnId) {
              setTurns((prev) =>
                prev.map((t) => {
                  if (t.id !== turnId) return t;
                  const toolCalls = (t.toolCalls ?? []).map((tc) =>
                    tc.callId === msg.callId
                      ? { ...tc, status: "error" as const, error: msg.error }
                      : tc,
                  );
                  return { ...t, toolCalls };
                }),
              );
            }
            break;
          }

          case "proposal": {
            const turnId = currentAssistantTurnIdRef.current;
            if (turnId) {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        proposal: {
                          type: msg.proposalType,
                          title: msg.title,
                          issueRef: msg.issueRef,
                          data: msg.data,
                        },
                      }
                    : t,
                ),
              );
            }
            break;
          }

          case "turn.started":
            break;

          case "session.timeout":
            updateStatus("disconnected");
            setError("Session ended due to inactivity");
            ws.close();
            break;

          case "error":
            console.error("[ws] Server error:", msg.message);
            setError(msg.message);
            break;
        }
      };

      ws.onclose = (event) => {
        if (statusRef.current !== "disconnected") {
          updateStatus("disconnected");
          if (event.code === 4001) {
            setError("Session expired — please reconnect");
          } else if (event.code !== 1000) {
            setError("Connection lost");
          }
        }
        wsRef.current = null;
      };

      ws.onerror = () => {
        updateStatus("error");
        setError("WebSocket connection error");
      };
    } catch (err) {
      updateStatus("error");
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [updateStatus, play]);

  const disconnect = useCallback(() => {
    capture.stop();
    stopPlayback();
    wsRef.current?.close(1000, "User ended session");
    wsRef.current = null;
    updateStatus("disconnected");
    setConnectedAt(null);
  }, [updateStatus, capture, stopPlayback]);

  const startListening = useCallback(async () => {
    if (statusRef.current === "speaking") {
      // Interruption: stop playback, cancel response, truncate
      const audioPlayedMs = stopPlayback();
      sendMessage({ type: "cancel" });
      if (currentItemIdRef.current) {
        sendMessage({
          type: "truncate",
          itemId: currentItemIdRef.current,
          audioEndMs: audioPlayedMs,
        });
        const turnId = currentAssistantTurnIdRef.current;
        if (turnId) {
          setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, interrupted: true } : t)));
        }
      }
    }

    updateStatus("listening");

    audioBytesSentRef.current = 0;
    const userTurnId = crypto.randomUUID();
    pendingUserTurnIdRef.current = userTurnId;
    setTurns((prev) => [
      ...prev,
      { id: userTurnId, role: "user", text: "\u2026", timestamp: new Date() },
    ]);

    try {
      await capture.start((base64) => {
        audioBytesSentRef.current += Math.floor((base64.length * 3) / 4);
        sendMessage({ type: "audio", data: base64 });
      });
    } catch (err) {
      console.error("Failed to start audio capture:", err);
      updateStatus("error");
      setError(err instanceof Error ? err.message : "Microphone access failed");
    }
  }, [updateStatus, capture, stopPlayback, sendMessage]);

  const stopListening = useCallback(() => {
    if (statusRef.current !== "listening") return;
    capture.stop();

    if (audioBytesSentRef.current < MIN_COMMIT_BYTES) {
      // Too short to commit — OpenAI requires >=100ms of audio
      const turnId = pendingUserTurnIdRef.current;
      if (turnId) {
        setTurns((prev) => prev.filter((t) => t.id !== turnId));
      }
      pendingUserTurnIdRef.current = null;
      updateStatus("connected");
      return;
    }

    pendingUserTurnIdRef.current = null;
    sendMessage({ type: "commit" });
    updateStatus("processing");
    console.log(`[latency] Commit sent at ${Date.now()}`);
  }, [updateStatus, capture, sendMessage]);

  return {
    status,
    turns,
    connectedAt,
    error,
    userId,
    audioLevel: capture.level,
    connect,
    disconnect,
    startListening,
    stopListening,
  };
}
