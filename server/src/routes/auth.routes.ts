import { Router } from "express";
import {
  changeMyEmail,
  changeMyPassword,
  changePassword,
  forgotEmail,
  forgotPassword,
  login,
  me,
  register,
  resetPassword,
  updateMe,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/me", requireAuth, updateMe);
authRouter.post("/me/password", requireAuth, changeMyPassword);
authRouter.post("/me/email", requireAuth, changeMyEmail);
// No requireAuth: lives on the login screen, before a session exists — the current
// password itself is the proof of identity.
const accountLimit = rateLimit(10, 10 * 60_000);
authRouter.post("/change-password", accountLimit, changePassword);
authRouter.post("/forgot-password", accountLimit, forgotPassword);
authRouter.post("/forgot-email", accountLimit, forgotEmail);
authRouter.post("/reset-password", accountLimit, resetPassword);
