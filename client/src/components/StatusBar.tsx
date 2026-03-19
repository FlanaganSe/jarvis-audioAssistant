import type { DisplayStatus } from "@jarvis/shared";
import { colors, fontSizes, spacing } from "../styles.js";

const STATUS_COLORS: Record<DisplayStatus, string> = {
  idle: colors.textMuted,
  connecting: colors.warning,
  connected: colors.success,
  listening: colors.error,
  processing: colors.warning,
  speaking: colors.accent,
  disconnected: colors.textMuted,
  error: colors.error,
};

interface StatusBarProps {
  status: DisplayStatus;
  connectedAt: Date | null;
  error: string | null;
}

export function StatusBar({ status, connectedAt, error }: StatusBarProps): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? colors.textMuted;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.sm,
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <span
        style={{
          fontSize: fontSizes.xl,
          fontWeight: 700,
          letterSpacing: 2,
          color: colors.textPrimary,
        }}
      >
        JARVIS
      </span>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          marginLeft: spacing.xs,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      <span style={{ fontSize: fontSizes.sm, color: colors.textSecondary }}>{status}</span>
      {connectedAt && (
        <span style={{ marginLeft: "auto", fontSize: fontSizes.xs, color: colors.textMuted }}>
          {connectedAt.toLocaleTimeString()}
        </span>
      )}
      {error && (
        <span
          style={{
            marginLeft: connectedAt ? undefined : "auto",
            fontSize: fontSizes.xs,
            color: colors.error,
            background: "rgba(239,68,68,0.1)",
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: 4,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
