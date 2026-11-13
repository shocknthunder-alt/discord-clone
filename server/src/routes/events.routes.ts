import { Router } from "express";
import { createEvent, deleteEvent, listArchive, listEvents, setRsvp, updateEvent } from "../controllers/events.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const eventsRouter = Router();

eventsRouter.use(requireAuth);
eventsRouter.get("/", listEvents);
eventsRouter.get("/archive", listArchive);
eventsRouter.post("/", createEvent);
eventsRouter.patch("/:eventId", updateEvent);
eventsRouter.delete("/:eventId", deleteEvent);
eventsRouter.put("/:eventId/rsvp", setRsvp);
