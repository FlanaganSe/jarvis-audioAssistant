import { useEffect, useRef } from "react";
import { colors, fontSizes, radii, spacing } from "../styles.js";
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
    <div
      style={{
        flex: 1,
        minHeight: 200,
        maxHeight: "60vh",
        overflowY: "auto",
        padding: `${spacing.md}px 0`,
      }}
    >
      {turns.length === 0 && (
        <p style={{ color: colors.textMuted, textAlign: "center", padding: spacing.xxl }}>
          Press the button and speak to start a conversation.
        </p>
      )}
      {turns.map((turn) => {
        const isUser = turn.role === "user";
        return (
          <div
            key={turn.id}
            style={{
              display: "flex",
              justifyContent: isUser ? "flex-end" : "flex-start",
              marginBottom: spacing.sm,
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: `${spacing.sm}px ${spacing.md}px`,
                borderRadius: radii.md,
                background: isUser ? colors.userBubble : colors.assistantBubble,
                border: `1px solid ${colors.border}`,
                opacity: turn.interrupted ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  fontSize: fontSizes.xs,
                  color: colors.textMuted,
                  marginBottom: spacing.xs,
                }}
              >
                <strong style={{ color: colors.textSecondary }}>{isUser ? "You" : "Jarvis"}</strong>
                {" \u00b7 "}
                {turn.timestamp.toLocaleTimeString()}
                {turn.interrupted && (
                  <span style={{ color: colors.warning, marginLeft: spacing.xs }}>
                    [interrupted]
                  </span>
                )}
              </div>
              {turn.toolCalls?.map((tc) => (
                <ToolCallIndicator key={tc.callId} toolCall={tc} />
              ))}
              <div style={{ fontSize: fontSizes.md, color: colors.textPrimary, lineHeight: 1.5 }}>
                {turn.text || "\u2026"}
              </div>
              {turn.evidence && turn.evidence.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: spacing.xs,
                    marginTop: spacing.sm,
                  }}
                >
                  {turn.evidence.map((ev, i) => (
                    <EvidenceCard key={`${ev.source}-${ev.entity}-${i}`} evidence={ev} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
