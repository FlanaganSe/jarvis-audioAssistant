/** Design system tokens for Jarvis dark theme */

export const colors = {
  bg: "#0f1117",
  surface: "#1a1d27",
  surfaceHover: "#22253a",
  border: "#2a2d3a",
  accent: "#3b82f6",
  accentMuted: "rgba(59,130,246,0.15)",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  userBubble: "#1e293b",
  assistantBubble: "#162032",
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fonts = {
  body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 20,
} as const;
