import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { registerRelayRoute } from "./relay.js";
import { registerWebRTCRoutes } from "./webrtc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: false });

await fastify.register(fastifyWebsocket);
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
});

registerRelayRoute(fastify);
registerWebRTCRoutes(fastify);

// Health check
fastify.get("/api/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
await fastify.listen({ port, host: "0.0.0.0" });
console.log(`Jarvis spike server running on http://localhost:${port}`);
