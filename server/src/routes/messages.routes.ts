import { Router } from "express";
import { listMessages } from "../controllers/messages.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);
messagesRouter.get("/text-channels/:channelId/messages", listMessages);
