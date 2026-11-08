import { Router } from "express";
import {
  createTextChannel,
  createVoiceChannel,
  listChannels,
  updateTextChannel,
  updateVoiceChannel,
} from "../controllers/channels.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const channelsRouter = Router();

channelsRouter.use(requireAuth);
channelsRouter.get("/servers/:serverId/channels", listChannels);
channelsRouter.post("/servers/:serverId/text-channels", createTextChannel);
channelsRouter.post("/servers/:serverId/voice-channels", createVoiceChannel);
channelsRouter.patch("/text-channels/:channelId", updateTextChannel);
channelsRouter.patch("/voice-channels/:channelId", updateVoiceChannel);
