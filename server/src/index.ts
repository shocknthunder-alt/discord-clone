import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server as IOServer } from "socket.io";
import { env } from "./env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { channelsRouter } from "./routes/channels.routes.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { serversRouter } from "./routes/servers.routes.js";
import { broadcastPresence, registerChatGateway } from "./sockets/chat.gateway.js";
import { socketAuthMiddleware } from "./sockets/socketAuth.js";
import { handleVoiceDisconnect, registerVoiceGateway } from "./sockets/voice.gateway.js";

const app = express();

app.get("/debug/env", (_req, res) =>
  res.json({ clientOrigin: JSON.stringify(env.CLIENT_ORIGIN), length: env.CLIENT_ORIGIN.length }),
);

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/servers", serversRouter);
app.use("/api", channelsRouter);
app.use("/api", messagesRouter);

app.use(errorHandler);

const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN },
});

io.use(socketAuthMiddleware);

io.on("connection", (socket) => {
  const userId: string = socket.data.userId;

  registerChatGateway(io, socket);
  registerVoiceGateway(io, socket);

  void broadcastPresence(io, userId, "online");

  socket.on("disconnect", () => {
    handleVoiceDisconnect(io, socket);
    void broadcastPresence(io, userId, "offline");
  });
});

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
