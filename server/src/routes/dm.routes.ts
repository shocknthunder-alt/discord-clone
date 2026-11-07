import { Router } from "express";
import { listConversations, listDmMessages, startConversation } from "../controllers/dm.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const dmRouter = Router();

dmRouter.use(requireAuth);
dmRouter.get("/", listConversations);
dmRouter.post("/with/:userId", startConversation);
dmRouter.get("/:conversationId/messages", listDmMessages);
