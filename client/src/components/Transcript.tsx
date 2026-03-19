import { useEffect, useRef } from "react";
import type { TranscriptTurn } from "../types.js";
import { EvidenceCard } from "./EvidenceCard.js";
import { ToolCallIndicator } from "./ToolCallIndicator.js";

interface TranscriptProps {
  turns: readonly TranscriptTurn[];
}

export function Transcript({ turns }: TranscriptProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  const turnsLength = turns.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnsLength]);

  return (
    <div style={{ minHeight: 300, maxHeight: "60vh", overflowY: "auto", padding: "12px 0" }}>
      {turns.length === 0 && (
        <p style={{ color: "#888", textAlign: "center" }}>
          Press the button and speak to start a conversation.
        </p>
      )}
      {turns.map((turn) => (
        <div
          key={turn.id}
          style={{
            marginBottom: 12,
            padding: 8,
            borderRadius: 6,
            background: turn.role === "user" ? "#f0f4f8" : "#e8f5e9",
          }}
        >
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            <strong>{turn.role === "user" ? "You" : "Jarvis"}</strong>
            {" \u00b7 "}
            {turn.timestamp.toLocaleTimeString()}
            {turn.interrupted && <span style={{ color: "#f0ad4e" }}> [interrupted]</span>}
          </div>
          {turn.toolCalls?.map((tc) => (
            <ToolCallIndicator key={tc.callId} toolCall={tc} />
          ))}
          <div style={{ fontSize: 14 }}>{turn.text || "\u2026"}</div>
          {turn.evidence && turn.evidence.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {turn.evidence.map((ev, i) => (
                <EvidenceCard key={`${ev.source}-${ev.entity}-${i}`} evidence={ev} />
              ))}
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
