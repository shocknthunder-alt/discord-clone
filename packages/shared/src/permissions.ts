/**
 * Server ranks ("роли"). Each member has at most one rank; members without one get the server's
 * default rank ("Член"). The owner always has every permission. A rank can only manage people and
 * ranks BELOW it (higher `position` = higher rank).
 */
export const Perm = {
  /** Everything below, no matter what else is ticked. */
  ADMINISTRATOR: 1 << 0,
  /** Server name / icon. */
  MANAGE_SERVER: 1 << 1,
  /** Create, rename, reorder, delete channels. */
  MANAGE_CHANNELS: 1 << 2,
  /** Create/edit ranks below your own and give them to people. */
  MANAGE_ROLES: 1 << 3,
  /** Drag people between voice channels / disconnect them from voice. */
  MOVE_MEMBERS: 1 << 4,
  /** Remove people from the server. */
  KICK_MEMBERS: 1 << 5,
  /** Delete other people's messages. */
  MANAGE_MESSAGES: 1 << 6,
  /** Edit/delete other people's events. */
  MANAGE_EVENTS: 1 << 7,
  /** Edit/delete other people's soundboard clips. */
  MANAGE_SOUNDBOARD: 1 << 8,
  /** Create events. */
  CREATE_EVENTS: 1 << 9,
  /** Upload soundboard clips. */
  ADD_SOUNDS: 1 << 10,
  /** Add custom emojis. */
  ADD_EMOJIS: 1 << 11,
} as const;

export type PermKey = keyof typeof Perm;

export const ALL_PERMS = Object.values(Perm).reduce((a, b) => a | b, 0);

/** What a plain member can do (the default rank starts with this). */
export const DEFAULT_MEMBER_PERMS = Perm.CREATE_EVENTS | Perm.ADD_SOUNDS | Perm.ADD_EMOJIS;

export const PERM_INFO: { key: PermKey; label: string; hint: string }[] = [
  { key: "ADMINISTRATOR", label: "Администратор", hint: "Всички права по-долу." },
  { key: "MANAGE_SERVER", label: "Управление на сървъра", hint: "Име и икона на сървъра." },
  { key: "MANAGE_CHANNELS", label: "Управление на каналите", hint: "Създаване, преименуване, подреждане, изтриване." },
  { key: "MANAGE_ROLES", label: "Управление на ранговете", hint: "Създава/променя рангове под своя и ги дава на хора." },
  { key: "MOVE_MEMBERS", label: "Местене на хора", hint: "Влачи хора между гласовите канали и ги изключва от гласа." },
  { key: "KICK_MEMBERS", label: "Изгонване", hint: "Премахва хора от сървъра." },
  { key: "MANAGE_MESSAGES", label: "Управление на съобщенията", hint: "Трие чужди съобщения." },
  { key: "MANAGE_EVENTS", label: "Управление на събитията", hint: "Редактира и трие чужди събития." },
  { key: "MANAGE_SOUNDBOARD", label: "Управление на soundboard", hint: "Редактира и трие чужди звуци." },
  { key: "CREATE_EVENTS", label: "Създаване на събития", hint: "" },
  { key: "ADD_SOUNDS", label: "Качване на звуци", hint: "В soundboard-а." },
  { key: "ADD_EMOJIS", label: "Добавяне на емоджита", hint: "" },
];

export function hasPerm(perms: number, p: number): boolean {
  return (perms & Perm.ADMINISTRATOR) !== 0 || (perms & p) === p;
}

export interface RoleDTO {
  id: string;
  name: string;
  /** #rrggbb or null (default text colour). */
  color: string | null;
  /** Higher = higher rank. The default rank is always 0. */
  position: number;
  permissions: number;
  isDefault: boolean;
}

export interface MemberDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** null = the default rank. */
  roleId: string | null;
  isOwner: boolean;
  online: boolean;
  joinedAt: string;
}

export interface MembersResponse {
  members: MemberDTO[];
  roles: RoleDTO[];
  /** Your effective permissions in this server. */
  myPermissions: number;
  /** Your rank position (owner = Infinity is sent as 1e9). */
  myRank: number;
}

/** Server → the moved person's socket: switch to this voice channel (null = disconnected). */
export interface VoiceMovedPayload {
  voiceChannelId: string | null;
  byUsername: string;
}
