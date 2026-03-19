import type { SessionStatus } from "@jarvis/shared";

interface PushToTalkButtonProps {
  status: SessionStatus | "disconnected" | "error";
  onPressStart: () => void;
  onPressEnd: () => void;
}

export function PushToTalkButton({
  status,
  onPressStart,
  onPressEnd,
}: PushToTalkButtonProps): React.JSX.Element {
  const isListening = status === "listening";
  const canPress = status === "connected" || status === "speaking" || status === "listening";

  const label = isListening
    ? "Release to Send"
    : status === "speaking"
      ? "Tap to Interrupt"
      : "Push to Talk";

  const bgColor = isListening ? "#d9534f" : canPress ? "#0275d8" : "#ccc";

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
      <button
        type="button"
        disabled={!canPress}
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onMouseLeave={() => {
          if (isListening) onPressEnd();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          onPressStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onPressEnd();
        }}
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: "none",
          background: bgColor,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: canPress ? "pointer" : "not-allowed",
          userSelect: "none",
          WebkitUserSelect: "none",
          transition: "background 0.15s",
          boxShadow: isListening ? "0 0 0 4px rgba(217,83,79,0.3)" : "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        {label}
      </button>
    </div>
  );
}
