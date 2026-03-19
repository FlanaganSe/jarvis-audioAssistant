function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const generated = crypto.randomUUID() + crypto.randomUUID();
    console.warn("JWT_SECRET not set — using a random secret (sessions won't survive restarts)");
    process.env.JWT_SECRET = generated;
  }

  return {
    port: Number(process.env.PORT ?? 3001),
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    jwtSecret: process.env.JWT_SECRET as string,
  };
}

export interface Config {
  readonly port: number;
  readonly openaiApiKey: string;
  readonly jwtSecret: string;
}
