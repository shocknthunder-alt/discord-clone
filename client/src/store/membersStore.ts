import { create } from "zustand";
import { hasPerm, type MemberDTO, type RoleDTO } from "@discord-clone/shared";
import { fetchMembers } from "../api/members.api";
import { isMobileLayout } from "./mobileStore";

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
  setActivity: (userId: string, activity: MemberDTO["activity"]) => void;
  togglePanel: () => void;
}

let loadSeq = 0;

export const useMembersStore = create<MembersState>((set, get) => ({
  serverId: null,
  members: [],
  roles: [],
  myPermissions: 0,
  myRank: 0,
  // On a phone the list is a full-screen layer over the chat (👥 opens it) — it must start closed there,
  // or a first-time phone user sees only the member list and no message box. (Found by the e2e tests.)
  panelOpen: !isMobileLayout() && localStorage.getItem("membersPanelOpen") !== "false",
  load: async (serverId) => {
    const seq = ++loadSeq;
    if (get().serverId !== serverId) set({ serverId, members: [], roles: [], myPermissions: 0, myRank: 0 });
    const r = await fetchMembers(serverId);
    if (seq !== loadSeq) return; // a newer load (other server) won
    set({ serverId, members: r.members, roles: r.roles, myPermissions: r.myPermissions, myRank: r.myRank });
  },
  setOnline: (userId, online) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId && m.online !== online ? { ...m, online, ...(online ? {} : { activity: null }) } : m)),
    })),
  setActivity: (userId, activity) =>
    set((s) => ({ members: s.members.map((m) => (m.userId === userId ? { ...m, activity } : m)) })),
  togglePanel: () =>
    set((s) => {
      // The phone toggle is a temporary overlay: keep the desktop choice as it was.
      if (!isMobileLayout()) localStorage.setItem("membersPanelOpen", String(!s.panelOpen));
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

/** The server's owner gets their own look (gold, 👑) instead of a rank colour. */
export function useIsOwner(userId: string | null | undefined): boolean {
  return useMembersStore((s) => !!userId && !!s.members.find((x) => x.userId === userId)?.isOwner);
}

/** Username colour by rank, for chat and lists. */
export function useMemberColor(userId: string): string | undefined {
  return useMembersStore((s) => {
    const m = s.members.find((x) => x.userId === userId);
    return m ? (roleOf(m, s.roles)?.color ?? undefined) : undefined;
  });
}
