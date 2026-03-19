import type { Evidence } from "@jarvis/shared";
import { colors, fontSizes, radii, spacing } from "../styles.js";

interface EvidenceCardProps {
  evidence: Evidence;
}

function freshnessColor(sec: number): string {
  if (sec < 120) return colors.success;
  if (sec <= 180) return colors.warning;
  return colors.error;
}

function formatAge(sec: number): string {
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `${min}m ago`;
}

function sourceIcon(source: string): string {
  if (source === "github") return "\u{1F4E6}"; // package
  if (source === "openweathermap") return "\u{1F321}"; // thermometer
  if (source === "memory") return "\u{1F4AD}"; // thought bubble
  return "\u{1F50D}"; // magnifying glass
}

export function EvidenceCard({ evidence }: EvidenceCardProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.xs,
        padding: `2px ${spacing.sm}px`,
        borderRadius: radii.sm,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        fontSize: fontSizes.xs,
        color: colors.textSecondary,
      }}
    >
      <span>{sourceIcon(evidence.source)}</span>
      <span>{evidence.entity}</span>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: freshnessColor(evidence.freshnessSec),
          display: "inline-block",
        }}
      />
      <span style={{ color: colors.textMuted }}>{formatAge(evidence.freshnessSec)}</span>
    </div>
  );
}
