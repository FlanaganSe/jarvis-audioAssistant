function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const isProduction = process.env.NODE_ENV === "production";

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error("JWT_SECRET is required in production");
    }
    const generated = crypto.randomUUID() + crypto.randomUUID();
    console.warn("JWT_SECRET not set — using a random secret (sessions won't survive restarts)");
    process.env.JWT_SECRET = generated;
  }

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  if (isProduction && !process.env.REDIS_URL) {
    console.warn(
      "REDIS_URL not set in production — defaulting to redis://localhost:6379 which is likely unreachable",
    );
  }

  return {
    port: Number(process.env.PORT ?? 3001),
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    jwtSecret: process.env.JWT_SECRET as string,
    databaseUrl: requireEnv("DATABASE_URL"),
    redisUrl,
    githubToken: requireEnv("GITHUB_TOKEN"),
    openweathermapApiKey: requireEnv("OPENWEATHERMAP_API_KEY"),
  };
}

export interface Config {
  readonly port: number;
  readonly openaiApiKey: string;
  readonly jwtSecret: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly githubToken: string;
  readonly openweathermapApiKey: string;
}
