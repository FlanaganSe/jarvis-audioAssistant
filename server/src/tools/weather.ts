import type { Config } from "../config.js";
import { cacheGet, cacheSet } from "../services/cache.js";
import type { ToolRegistry } from "../services/tool-registry.js";
import { addPolledCity } from "../services/weather-poller.js";
import type { ToolDefinition, ToolResult } from "./types.js";

const FRESHNESS_MAX_SEC = 180;

interface WeatherData {
  location: string;
  temperature_f: number;
  feels_like_f: number;
  humidity_pct: number;
  wind_speed_mph: number;
  conditions: string;
  fetched_at: string;
}

function cacheKey(location: string): string {
  return `weather:${location.toLowerCase().trim()}`;
}

async function fetchFromApi(location: string, apiKey: string): Promise<WeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenWeatherMap API error (${res.status}): ${body}`);
  }
  const data = await res.json();
  return {
    location: `${data.name}, ${data.sys.country}`,
    temperature_f: data.main.temp,
    feels_like_f: data.main.feels_like,
    humidity_pct: data.main.humidity,
    wind_speed_mph: data.wind.speed,
    conditions: data.weather[0]?.description ?? "unknown",
    fetched_at: new Date().toISOString(),
  };
}

function createWeatherTool(config: Config): ToolDefinition {
  return {
    name: "weather_get_current",
    description: "Get current weather conditions for a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name or 'city,country_code' (e.g. 'Dallas' or 'London,GB')",
        },
      },
      required: ["location"],
    },
    async execute(args, _context): Promise<ToolResult> {
      const location = args.location as string;
      const key = cacheKey(location);

      // Try cache first
      const cached = await cacheGet(key);
      if (cached) {
        try {
          const data = JSON.parse(cached) as WeatherData;
          const ageSec = Math.floor((Date.now() - new Date(data.fetched_at).getTime()) / 1000);
          if (ageSec <= FRESHNESS_MAX_SEC) {
            return {
              output: JSON.stringify(data),
              evidence: {
                source: "openweathermap",
                entity: `weather:${location}`,
                fetchedAt: data.fetched_at,
                freshnessSec: ageSec,
                citationRef: "OpenWeatherMap API",
              },
            };
          }
          // Cache is stale — fall through to fetch
        } catch {
          // Bad cache data — fall through
        }
      }

      // Fetch fresh data
      try {
        const data = await fetchFromApi(location, config.openweathermapApiKey);
        await cacheSet(key, JSON.stringify(data), FRESHNESS_MAX_SEC);
        addPolledCity(location);
        return {
          output: JSON.stringify(data),
          evidence: {
            source: "openweathermap",
            entity: `weather:${location}`,
            fetchedAt: data.fetched_at,
            freshnessSec: 0,
            citationRef: "OpenWeatherMap API",
          },
        };
      } catch {
        // Fetch failed — never return stale data
        return {
          output: JSON.stringify({ error: "Weather data is currently unavailable" }),
          evidence: null,
        };
      }
    },
  };
}

export function registerWeatherTools(registry: ToolRegistry, config: Config): void {
  registry.register(createWeatherTool(config));
}
