import "dotenv/config";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { connectDb, disconnectDb } from "./db/index.js";
import { registerAuthRoute } from "./routes/auth.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerPreferencesRoute } from "./routes/preferences.js";
import { registerSessionsRoute } from "./routes/sessions.js";
import { registerWsRoute } from "./routes/ws.js";
import { connectRedis, disconnectRedis } from "./services/cache.js";
import { startIdleChecker } from "./services/idle.js";
import { startWeatherPoller, stopWeatherPoller } from "./services/weather-poller.js";
import { registerAllTools } from "./tools/index.js";

const config = loadConfig();
const fastify = Fastify({ logger: true });

// Connect to PostgreSQL
connectDb(config.databaseUrl);
fastify.log.info("PostgreSQL pool initialized");

// Connect to Redis (lazy — won't block if unavailable)
const redis = connectRedis(config.redisUrl);
redis.connect().catch((err) => {
  fastify.log.warn(`Redis connection failed (non-fatal): ${err.message}`);
});

// Register tools before routes (relay reads tool definitions on connect)
registerAllTools(config);
startWeatherPoller(config.openweathermapApiKey);

await fastify.register(cors, { origin: true });
await fastify.register(websocket);

registerHealthRoute(fastify);
registerAuthRoute(fastify, config);
registerPreferencesRoute(fastify);
registerSessionsRoute(fastify);
registerWsRoute(fastify, config);

const cleanup = startIdleChecker(fastify.log);

const shutdown = async () => {
  cleanup();
  stopWeatherPoller();
  await Promise.allSettled([disconnectRedis(), disconnectDb(), fastify.close()]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await fastify.listen({ port: config.port, host: "0.0.0.0" });
