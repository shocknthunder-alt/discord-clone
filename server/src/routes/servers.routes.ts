import { Router } from "express";
import { createServer, getServer, joinServer, listServers, updateServer } from "../controllers/servers.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const serversRouter = Router();

serversRouter.use(requireAuth);
serversRouter.get("/", listServers);
serversRouter.post("/", createServer);
serversRouter.post("/join", joinServer);
serversRouter.get("/:serverId", getServer);
serversRouter.patch("/:serverId", updateServer);
