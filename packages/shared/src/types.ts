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

export interface CustomEmojiDTO {
  id: string;
  name: string;
  imageUrl: string;
}

export type MembershipRole = "OWNER" | "MEMBER";

export interface TextChannelDTO {
  id: string;
  name: string;
  backgroundUrl: string | null;
  serverId: string;
  position: number;
  /** "trivia" channels are handled by the Trivia Bot. */
  type: "text" | "trivia";
  /** Newest message by a person (not the trivia bot), for unread markers. Missing on old servers. */
  lastMessageAt?: string | null;
}

/** Sent to everyone in a server when someone posts in one of its text channels (no content). */
export interface ChannelActivityPayload {
  serverId: string;
  textChannelId: string;
  authorId: string;
  createdAt: string;
}

export interface VoiceChannelDTO {
  id: string;
  name: string;
  backgroundUrl: string | null;
  serverId: string;
  position: number;
}

export interface ReplyPreview {
  id: string;
  authorUsername: string;
  content: string;
  imageUrl: string | null;
}

export interface ReactionDTO {
  emoji: string;
  userIds: string[];
}

export interface MessageDTO {
  id: string;
  content: string;
  imageUrl: string | null;
  textChannelId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  editedAt: string | null;
  replyTo: ReplyPreview | null;
  reactions: ReactionDTO[];
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
