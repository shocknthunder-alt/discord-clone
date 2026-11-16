import { Router } from "express";
import { listMessages, listPins, searchMessages } from "../controllers/messages.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);
messagesRouter.get("/text-channels/:channelId/messages", listMessages);
messagesRouter.get("/text-channels/:channelId/pins", listPins);
messagesRouter.get("/servers/:serverId/search", searchMessages);
