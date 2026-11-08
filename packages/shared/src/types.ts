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
  backgroundUrl: string | null;
  serverId: string;
  position: number;
}

export interface VoiceChannelDTO {
  id: string;
  name: string;
  serverId: string;
  position: number;
}

export interface ReplyPreview {
  id: string;
  authorUsername: string;
  content: string;
  imageUrl: string | null;
}

export interface MessageDTO {
  id: string;
  content: string;
  imageUrl: string | null;
  textChannelId: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  editedAt: string | null;
  replyTo: ReplyPreview | null;
}

export interface VoicePeerInfo {
  userId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  screenShareLabel: string | null;
}

export interface WebRTCSignal {
  type: "offer" | "answer" | "candidate";
  data: unknown;
}

export interface DmConversationDTO {
  id: string;
  otherUser: UserDTO;
  createdAt: string;
}

export interface MusicQueueItem {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  addedByUsername: string;
}

export interface MusicState {
  queue: MusicQueueItem[];
  // Index into queue of the currently-loaded item; equal to queue.length when nothing is
  // playing (end of queue / queue emptied), never a dangling out-of-range value otherwise.
  currentIndex: number;
  isPlaying: boolean;
  // Position as of `updatedAt`, in seconds — clients extrapolate the live position as
  // `positionSeconds + (Date.now() - updatedAt) / 1000` while isPlaying, rather than the
  // server pushing a continuous stream of position updates.
  positionSeconds: number;
  updatedAt: number;
}

export interface DirectMessageDTO {
  id: string;
  conversationId: string;
  content: string;
  imageUrl: string | null;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  editedAt: string | null;
}
