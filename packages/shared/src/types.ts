export interface UserDTO {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  /** Custom status (null/absent = none or expired). */
  customStatus?: string | null;
  customStatusUntil?: string | null;
  /** How my messages look (Settings → Чат → Моят текст); absent on older servers. */
  textStyle?: import("./textStyle.js").TextStyle | null;
  /** My own icon / banner / channel backgrounds that only I see; absent on older servers. */
  personalLooks?: import("./personalLooks.js").PersonalLooks | null;
}

export interface ServerDTO {
  id: string;
  name: string;
  iconUrl: string | null;
  /** Picture at the top of the channel list (absent on older servers). */
  bannerUrl?: string | null;
  ownerId: string;
  inviteCode: string;
  /** AFK voice channel (null/absent = none). Older servers' rows may not have these yet. */
  afkChannelId?: string | null;
  /** Minutes without speaking before someone is moved to the AFK channel. */
  afkTimeoutMin?: number;
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
  /**
   * "trivia" channels are handled by the Trivia Bot; "forum" = a list of topics, each its own thread;
   * "draw" = the 🎨 draw-and-guess game; "blocks" = 🧱 Шметрис (solo falling blocks + server top list); "match" = 🍬 Шмиксер (solo match-3 + top list);
   * "survivors" = 🧟 Шмиркленд (survive the hordes, solo / co-op).
   */
  type: "text" | "trivia" | "forum" | "draw" | "blocks" | "match" | "survivors";
  /** Newest message by a person (not the trivia bot), for unread markers. Missing on old servers. */
  lastMessageAt?: string | null;
}

/** A soundboard clip. Built-in ones have ids starting with "builtin:" and live in the client. */
export interface SoundboardSoundDTO {
  id: string;
  name: string;
  emoji: string;
  url: string;
  durationMs: number;
  /** 0-100, chosen by the uploader. */
  volume: number;
  uploaderId: string | null;
}

/** Built-in clips every server has (synthesised for the app, served from the client's /public). */
export const BUILTIN_SOUNDS: SoundboardSoundDTO[] = [
  { id: "builtin:tada", name: "Тадаа!", emoji: "🎺", url: "/sounds/soundboard/tada.mp3", durationMs: 1800, volume: 70, uploaderId: null },
  { id: "builtin:badumtss", name: "Ба-дум-тсс", emoji: "🥁", url: "/sounds/soundboard/badumtss.mp3", durationMs: 2000, volume: 80, uploaderId: null },
];

/** Someone pressed a soundboard button in your voice channel. */
export interface SoundboardPlayedPayload {
  voiceChannelId: string;
  soundId: string;
  url: string;
  volume: number;
  userId: string;
  username: string;
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
  /** 📌 When it was pinned (null/absent = not pinned; older servers don't send it). */
  pinnedAt?: string | null;
  /** Only in the pins list. */
  pinnedByUsername?: string | null;
  /** 📊 When this message is a poll. */
  poll?: PollDTO | null;
}

/** 📊 A poll; votes[i] = ids of the people who picked option i. */
export interface PollDTO {
  id: string;
  question: string;
  options: string[];
  multi: boolean;
  /** null = never closes. */
  endsAt: string | null;
  /** Already over when the server sent it (ended by hand, or its time passed) — no need to trust the
   *  client's clock for that. Optional: older servers don't send it. */
  closed?: boolean;
  votes: string[][];
}

/** server → channel room: poll:updated. */
export interface PollUpdatedPayload {
  messageId: string;
  textChannelId: string;
  poll: PollDTO;
}

/** An earlier version of an edited message (GET /api/messages/:id/edits). */
export interface MessageEditDTO {
  content: string;
  /** When this version was replaced. */
  replacedAt: string;
}

/** server → message:pinned (to the channel room). */
export interface MessagePinnedPayload {
  id: string;
  textChannelId: string;
  pinnedAt: string | null;
  byUsername: string;
}

/** server → the mentioned person's user room: someone @mentioned you (or @everyone). */
export interface MentionPayload {
  serverId: string;
  textChannelId: string;
  channelName: string;
  messageId: string;
  /** Thread root when the mention is a thread reply. */
  rootId: string | null;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  content: string;
  everyone: boolean;
}

/** A topic in a forum channel: the opening message + how busy it is. */
export interface ForumPostDTO {
  message: MessageDTO;
  replyCount: number;
  lastActivityAt: string;
}

/** A server sticker (sent as imageUrl + "#sticker"). */
export interface StickerDTO {
  id: string;
  name: string;
  imageUrl: string;
  uploaderId: string | null;
}

/** A link preview card (GET /api/unfurl?url=). */
export interface LinkPreviewDTO {
  url: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  /** true = a big picture under the text (og/twitter "summary_large_image"); false = a thumbnail. */
  largeImage: boolean;
  themeColor: string | null;
}

/** One GIF from the GIF search (GET /api/gifs/search). */
export interface GifDTO {
  id: string;
  title: string;
  /** Small animated preview for the picker grid. */
  preview: string;
  /** What gets sent to the chat. */
  url: string;
  width: number;
  height: number;
}

/** "Какво играе" — detected by the desktop app. */
export interface UserActivity {
  name: string;
  /** ms since epoch. */
  since: number;
  /** The game's icon from its .exe (data:image/png, 32×32; desktop 1.11.0+), else absent. */
  icon?: string | null;
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
  /** YouTube video id ("" for songs from the music server). */
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  addedByUsername: string;
  /** Missing = "youtube" (older items/servers). "subsonic" = yogurthub song played from streamUrl. */
  source?: "youtube" | "subsonic";
  /** subsonic: signed MP3 stream (append &timeOffset=N to start mid-song). */
  streamUrl?: string;
  durationSeconds?: number;
}

/**
 * One input from the person controlling a streamer's PC. Mouse positions are 0..1 across the
 * shared picture (screen or window); keys are KeyboardEvent.code values.
 */
export type ControlInputEvent =
  | { t: "move"; x: number; y: number }
  | { t: "down" | "up"; b: 0 | 1 | 2; x: number; y: number }
  | { t: "wheel"; dx: number; dy: number }
  | { t: "keydown" | "keyup"; code: string };

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
