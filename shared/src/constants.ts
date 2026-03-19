export const AUDIO = {
  SAMPLE_RATE: 24000,
  CHANNELS: 1,
  BIT_DEPTH: 16,
  BYTES_PER_SAMPLE: 2,
  BYTES_PER_MS: 48, // 24000 * 2 / 1000
} as const;

export const SESSION = {
  IDLE_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes
  IDLE_CHECK_INTERVAL_MS: 30 * 1000, // check every 30s
  TOKEN_EXPIRY_S: 3600, // 1 hour
} as const;
