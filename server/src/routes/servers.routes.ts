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
import { createSound, deleteSound, listSounds, updateSound } from "../controllers/soundboard.controller.js";
import {
  createRole,
  deleteRole,
  kickMember,
  listMembers,
  memberResetLink,
  reorderRoles,
  setMemberRole,
  updateRole,
} from "../controllers/members.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const serversRouter = Router();

serversRouter.use(requireAuth);
serversRouter.get("/", listServers);
serversRouter.post("/", createServer);
serversRouter.post("/join", joinServer);
serversRouter.get("/featured-invite", getFeaturedInvite);
serversRouter.get("/:serverId/emojis", listCustomEmojis);
serversRouter.post("/:serverId/emojis", createCustomEmoji);
serversRouter.get("/:serverId/sounds", listSounds);
serversRouter.post("/:serverId/sounds", createSound);
serversRouter.patch("/:serverId/sounds/:soundId", updateSound);
serversRouter.delete("/:serverId/sounds/:soundId", deleteSound);
serversRouter.get("/:serverId/members", listMembers);
serversRouter.put("/:serverId/members/:userId/role", setMemberRole);
serversRouter.delete("/:serverId/members/:userId", kickMember);
serversRouter.post("/:serverId/members/:userId/reset-link", memberResetLink);
serversRouter.post("/:serverId/roles", createRole);
serversRouter.put("/:serverId/roles/order", reorderRoles);
serversRouter.patch("/:serverId/roles/:roleId", updateRole);
serversRouter.delete("/:serverId/roles/:roleId", deleteRole);
serversRouter.get("/:serverId", getServer);
serversRouter.patch("/:serverId", updateServer);
