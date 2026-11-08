import { Router } from "express";
import { changePassword, login, me, register, updateMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/me", requireAuth, updateMe);
// No requireAuth: lives on the login screen, before a session exists — the current
// password itself is the proof of identity.
authRouter.post("/change-password", changePassword);
