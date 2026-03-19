import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    // Set required vars
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.DATABASE_URL = "postgres://test";
    process.env.GITHUB_TOKEN = "ghp_test";
    process.env.OPENWEATHERMAP_API_KEY = "owm-test";
    process.env.JWT_SECRET = "test-jwt-secret";
    // Clear optional vars to test defaults
    process.env.PORT = undefined;
    process.env.REDIS_URL = undefined;
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it("returns Config with correct values when all required vars present", () => {
    const config = loadConfig();
    expect(config.openaiApiKey).toBe("sk-test");
    expect(config.databaseUrl).toBe("postgres://test");
    expect(config.githubToken).toBe("ghp_test");
    expect(config.openweathermapApiKey).toBe("owm-test");
    expect(config.jwtSecret).toBe("test-jwt-secret");
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    process.env.OPENAI_API_KEY = undefined;
    expect(() => loadConfig()).toThrow("OPENAI_API_KEY");
  });

  it("throws when DATABASE_URL is missing", () => {
    process.env.DATABASE_URL = undefined;
    expect(() => loadConfig()).toThrow("DATABASE_URL");
  });

  it("defaults PORT to 3001 when not set", () => {
    process.env.PORT = undefined;
    const config = loadConfig();
    expect(config.port).toBe(3001);
  });

  it("auto-generates JWT_SECRET when not set in dev", () => {
    process.env.JWT_SECRET = undefined;
    process.env.NODE_ENV = undefined;
    const config = loadConfig();
    expect(config.jwtSecret).toBeTruthy();
    expect(config.jwtSecret.length).toBeGreaterThan(0);
    expect(process.env.JWT_SECRET).toBe(config.jwtSecret);
  });

  it("throws when JWT_SECRET is missing in production", () => {
    process.env.JWT_SECRET = undefined;
    process.env.NODE_ENV = "production";
    expect(() => loadConfig()).toThrow("JWT_SECRET is required in production");
  });

  it("defaults REDIS_URL to localhost when not set", () => {
    process.env.REDIS_URL = undefined;
    const config = loadConfig();
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });
});
