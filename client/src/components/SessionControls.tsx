import type { DisplayStatus } from "@jarvis/shared";
import { colors, fontSizes, radii, spacing } from "../styles.js";

interface SessionControlsProps {
  status: DisplayStatus;
  connectedAt: Date | null;
  turnCount: number;
  onDisconnect: () => void;
  onReconnect: () => void;
}

const btnStyle: React.CSSProperties = {
  padding: `${spacing.xs}px ${spacing.md}px`,
  cursor: "pointer",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  color: colors.textSecondary,
  fontSize: fontSizes.sm,
};

export function SessionControls({
  status,
  connectedAt,
  turnCount,
  onDisconnect,
  onReconnect,
}: SessionControlsProps): React.JSX.Element {
  const isConnected = status !== "disconnected" && status !== "error" && status !== "idle";
  const showReconnect = status === "disconnected" || status === "error";
  const reconnectLabel = connectedAt ? "Reconnect" : "Connect";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${spacing.sm}px 0`,
        borderTop: `1px solid ${colors.border}`,
        fontSize: fontSizes.sm,
        color: colors.textMuted,
      }}
    >
      <span>
        {turnCount} turn{turnCount !== 1 ? "s" : ""}
      </span>
      {showReconnect && (
        <button type="button" onClick={onReconnect} style={{ ...btnStyle, color: colors.accent }}>
          {reconnectLabel}
        </button>
      )}
      {isConnected && (
        <button type="button" onClick={onDisconnect} style={btnStyle}>
          End Session
        </button>
      )}
    </div>
  );
}
