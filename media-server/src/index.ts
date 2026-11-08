import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server as IOServer } from "socket.io";
import { env } from "./env.js";
import { socketAuthMiddleware } from "./socketAuth.js";
import { registerMediaSocket } from "./socketHandlers.js";
import { initWorkerPool } from "./workerPool.js";

async function main() {
  await initWorkerPool();

  const app = express();
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const httpServer = createServer(app);
  const io = new IOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN },
  });

  io.use(socketAuthMiddleware);
  io.on("connection", (socket) => {
    registerMediaSocket(io, socket);
  });

  httpServer.listen(env.PORT, () => {
    console.log(`media-server listening on http://localhost:${env.PORT}`);
  });
}

void main();
