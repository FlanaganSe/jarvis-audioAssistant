import type { ClientMessage, ServerMessage, SessionStatus } from "@jarvis/shared";
import { useCallback, useRef, useState } from "react";
import type { TranscriptTurn } from "../types.js";
import { useAudioCapture } from "./useAudioCapture.js";
import { useAudioPlayback } from "./useAudioPlayback.js";

type DisplayStatus = SessionStatus | "disconnected" | "error";

interface VoiceSession {
  status: DisplayStatus;
  turns: readonly TranscriptTurn[];
  connectedAt: Date | null;
  error: string | null;
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

  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<DisplayStatus>("disconnected");
  const currentItemIdRef = useRef<string | null>(null);
  const currentAssistantTextRef = useRef("");
  const currentAssistantTurnIdRef = useRef<string | null>(null);

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
      const res = await fetch("/api/auth/token", { method: "POST" });
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

    const userTurnId = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      { id: userTurnId, role: "user", text: "\u2026", timestamp: new Date() },
    ]);

    try {
      await capture.start((base64) => {
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
    sendMessage({ type: "commit" });
    updateStatus("processing");
    console.log(`[latency] Commit sent at ${Date.now()}`);
  }, [updateStatus, capture, sendMessage]);

  return {
    status,
    turns,
    connectedAt,
    error,
    connect,
    disconnect,
    startListening,
    stopListening,
  };
}
