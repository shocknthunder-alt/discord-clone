import { Router } from "express";
import {
  createCustomEmoji,
  createServer,
  getFeaturedInvite,
  getServer,
  joinServer,
  listCustomEmojis,
  listServers,
  updateServer,
} from "../controllers/servers.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const serversRouter = Router();

serversRouter.use(requireAuth);
serversRouter.get("/", listServers);
serversRouter.post("/", createServer);
serversRouter.post("/join", joinServer);
serversRouter.get("/featured-invite", getFeaturedInvite);
serversRouter.get("/:serverId/emojis", listCustomEmojis);
serversRouter.post("/:serverId/emojis", createCustomEmoji);
serversRouter.get("/:serverId", getServer);
serversRouter.patch("/:serverId", updateServer);
