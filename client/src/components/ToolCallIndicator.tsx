import { colors, fontSizes, fonts, radii, spacing } from "../styles.js";
import type { ToolCallInfo } from "../types.js";

interface ToolCallIndicatorProps {
  toolCall: ToolCallInfo;
}

function statusDot(status: ToolCallInfo["status"]): React.CSSProperties {
  const bg =
    status === "running" ? colors.warning : status === "done" ? colors.success : colors.error;
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: bg,
    display: "inline-block",
    animation: status === "running" ? "pulse-processing 1s ease-in-out infinite" : "none",
  };
}

export function ToolCallIndicator({ toolCall }: ToolCallIndicatorProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.xs,
        padding: `2px ${spacing.sm}px`,
        marginBottom: spacing.xs,
        borderRadius: radii.sm,
        background: toolCall.status === "error" ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.08)",
        fontSize: fontSizes.xs,
        color: colors.textSecondary,
      }}
    >
      <span style={statusDot(toolCall.status)} />
      <span style={{ fontFamily: fonts.mono }}>{toolCall.name}</span>
      {toolCall.durationMs != null && (
        <span style={{ color: colors.textMuted }}>({toolCall.durationMs}ms)</span>
      )}
      {toolCall.error && <span style={{ color: colors.error }}>{toolCall.error}</span>}
    </div>
  );
}
