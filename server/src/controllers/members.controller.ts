import type { Request, Response } from "express";
import { ALL_PERMS, Perm, SocketEvents, hasPerm, type MembersResponse, type RoleDTO } from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";
import { can, ensureDefaultRole, memberContext, outranks } from "../permissions.js";
import { resetLink, signResetToken } from "../utils/passwordReset.js";

function io(req: Request): IOServer | undefined {
  return req.app.get("io");
}

export function notifyMembersChanged(server: IOServer | undefined, serverId: string) {
  server?.to(`server:${serverId}`).emit(SocketEvents.MembersChanged, { serverId });
}

function isOnline(server: IOServer | undefined, userId: string) {
  return (server?.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) > 0;
}

function roleDto(r: { id: string; name: string; color: string | null; position: number; permissions: number; isDefault: boolean }): RoleDTO {
  return { id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, isDefault: r.isDefault };
}

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export async function listMembers(req: Request, res: Response) {
  const { serverId } = req.params;
  const me = await memberContext(req.userId!, serverId);
  if (!me) return res.status(403).json({ error: "Not a member of this server" });
  await ensureDefaultRole(serverId);
  const [server, memberships, roles] = await Promise.all([
    prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } }),
    prisma.membership.findMany({ where: { serverId }, include: { user: { select: { username: true, avatarUrl: true, email: true } } } }),
    prisma.role.findMany({ where: { serverId }, orderBy: { position: "desc" } }),
  ]);
  const body: MembersResponse = {
    members: memberships
      // bots (trivia, events) are not people
      .filter((m) => !m.user.email.endsWith("@shmirka.local"))
      .map((m) => ({
        userId: m.userId,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        roleId: m.roleId,
        isOwner: m.role === "OWNER" || server?.ownerId === m.userId,
        online: isOnline(io(req), m.userId),
        joinedAt: m.joinedAt.toISOString(),
      })),
    roles: roles.map(roleDto),
    myPermissions: me.permissions,
    myRank: me.rank,
  };
  res.json(body);
}

function parseRoleBody(body: Record<string, unknown>, myPerms: number, isOwner: boolean) {
  const out: { name?: string; color?: string | null; permissions?: number } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 32) return "Името трябва да е 1–32 символа.";
    out.name = name;
  }
  if (body.color !== undefined) {
    if (body.color === null || body.color === "") out.color = null;
    else if (typeof body.color === "string" && COLOR_RE.test(body.color)) out.color = body.color.toLowerCase();
    else return "Невалиден цвят.";
  }
  if (body.permissions !== undefined) {
    const p = Number(body.permissions);
    if (!Number.isInteger(p) || p < 0) return "Невалидни права.";
    // You can't hand out permissions you don't have yourself.
    const allowed = isOwner || hasPerm(myPerms, Perm.ADMINISTRATOR) ? ALL_PERMS : myPerms;
    if ((p & ~allowed) !== 0) return "Не можеш да даваш права, които самият ти нямаш.";
    out.permissions = p & ALL_PERMS;
  }
  return out;
}

export async function createRole(req: Request, res: Response) {
  const { serverId } = req.params;
  const me = await can(req.userId!, serverId, Perm.MANAGE_ROLES);
  if (!me) return res.status(403).json({ error: "Нямаш право да управляваш ранговете." });
  const parsed = parseRoleBody({ name: "Нов ранг", ...req.body }, me.permissions, me.isOwner);
  if (typeof parsed === "string") return res.status(400).json({ error: parsed });
  if ((await prisma.role.count({ where: { serverId } })) >= 30) return res.status(409).json({ error: "Най-много 30 ранга." });

  // New ranks go right above the default rank (and below the creator's own).
  await prisma.role.updateMany({ where: { serverId, position: { gte: 1 } }, data: { position: { increment: 1 } } });
  const role = await prisma.role.create({
    data: { serverId, name: parsed.name!, color: parsed.color ?? null, permissions: parsed.permissions ?? 0, position: 1 },
  });
  notifyMembersChanged(io(req), serverId);
  res.status(201).json({ role: roleDto(role) });
}

async function editableRole(req: Request) {
  const { serverId, roleId } = req.params;
  const me = await can(req.userId!, serverId, Perm.MANAGE_ROLES);
  if (!me) return { error: 403, msg: "Нямаш право да управляваш ранговете." } as const;
  const role = await prisma.role.findFirst({ where: { id: roleId, serverId } });
  if (!role) return { error: 404, msg: "Няма такъв ранг." } as const;
  if (!me.isOwner && role.position >= me.rank) return { error: 403, msg: "Може само рангове под твоя." } as const;
  return { me, role } as const;
}

export async function updateRole(req: Request, res: Response) {
  const found = await editableRole(req);
  if ("error" in found) return res.status(found.error!).json({ error: found.msg });
  const parsed = parseRoleBody(req.body ?? {}, found.me.permissions, found.me.isOwner);
  if (typeof parsed === "string") return res.status(400).json({ error: parsed });
  const role = await prisma.role.update({ where: { id: found.role.id }, data: parsed });
  notifyMembersChanged(io(req), found.role.serverId);
  res.json({ role: roleDto(role) });
}

export async function deleteRole(req: Request, res: Response) {
  const found = await editableRole(req);
  if ("error" in found) return res.status(found.error!).json({ error: found.msg });
  if (found.role.isDefault) return res.status(400).json({ error: "Основният ранг не може да се изтрие." });
  // Members with it fall back to the default rank (FK is ON DELETE SET NULL).
  await prisma.role.delete({ where: { id: found.role.id } });
  notifyMembersChanged(io(req), found.role.serverId);
  res.status(204).end();
}

/** body.roleIds: the non-default ranks from highest to lowest. Only ranks below yours can move. */
export async function reorderRoles(req: Request, res: Response) {
  const { serverId } = req.params;
  const me = await can(req.userId!, serverId, Perm.MANAGE_ROLES);
  if (!me) return res.status(403).json({ error: "Нямаш право да управляваш ранговете." });
  const ids: unknown = req.body?.roleIds;
  const roles = await prisma.role.findMany({ where: { serverId, isDefault: false } });
  if (!Array.isArray(ids) || ids.length !== roles.length || !roles.every((r) => ids.includes(r.id))) {
    return res.status(400).json({ error: "Невалиден ред." });
  }
  const newPos = new Map((ids as string[]).map((id, i) => [id, roles.length - i]));
  if (!me.isOwner) {
    // Ranks at/above mine must keep their place, and nothing may be moved to/above mine.
    for (const r of roles) {
      const moved = newPos.get(r.id)!;
      if (r.position >= me.rank ? moved !== r.position : moved >= me.rank) {
        return res.status(403).json({ error: "Може да местиш само рангове под твоя." });
      }
    }
  }
  await prisma.$transaction(roles.map((r) => prisma.role.update({ where: { id: r.id }, data: { position: newPos.get(r.id)! } })));
  notifyMembersChanged(io(req), serverId);
  res.status(204).end();
}

/** Give someone a rank (roleId null / default = back to the default rank). */
export async function setMemberRole(req: Request, res: Response) {
  const { serverId, userId } = req.params;
  const me = await can(req.userId!, serverId, Perm.MANAGE_ROLES);
  if (!me) return res.status(403).json({ error: "Нямаш право да даваш рангове." });
  const target = await memberContext(userId, serverId);
  if (!target) return res.status(404).json({ error: "Няма такъв член." });
  if (userId !== req.userId && !outranks(me, target)) return res.status(403).json({ error: "Може само на хора с по-нисък ранг." });

  let roleId: string | null = null;
  if (typeof req.body?.roleId === "string" && req.body.roleId) {
    const role = await prisma.role.findFirst({ where: { id: req.body.roleId, serverId } });
    if (!role) return res.status(404).json({ error: "Няма такъв ранг." });
    if (!me.isOwner && role.position >= me.rank) return res.status(403).json({ error: "Може да даваш само рангове под твоя." });
    roleId = role.isDefault ? null : role.id;
  }
  if (userId === req.userId && !me.isOwner) return res.status(403).json({ error: "Не можеш да сменяш собствения си ранг." });
  await prisma.membership.update({ where: { userId_serverId: { userId, serverId } }, data: { roleId } });
  notifyMembersChanged(io(req), serverId);
  res.status(204).end();
}

/**
 * The server OWNER gives a member who forgot their password a one-time link to set a new one
 * (valid 24 h, dies once used). Works without any e-mail set up — they send it over chat.
 */
export async function memberResetLink(req: Request, res: Response) {
  const { serverId, userId } = req.params;
  const me = await memberContext(req.userId!, serverId);
  if (!me?.isOwner) return res.status(403).json({ error: "Само собственикът на сървъра." });
  const target = await memberContext(userId, serverId);
  if (!target || target.isOwner) return res.status(404).json({ error: "Няма такъв член." });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "Няма такъв член." });
  res.json({ link: resetLink(signResetToken(user.id, user.passwordHash, "24h")), username: user.username });
}

export async function kickMember(req: Request, res: Response) {
  const { serverId, userId } = req.params;
  const me = await can(req.userId!, serverId, Perm.KICK_MEMBERS);
  if (!me) return res.status(403).json({ error: "Нямаш право да изгонваш." });
  const target = await memberContext(userId, serverId);
  if (!target) return res.status(404).json({ error: "Няма такъв член." });
  if (!outranks(me, target)) return res.status(403).json({ error: "Може само хора с по-нисък ранг." });

  await prisma.membership.delete({ where: { userId_serverId: { userId, serverId } } });
  const server = io(req);
  server?.to(`user:${userId}`).emit(SocketEvents.ServerKicked, { serverId });
  server?.in(`user:${userId}`).socketsLeave(`server:${serverId}`);
  notifyMembersChanged(server, serverId);
  res.status(204).end();
}
