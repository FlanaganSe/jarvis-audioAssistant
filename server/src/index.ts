import "dotenv/config";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { registerAuthRoute } from "./routes/auth.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerWsRoute } from "./routes/ws.js";
import { startIdleChecker } from "./services/idle.js";

const config = loadConfig();
const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });
await fastify.register(websocket);

registerHealthRoute(fastify);
registerAuthRoute(fastify, config);
registerWsRoute(fastify, config);

const cleanup = startIdleChecker(fastify.log);

const shutdown = async () => {
  cleanup();
  await fastify.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await fastify.listen({ port: config.port, host: "0.0.0.0" });
