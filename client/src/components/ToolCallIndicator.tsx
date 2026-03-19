import type { ToolCallInfo } from "../types.js";

interface ToolCallIndicatorProps {
  toolCall: ToolCallInfo;
}

function statusIcon(status: ToolCallInfo["status"]): string {
  switch (status) {
    case "running":
      return "\u23F3";
    case "done":
      return "\u2705";
    case "error":
      return "\u274C";
  }
}

export function ToolCallIndicator({ toolCall }: ToolCallIndicatorProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        marginTop: 2,
        borderRadius: 4,
        background: toolCall.status === "error" ? "#fff3f3" : "#f0f4f8",
        fontSize: 11,
        color: "#555",
      }}
    >
      <span>{statusIcon(toolCall.status)}</span>
      <span style={{ fontFamily: "monospace" }}>{toolCall.name}</span>
      {toolCall.durationMs != null && <span>({toolCall.durationMs}ms)</span>}
      {toolCall.error && <span style={{ color: "#d32f2f" }}>{toolCall.error}</span>}
    </div>
  );
}
