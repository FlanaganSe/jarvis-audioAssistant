import { useState } from "react";
import { InfoDrawer } from "./components/InfoDrawer.js";
import { PushToTalkButton } from "./components/PushToTalkButton.js";
import { SessionControls } from "./components/SessionControls.js";
import { StatusBar } from "./components/StatusBar.js";
import { Transcript } from "./components/Transcript.js";
import { useVoiceSession } from "./hooks/useVoiceSession.js";
import { colors, fontSizes, radii, spacing } from "./styles.js";

export function App(): React.JSX.Element {
  const session = useVoiceSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: `0 ${spacing.lg}px`,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <StatusBar
            status={session.status}
            connectedAt={session.connectedAt}
            error={session.error}
          />
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          style={{
            background: drawerOpen ? colors.accentMuted : colors.surface,
            border: `1px solid ${colors.border}`,
            color: drawerOpen ? colors.accent : colors.textSecondary,
            padding: `${spacing.xs}px ${spacing.md}px`,
            borderRadius: radii.sm,
            cursor: "pointer",
            fontSize: fontSizes.sm,
            marginLeft: spacing.sm,
          }}
        >
          Info
        </button>
      </div>

      <Transcript turns={session.turns} />

      <PushToTalkButton
        status={session.status}
        onPressStart={session.startListening}
        onPressEnd={session.stopListening}
      />

      <SessionControls
        status={session.status}
        turnCount={session.turns.length}
        onDisconnect={session.disconnect}
        onReconnect={session.connect}
      />

      <InfoDrawer userId={session.userId} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
