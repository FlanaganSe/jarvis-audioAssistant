import type { SessionStatus } from "@jarvis/shared";

interface SessionControlsProps {
  status: SessionStatus | "disconnected" | "error";
  turnCount: number;
  onDisconnect: () => void;
  onReconnect: () => void;
}

export function SessionControls({
  status,
  turnCount,
  onDisconnect,
  onReconnect,
}: SessionControlsProps): React.JSX.Element {
  const isConnected = status !== "disconnected" && status !== "error" && status !== "idle";
  const showReconnect = status === "disconnected" || status === "error";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderTop: "1px solid #eee",
        fontSize: 13,
        color: "#888",
      }}
    >
      <span>
        {turnCount} turn{turnCount !== 1 ? "s" : ""}
      </span>
      {showReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          style={{ padding: "4px 12px", cursor: "pointer" }}
        >
          Reconnect
        </button>
      )}
      {isConnected && (
        <button
          type="button"
          onClick={onDisconnect}
          style={{ padding: "4px 12px", cursor: "pointer" }}
        >
          End Session
        </button>
      )}
    </div>
  );
}
