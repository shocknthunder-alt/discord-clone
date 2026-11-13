import { create } from "zustand";
import { hasPerm, type MemberDTO, type RoleDTO } from "@discord-clone/shared";
import { fetchMembers } from "../api/members.api";

/** Members, ranks and your own permissions for the server that is open. */
interface MembersState {
  serverId: string | null;
  members: MemberDTO[];
  roles: RoleDTO[];
  myPermissions: number;
  myRank: number;
  panelOpen: boolean;
  load: (serverId: string) => Promise<void>;
  setOnline: (userId: string, online: boolean) => void;
  togglePanel: () => void;
}

let loadSeq = 0;

export const useMembersStore = create<MembersState>((set, get) => ({
  serverId: null,
  members: [],
  roles: [],
  myPermissions: 0,
  myRank: 0,
  panelOpen: localStorage.getItem("membersPanelOpen") !== "false",
  load: async (serverId) => {
    const seq = ++loadSeq;
    if (get().serverId !== serverId) set({ serverId, members: [], roles: [], myPermissions: 0, myRank: 0 });
    const r = await fetchMembers(serverId);
    if (seq !== loadSeq) return; // a newer load (other server) won
    set({ serverId, members: r.members, roles: r.roles, myPermissions: r.myPermissions, myRank: r.myRank });
  },
  setOnline: (userId, online) =>
    set((s) => ({ members: s.members.map((m) => (m.userId === userId && m.online !== online ? { ...m, online } : m)) })),
  togglePanel: () =>
    set((s) => {
      localStorage.setItem("membersPanelOpen", String(!s.panelOpen));
      return { panelOpen: !s.panelOpen };
    }),
}));

/** Do I have this permission in the open server? */
export function usePerm(p: number): boolean {
  return useMembersStore((s) => hasPerm(s.myPermissions, p));
}

/** The rank a member effectively has (their own, or the default). */
export function roleOf(m: Pick<MemberDTO, "roleId">, roles: RoleDTO[]): RoleDTO | undefined {
  return roles.find((r) => r.id === m.roleId) ?? roles.find((r) => r.isDefault);
}

/** A member's rank position (owner above everyone). */
export function rankOf(m: MemberDTO, roles: RoleDTO[]): number {
  return m.isOwner ? 1e9 : (roleOf(m, roles)?.position ?? 0);
}

/** Username colour by rank, for chat and lists. */
export function useMemberColor(userId: string): string | undefined {
  return useMembersStore((s) => {
    const m = s.members.find((x) => x.userId === userId);
    return m ? (roleOf(m, s.roles)?.color ?? undefined) : undefined;
  });
}
