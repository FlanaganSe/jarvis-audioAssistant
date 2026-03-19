import type { SessionStatus } from "@jarvis/shared";

const STATUS_COLORS: Record<string, string> = {
  idle: "#888",
  connecting: "#f0ad4e",
  connected: "#5cb85c",
  listening: "#d9534f",
  processing: "#f0ad4e",
  speaking: "#0275d8",
  disconnected: "#888",
  error: "#d9534f",
};

interface StatusBarProps {
  status: SessionStatus | "disconnected" | "error";
  connectedAt: Date | null;
  error: string | null;
}

export function StatusBar({ status, connectedAt, error }: StatusBarProps): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? "#888";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid #eee",
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
      <span style={{ fontWeight: 600 }}>{status.toUpperCase()}</span>
      {connectedAt && (
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
          since {connectedAt.toLocaleTimeString()}
        </span>
      )}
      {error && <span style={{ color: "#d9534f", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
