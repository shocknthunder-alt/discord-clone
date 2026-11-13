import { ALL_PERMS, DEFAULT_MEMBER_PERMS, hasPerm } from "@discord-clone/shared";
import { prisma } from "./db.js";

export const OWNER_RANK = 1_000_000_000;

/** The server's default rank, created on first use (servers made before ranks existed have none). */
export async function ensureDefaultRole(serverId: string) {
  const existing = await prisma.role.findFirst({ where: { serverId, isDefault: true } });
  if (existing) return existing;
  return prisma.role.create({
    data: { serverId, name: "Член", position: 0, permissions: DEFAULT_MEMBER_PERMS, isDefault: true },
  });
}

export interface MemberContext {
  userId: string;
  serverId: string;
  isOwner: boolean;
  permissions: number;
  /** Rank position; the owner is above everyone. */
  rank: number;
  roleId: string | null;
}

/** null when the user isn't in the server. */
export async function memberContext(userId: string, serverId: string): Promise<MemberContext | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId, serverId } },
    include: { rank: true, server: { select: { ownerId: true } } },
  });
  if (!membership) return null;
  const isOwner = membership.role === "OWNER" || membership.server.ownerId === userId;
  if (isOwner) return { userId, serverId, isOwner, permissions: ALL_PERMS, rank: OWNER_RANK, roleId: membership.roleId };
  const rank = membership.rank ?? (await ensureDefaultRole(serverId));
  return { userId, serverId, isOwner, permissions: rank.permissions, rank: rank.position, roleId: membership.roleId };
}

export async function can(userId: string, serverId: string, perm: number): Promise<MemberContext | null> {
  const ctx = await memberContext(userId, serverId);
  return ctx && hasPerm(ctx.permissions, perm) ? ctx : null;
}

/** Whether `actor` may act on `target` (move, kick, change rank): strictly higher rank, never the owner. */
export function outranks(actor: MemberContext, target: MemberContext): boolean {
  if (target.isOwner) return false;
  return actor.isOwner || actor.rank > target.rank;
}
