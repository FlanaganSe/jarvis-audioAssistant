// trigger Railway initial deploy
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
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
import { waitForPendingSummaryJobs } from "./services/summary-jobs.js";
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
registerPreferencesRoute(fastify, config);
registerSessionsRoute(fastify, config);
registerWsRoute(fastify, config);

// Serve client build in production (no-ops if client/dist doesn't exist)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

if (existsSync(clientDistPath)) {
  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: "/",
    wildcard: false,
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/ws/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

const cleanup = startIdleChecker(fastify.log);

const shutdown = async () => {
  cleanup();
  stopWeatherPoller();
  await Promise.allSettled([fastify.close()]);

  const summaryWait = await waitForPendingSummaryJobs(5_000);
  if (summaryWait.pending > 0) {
    const message = summaryWait.timedOut
      ? "Timed out waiting for session summaries to finish"
      : "Finished waiting for in-flight session summaries";

    fastify.log[summaryWait.timedOut ? "warn" : "info"]({ pending: summaryWait.pending }, message);
  }

  await Promise.allSettled([disconnectRedis(), disconnectDb()]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await fastify.listen({ port: config.port, host: "0.0.0.0" });
