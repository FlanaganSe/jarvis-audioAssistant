import type { DisplayStatus } from "@jarvis/shared";
import { colors, fontSizes, spacing } from "../styles.js";

const STATUS_META: Record<DisplayStatus, { color: string; label: string }> = {
  idle: { color: colors.textMuted, label: "Idle" },
  connecting: { color: colors.warning, label: "Connecting" },
  connected: { color: colors.success, label: "Ready" },
  listening: { color: colors.error, label: "Listening" },
  processing: { color: colors.warning, label: "Checking tools" },
  speaking: { color: colors.accent, label: "Responding" },
  disconnected: { color: colors.textMuted, label: "Offline" },
  error: { color: colors.error, label: "Error" },
};

interface StatusBarProps {
  status: DisplayStatus;
  connectedAt: Date | null;
  error: string | null;
}

export function StatusBar({ status, connectedAt, error }: StatusBarProps): React.JSX.Element {
  const meta = STATUS_META[status] ?? STATUS_META.disconnected;

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
          background: meta.color,
          marginLeft: spacing.xs,
          boxShadow: `0 0 6px ${meta.color}`,
        }}
      />
      <span style={{ fontSize: fontSizes.sm, color: colors.textSecondary }}>{meta.label}</span>
      {connectedAt && (
        <span style={{ marginLeft: "auto", fontSize: fontSizes.xs, color: colors.textMuted }}>
          Connected {connectedAt.toLocaleTimeString()}
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
