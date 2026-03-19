import Redis from "ioredis";

let redis: Redis | null = null;

export function connectRedis(redisUrl: string): Redis {
  if (redis) return redis;
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
  });

  redis.on("error", (err) => {
    console.warn(`[redis] Connection error: ${err.message}`);
  });

  redis.on("connect", () => {
    console.log("[redis] Connected");
  });

  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export function getRedis(): Redis | null {
  return redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch {
    // Redis unavailable — continue without caching
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Redis unavailable — continue silently
  }
}
