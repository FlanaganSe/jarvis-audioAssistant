import { useState } from "react";
import { InfoDrawer } from "./components/InfoDrawer.js";
import { PushToTalkButton } from "./components/PushToTalkButton.js";
import { SessionControls } from "./components/SessionControls.js";
import { StatusBar } from "./components/StatusBar.js";
import { Transcript } from "./components/Transcript.js";
import { useVoiceSession } from "./hooks/useVoiceSession.js";
import { colors, fontSizes, fonts, radii, spacing } from "./styles.js";

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
        fontFamily: fonts.body,
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

      <div
        style={{
          marginTop: spacing.lg,
          padding: spacing.lg,
          borderRadius: radii.lg,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div
          style={{
            color: colors.textPrimary,
            fontSize: fontSizes.lg,
            fontWeight: 600,
            marginBottom: spacing.xs,
          }}
        >
          Operational voice copilot for live repo and field questions
        </div>
        <p style={{ color: colors.textSecondary, fontSize: fontSizes.sm, lineHeight: 1.6 }}>
          Ask about a public GitHub repo, current weather, or your recent conversations. Jarvis is
          designed to answer from tool evidence or refuse when it cannot verify a claim.
        </p>
      </div>

      <Transcript turns={session.turns} status={session.status} error={session.error} />

      <PushToTalkButton
        status={session.status}
        audioLevel={session.audioLevel}
        onPressStart={session.startListening}
        onPressEnd={session.stopListening}
      />

      <SessionControls
        status={session.status}
        connectedAt={session.connectedAt}
        turnCount={session.turns.length}
        onDisconnect={session.disconnect}
        onReconnect={session.connect}
      />

      <InfoDrawer
        authToken={session.authToken}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
