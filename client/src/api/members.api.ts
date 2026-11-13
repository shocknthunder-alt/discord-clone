import type { MembersResponse, RoleDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchMembers(serverId: string) {
  return http.get<MembersResponse>(`/api/servers/${serverId}/members`).then((r) => r.data);
}

export function createRole(serverId: string, body: { name: string; color?: string | null; permissions?: number }) {
  return http.post<{ role: RoleDTO }>(`/api/servers/${serverId}/roles`, body).then((r) => r.data.role);
}

export function updateRole(serverId: string, roleId: string, body: { name?: string; color?: string | null; permissions?: number }) {
  return http.patch<{ role: RoleDTO }>(`/api/servers/${serverId}/roles/${roleId}`, body).then((r) => r.data.role);
}

export function deleteRole(serverId: string, roleId: string) {
  return http.delete(`/api/servers/${serverId}/roles/${roleId}`);
}

export function reorderRoles(serverId: string, roleIds: string[]) {
  return http.put(`/api/servers/${serverId}/roles/order`, { roleIds });
}

export function setMemberRole(serverId: string, userId: string, roleId: string | null) {
  return http.put(`/api/servers/${serverId}/members/${userId}/role`, { roleId });
}

export function kickMember(serverId: string, userId: string) {
  return http.delete(`/api/servers/${serverId}/members/${userId}`);
}

/** Server error text, if it sent one. */
export function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
}
