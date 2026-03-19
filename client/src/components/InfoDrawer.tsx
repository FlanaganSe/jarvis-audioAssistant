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
  authToken: string | null;
  open: boolean;
  onClose: () => void;
}

type Tab = "preferences" | "sessions";

export function InfoDrawer({
  authToken,
  open,
  onClose,
}: InfoDrawerProps): React.JSX.Element | null {
  const [tab, setTab] = useState<Tab>("preferences");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!authToken) return;
    const res = await fetch("/api/preferences", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      throw new Error("Failed to load preferences");
    }

    const data = await res.json();
    setPreferences(data.preferences ?? []);
  }, [authToken]);

  const fetchSessions = useCallback(async () => {
    if (!authToken) return;
    const res = await fetch("/api/sessions/recent", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      throw new Error("Failed to load session history");
    }

    const data = await res.json();
    setSessions(data.sessions ?? []);
  }, [authToken]);

  useEffect(() => {
    if (!open) return;
    if (!authToken) {
      setPreferences([]);
      setSessions([]);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    void Promise.all([fetchPreferences(), fetchSessions()])
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load side panel data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, authToken, fetchPreferences, fetchSessions]);

  const handleDeletePref = useCallback(
    async (index: number) => {
      if (!authToken) return;
      try {
        const res = await fetch(`/api/preferences/${index}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPreferences(data.preferences ?? []);
        }
      } catch {
        /* ignore */
      }
    },
    [authToken],
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
        {!authToken && (
          <p style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>
            Connect to Jarvis to load preferences and recent sessions.
          </p>
        )}

        {authToken && loading && (
          <p style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>Loading side panel…</p>
        )}

        {authToken && loadError && (
          <p style={{ color: colors.error, fontSize: fontSizes.sm }}>{loadError}</p>
        )}

        {tab === "preferences" &&
          authToken &&
          !loading &&
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
          authToken &&
          !loading &&
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
