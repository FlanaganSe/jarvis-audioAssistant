import type { DisplayStatus } from "@jarvis/shared";
import { colors, fontSizes, spacing } from "../styles.js";

interface PushToTalkButtonProps {
  status: DisplayStatus;
  audioLevel?: number;
  onPressStart: () => void;
  onPressEnd: () => void;
}

function getButtonStyle(
  status: string,
  canPress: boolean,
  isListening: boolean,
): React.CSSProperties {
  let bg: string = colors.textMuted;
  let animation = "none";

  if (isListening) {
    bg = colors.error;
  } else if (status === "speaking") {
    bg = colors.accent;
    animation = "pulse-speaking 1.5s ease-in-out infinite";
  } else if (status === "processing") {
    bg = colors.warning;
    animation = "pulse-processing 1s ease-in-out infinite";
  } else if (canPress) {
    bg = colors.accent;
    animation = "pulse-idle 2.5s ease-in-out infinite";
  }

  return {
    width: 80,
    height: 80,
    borderRadius: "50%",
    border: "none",
    background: bg,
    color: "#fff",
    fontSize: fontSizes.sm,
    fontWeight: 600,
    cursor: canPress ? "pointer" : "not-allowed",
    userSelect: "none",
    WebkitUserSelect: "none",
    transition: "background 0.2s, transform 0.1s",
    animation,
    transform: isListening ? "scale(1.05)" : "scale(1)",
    position: "relative" as const,
    zIndex: 1,
  };
}

export function PushToTalkButton({
  status,
  audioLevel = 0,
  onPressStart,
  onPressEnd,
}: PushToTalkButtonProps): React.JSX.Element {
  const isListening = status === "listening";
  const canPress = status === "connected" || status === "speaking" || status === "listening";

  const label = isListening
    ? "Release"
    : status === "speaking"
      ? "Interrupt"
      : status === "processing"
        ? "..."
        : "Talk";

  // Audio level ring: visible only when listening
  const ringScale = isListening ? 1 + audioLevel * 0.35 : 0;
  const ringOpacity = isListening ? 0.3 + audioLevel * 0.7 : 0;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: `${spacing.xl}px 0`,
        position: "relative",
      }}
    >
      <div style={{ position: "relative", width: 80, height: 80 }}>
        {/* Audio level ring */}
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50%",
            border: `2px solid ${colors.error}`,
            opacity: ringOpacity,
            transform: `scale(${ringScale})`,
            transition: "transform 0.08s ease-out, opacity 0.08s ease-out",
            pointerEvents: "none",
          }}
        />
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
          style={getButtonStyle(status, canPress, isListening)}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
