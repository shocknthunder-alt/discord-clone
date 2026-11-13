import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server as IOServer } from "socket.io";
import { env } from "./env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { channelsRouter } from "./routes/channels.routes.js";
import { dmRouter } from "./routes/dm.routes.js";
import { eventsRouter } from "./routes/events.routes.js";
import { startEventScheduler } from "./events/scheduler.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { serversRouter } from "./routes/servers.routes.js";
import { broadcastPresence, registerChatGateway } from "./sockets/chat.gateway.js";
import { registerDmGateway } from "./sockets/dm.gateway.js";
import { registerMusicGateway } from "./sockets/music.gateway.js";
import { socketAuthMiddleware } from "./sockets/socketAuth.js";
import { handleVoiceDisconnect, registerVoiceGateway } from "./sockets/voice.gateway.js";

const app = express();
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/servers", serversRouter);
app.use("/api/dms", dmRouter);
app.use("/api/events", eventsRouter);
app.use("/api", channelsRouter);
app.use("/api", messagesRouter);

app.use(errorHandler);

const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  // Notice a vanished client (closed app, dropped network) in ~20s instead of the ~45s default, so
  // a ghost doesn't linger in the voice channel list.
  pingInterval: 10_000,
  pingTimeout: 10_000,
  cors: { origin: env.CLIENT_ORIGIN },
});

app.set("io", io);
io.use(socketAuthMiddleware);

io.on("connection", (socket) => {
  const userId: string = socket.data.userId;

  void socket.join(`user:${userId}`);

  registerChatGateway(io, socket);
  registerVoiceGateway(io, socket);
  registerDmGateway(io, socket);
  registerMusicGateway(io, socket);

  void broadcastPresence(io, userId, "online");

  socket.on("disconnect", () => {
    handleVoiceDisconnect(io, socket);
    // Still connected from another device/tab → still online.
    if ((io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) === 0) void broadcastPresence(io, userId, "offline");
  });
});

startEventScheduler(io);

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
