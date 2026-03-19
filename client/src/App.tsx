import { PushToTalkButton } from "./components/PushToTalkButton.js";
import { SessionControls } from "./components/SessionControls.js";
import { StatusBar } from "./components/StatusBar.js";
import { Transcript } from "./components/Transcript.js";
import { useVoiceSession } from "./hooks/useVoiceSession.js";

export function App(): React.JSX.Element {
  const session = useVoiceSession();

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <StatusBar status={session.status} connectedAt={session.connectedAt} error={session.error} />
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
    </div>
  );
}
