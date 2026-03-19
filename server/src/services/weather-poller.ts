import { cacheSet } from "./cache.js";

const POLL_INTERVAL_MS = 180_000; // 3 minutes
const MAX_POLLED_CITIES = 50;
const polledCities: string[] = [];
const failCounts = new Map<string, number>();

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let apiKey: string | null = null;

export function addPolledCity(location: string): void {
  const normalized = location.toLowerCase().trim();
  const idx = polledCities.indexOf(normalized);
  if (idx !== -1) {
    // Move to end (most recently used)
    polledCities.splice(idx, 1);
  }
  polledCities.push(normalized);
  // Evict oldest if over capacity
  while (polledCities.length > MAX_POLLED_CITIES) {
    const evicted = polledCities.shift();
    if (evicted) failCounts.delete(evicted);
  }
}

async function refreshCity(location: string): Promise<void> {
  if (!apiKey) return;
  const key = `weather:${location}`;
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const weatherData = {
      location: `${data.name}, ${data.sys.country}`,
      temperature_f: data.main.temp,
      feels_like_f: data.main.feels_like,
      humidity_pct: data.main.humidity,
      wind_speed_mph: data.wind.speed,
      conditions: data.weather[0]?.description ?? "unknown",
      fetched_at: new Date().toISOString(),
    };
    await cacheSet(key, JSON.stringify(weatherData), 180);
    failCounts.delete(location);
  } catch {
    const count = (failCounts.get(location) ?? 0) + 1;
    failCounts.set(location, count);
    if (count >= 3) {
      console.warn(`[weather-poller] 3 consecutive failures for "${location}"`);
    }
  }
}

async function pollAll(): Promise<void> {
  const cities = [...polledCities];
  await Promise.allSettled(cities.map(refreshCity));
}

export function startWeatherPoller(openweathermapApiKey: string): void {
  apiKey = openweathermapApiKey;
  intervalHandle = setInterval(() => {
    void pollAll();
  }, POLL_INTERVAL_MS);
}

export function stopWeatherPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
