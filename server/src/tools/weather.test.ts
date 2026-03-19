import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../services/tool-registry.js";
import { registerWeatherTools } from "./weather.js";

vi.mock("../services/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock("../services/weather-poller.js", () => ({
  addPolledCity: vi.fn(),
}));

import { cacheGet, cacheSet } from "../services/cache.js";
import { addPolledCity } from "../services/weather-poller.js";

const mockedCacheGet = vi.mocked(cacheGet);
const mockedCacheSet = vi.mocked(cacheSet);
const mockedAddPolledCity = vi.mocked(addPolledCity);

const fakeConfig = {
  port: 3001,
  openaiApiKey: "sk-test",
  jwtSecret: "test-secret",
  databaseUrl: "postgres://test",
  redisUrl: "redis://test",
  githubToken: "ghp_test",
  openweathermapApiKey: "owm-test",
} as const;

const toolContext = { userId: "test", sessionId: "test", db: {} as never };

function freshWeatherData(ageMs = 0): string {
  return JSON.stringify({
    location: "Dallas, US",
    temperature_f: 75,
    feels_like_f: 73,
    humidity_pct: 50,
    wind_speed_mph: 10,
    conditions: "clear sky",
    fetched_at: new Date(Date.now() - ageMs).toISOString(),
  });
}

describe("weather_get_current", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registerWeatherTools(registry, fakeConfig);
    mockedCacheGet.mockReset();
    mockedCacheSet.mockReset();
    mockedAddPolledCity.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns cached data with evidence when cache is fresh", async () => {
    const freshData = freshWeatherData(60_000); // 60s old
    mockedCacheGet.mockResolvedValue(freshData);

    const result = await registry.execute(
      "weather_get_current",
      { location: "Dallas" },
      toolContext,
    );

    expect(result.output).toBe(freshData);
    expect(result.evidence).not.toBeNull();
    expect(result.evidence?.source).toBe("openweathermap");
    expect(result.evidence?.freshnessSec).toBeLessThanOrEqual(61);
    // Should NOT have called fetch or cacheSet
    expect(mockedCacheSet).not.toHaveBeenCalled();
  });

  it("falls through to fetch when cache is stale", async () => {
    const staleData = freshWeatherData(200_000); // 200s old — stale
    mockedCacheGet.mockResolvedValue(staleData);

    const apiResponse = {
      name: "Dallas",
      sys: { country: "US" },
      main: { temp: 80, feels_like: 78, humidity: 45 },
      wind: { speed: 12 },
      weather: [{ description: "partly cloudy" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      }),
    );

    const result = await registry.execute(
      "weather_get_current",
      { location: "Dallas" },
      toolContext,
    );

    const parsed = JSON.parse(result.output);
    expect(parsed.location).toBe("Dallas, US");
    expect(parsed.temperature_f).toBe(80);
    expect(result.evidence?.freshnessSec).toBe(0);
    expect(mockedCacheSet).toHaveBeenCalledWith("weather:dallas", expect.any(String), 180);
    expect(mockedAddPolledCity).toHaveBeenCalledWith("Dallas");
  });

  it("returns error with null evidence when fetch fails", async () => {
    mockedCacheGet.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await registry.execute(
      "weather_get_current",
      { location: "Dallas" },
      toolContext,
    );

    const parsed = JSON.parse(result.output);
    expect(parsed.error).toBeDefined();
    expect(result.evidence).toBeNull();
  });

  it("calls cacheSet with 180s TTL and addPolledCity on successful fetch", async () => {
    mockedCacheGet.mockResolvedValue(null);

    const apiResponse = {
      name: "London",
      sys: { country: "GB" },
      main: { temp: 55, feels_like: 52, humidity: 70 },
      wind: { speed: 8 },
      weather: [{ description: "overcast" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      }),
    );

    await registry.execute("weather_get_current", { location: "London,GB" }, toolContext);

    expect(mockedCacheSet).toHaveBeenCalledWith("weather:london,gb", expect.any(String), 180);
    expect(mockedAddPolledCity).toHaveBeenCalledWith("London,GB");
  });
});
