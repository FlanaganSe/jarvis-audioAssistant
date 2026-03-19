import type { Evidence } from "@jarvis/shared";
import { colors, fontSizes, fonts, radii, spacing } from "../styles.js";

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

function sourceLabel(source: string): string {
  if (source === "github") return "GitHub";
  if (source === "github+analysis") return "GitHub + AI";
  if (source === "github+memory") return "GitHub + Memory";
  if (source === "openweathermap") return "Weather";
  if (source === "memory") return "Memory";
  return source;
}

export function EvidenceCard({ evidence }: EvidenceCardProps): React.JSX.Element {
  return (
    <div
      title={`${evidence.citationRef} • fetched ${new Date(evidence.fetchedAt).toLocaleString()}`}
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
      <span
        style={{
          padding: `1px ${spacing.sm}px`,
          borderRadius: radii.sm,
          background: colors.accentMuted,
          color: colors.accent,
        }}
      >
        {sourceLabel(evidence.source)}
      </span>
      <span style={{ fontFamily: fonts.mono }}>{evidence.entity}</span>
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
