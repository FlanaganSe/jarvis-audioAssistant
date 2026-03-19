import { useCallback, useEffect, useState } from "react";
import { colors, fontSizes, radii, spacing } from "../styles.js";

interface RecentSession {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  topics: string[] | null;
  entities: unknown;
}

interface InfoDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

type Tab = "preferences" | "sessions";

export function InfoDrawer({ userId, open, onClose }: InfoDrawerProps): React.JSX.Element | null {
  const [tab, setTab] = useState<Tab>("preferences");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [sessions, setSessions] = useState<RecentSession[]>([]);

  const fetchPreferences = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/preferences?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [userId]);

  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/sessions/recent?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    void fetchPreferences();
    void fetchSessions();
  }, [open, fetchPreferences, fetchSessions]);

  const handleDeletePref = useCallback(
    async (index: number) => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/preferences/${index}?userId=${userId}`, { method: "DELETE" });
        if (res.ok) {
          const data = await res.json();
          setPreferences(data.preferences ?? []);
        }
      } catch {
        /* ignore */
      }
    },
    [userId],
  );

  if (!open) return null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.sm}px ${spacing.lg}px`,
    background: active ? colors.surface : "transparent",
    border: "none",
    borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
    color: active ? colors.textPrimary : colors.textMuted,
    fontSize: fontSizes.sm,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        width: 320,
        height: "100%",
        background: colors.bg,
        borderLeft: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${spacing.md}px ${spacing.lg}px`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 0 }}>
          <button
            type="button"
            onClick={() => setTab("preferences")}
            style={tabStyle(tab === "preferences")}
          >
            Preferences
          </button>
          <button
            type="button"
            onClick={() => setTab("sessions")}
            style={tabStyle(tab === "sessions")}
          >
            Sessions
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: colors.textMuted,
            fontSize: fontSizes.lg,
            cursor: "pointer",
          }}
        >
          x
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: spacing.lg }}>
        {tab === "preferences" &&
          (preferences.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>
              No preferences set. Tell Jarvis "remember that..." to add one.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {preferences.map((pref, i) => (
                <li
                  key={`${i}-${pref}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: `${spacing.sm}px 0`,
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                    fontSize: fontSizes.sm,
                  }}
                >
                  <span>{pref}</span>
                  <button
                    type="button"
                    onClick={() => void handleDeletePref(i)}
                    style={{
                      background: "none",
                      border: "none",
                      color: colors.error,
                      cursor: "pointer",
                      fontSize: fontSizes.xs,
                      padding: `2px ${spacing.sm}px`,
                      flexShrink: 0,
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab === "sessions" &&
          (sessions.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>No past sessions.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
              {sessions.map((s) => (
                <div
                  key={s.sessionId}
                  style={{
                    padding: spacing.md,
                    background: colors.surface,
                    borderRadius: radii.md,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <div style={{ fontSize: fontSizes.sm, color: colors.textPrimary }}>
                    {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "Unknown date"}
                  </div>
                  <div style={{ fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : ""}
                    {s.endedAt && ` - ${new Date(s.endedAt).toLocaleTimeString()}`}
                  </div>
                  {s.topics && s.topics.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: spacing.xs,
                        marginTop: spacing.sm,
                      }}
                    >
                      {s.topics.map((topic) => (
                        <span
                          key={topic}
                          style={{
                            padding: `1px ${spacing.sm}px`,
                            background: colors.accentMuted,
                            borderRadius: radii.sm,
                            fontSize: fontSizes.xs,
                            color: colors.accent,
                          }}
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
