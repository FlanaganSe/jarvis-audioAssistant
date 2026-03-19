import type { Evidence } from "@jarvis/shared";

interface EvidenceCardProps {
  evidence: Evidence;
}

function freshnessColor(sec: number): string {
  if (sec < 120) return "#4caf50";
  if (sec <= 180) return "#ff9800";
  return "#f44336";
}

function formatAge(sec: number): string {
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `${min}m ago`;
}

export function EvidenceCard({ evidence }: EvidenceCardProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        marginTop: 4,
        borderRadius: 4,
        background: "#f5f5f5",
        fontSize: 11,
        color: "#666",
      }}
    >
      <span style={{ fontWeight: 600 }}>{evidence.source}</span>
      <span>{evidence.entity}</span>
      <span style={{ color: freshnessColor(evidence.freshnessSec) }}>
        {formatAge(evidence.freshnessSec)}
      </span>
    </div>
  );
}
