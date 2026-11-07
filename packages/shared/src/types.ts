export interface UserDTO {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}

export interface ServerDTO {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
}

export type MembershipRole = "OWNER" | "MEMBER";

export interface TextChannelDTO {
  id: string;
  name: string;
  serverId: string;
  position: number;
}

export interface VoiceChannelDTO {
  id: string;
  name: string;
  serverId: string;
  position: number;
}

export interface MessageDTO {
  id: string;
  content: string;
  textChannelId: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  editedAt: string | null;
}

export interface VoicePeerInfo {
  userId: string;
  socketId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
}

export interface WebRTCSignal {
  type: "offer" | "answer" | "candidate";
  data: unknown;
}
