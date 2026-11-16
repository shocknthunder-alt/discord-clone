export const SocketEvents = {
  // chat / presence
  ServerJoin: "server:join",
  ServerJoined: "server:joined",
  ChannelsChanged: "channels:changed",
  /** Someone posted in a text channel of a server you're in (for unread markers). */
  ChannelActivity: "channel:activity",
  ChannelJoin: "channel:join",
  MessageSend: "message:send",
  MessageNew: "message:new",
  MessageEdit: "message:edit",
  MessageUpdated: "message:updated",
  MessageDelete: "message:delete",
  MessageDeleted: "message:deleted",
  MessageReact: "message:react",
  MessageReactionsUpdated: "message:reactions-updated",
  TypingStart: "typing:start",
  TypingStop: "typing:stop",
  TypingUpdate: "typing:update",
  PresenceUpdate: "presence:update",
  /** client → server: { messageId, pinned } (any member). */
  MessagePin: "message:pin",
  /** server → channel room: MessagePinnedPayload. */
  MessagePinned: "message:pinned",
  /** client → server: { textChannelId, question, options: string[], multi, hours (0 = no end) }. */
  PollCreate: "poll:create",
  /** client → server: { pollId, option } (toggles your vote). */
  PollVote: "poll:vote",
  /** server → channel room: PollUpdatedPayload. */
  PollUpdated: "poll:updated",
  /** server → user room: MentionPayload (someone @mentioned you). */
  MentionNew: "mention:new",
  /** client → server: { activity: { name } | null } — what I'm playing (desktop app). */
  PresenceActivity: "presence:activity",
  /** server → server rooms: { userId, activity: UserActivity | null }. */
  PresenceActivityUpdated: "presence:activity-updated",

  // voice signaling
  VoiceJoin: "voice:join",
  VoiceLeave: "voice:leave",
  VoicePeers: "voice:peers",
  VoicePeerJoined: "voice:peer-joined",
  VoicePeerLeft: "voice:peer-left",
  VoiceSignal: "voice:signal",
  VoiceMute: "voice:mute",
  VoiceDeafen: "voice:deafen",
  VoicePeerState: "voice:peer-state",
  // Each client reports its OWN round-trip time to the SFU; the server relays it to the room.
  VoicePing: "voice:ping",
  // The streamer reports their outgoing screen-share numbers (or null when they stop); relayed to the room.
  VoiceStreamStats: "voice:stream-stats",
  VoiceChannelOccupants: "voice:channel-occupants",
  /** client → server: play a soundboard clip in my voice channel. */
  SoundboardPlay: "soundboard:play",
  /** server → voice channel: play this clip now (stops whatever clip was playing). */
  SoundboardPlayed: "soundboard:played",
  /** server → server room: the soundboard list changed, refetch. */
  SoundboardChanged: "soundboard:changed",

  // members & ranks
  /** server → server room: members / ranks of server X changed, refetch. */
  MembersChanged: "members:changed",
  /** server → the kicked user's room. */
  ServerKicked: "server:kicked",
  /** { server: ServerDTO } — name/icon/AFK settings changed (to everyone in the server). */
  ServerUpdated: "server:updated",
  /** client → server: move someone to another voice channel (null = disconnect them). */
  VoiceMoveMember: "voice:move-member",
  /** server → the moved person's socket. */
  VoiceMoved: "voice:moved",

  // server events (📅 board)
  /** server → each member's user room: the events of server X changed, refetch. */
  EventsChanged: "events:changed",
  /** server → each member's user room: a new event was created (toast). */
  EventCreated: "events:created",

  // screen share
  ScreenShareStart: "screenshare:start",
  ScreenShareStop: "screenshare:stop",
  ScreenShareStarted: "screenshare:started",
  ScreenShareStopped: "screenshare:stopped",

  // direct messages
  DmJoin: "dm:join",
  DmSend: "dm:send",
  DmNew: "dm:new",
  DmEdit: "dm:edit",
  DmUpdated: "dm:updated",
  DmDelete: "dm:delete",
  DmDeleted: "dm:deleted",
  DmTypingStart: "dm:typing:start",
  DmTypingStop: "dm:typing:stop",
  DmTypingUpdate: "dm:typing:update",
  DmRing: "dm:ring",
  DmUnread: "dm:unread",

  // synced music ("watch party" style — no real audio bot, see MusicState)
  MusicState: "music:state",
  MusicAdd: "music:add",
  MusicAddError: "music:add-error",
  MusicEnded: "music:ended",
  MusicRemove: "music:remove",
  MusicPlay: "music:play",
  MusicPause: "music:pause",
  MusicSkip: "music:skip",
  MusicSeek: "music:seek",
  /** { voiceChannelId, trackIds?: string[], albumId?: string } — songs from the music server (yogurthub). */
  MusicAddTracks: "music:add-tracks",
  /** { voiceChannelId, itemId, toIndex } — drag a queued song to another place (not the playing one). */
  MusicMove: "music:move",

  // Remote control of a streamer's PC (desktop app only). Client→server events carry
  // { toUserId, ... }; the server relays them to that person (same voice channel only) as the
  // matching *In/*ed event with { fromUserId, fromUsername, ... }.
  ControlRequest: "control:request", // viewer → streamer: may I?
  ControlRequested: "control:requested",
  ControlResponse: "control:response", // streamer → viewer: { granted, reason? }
  ControlAnswered: "control:answered",
  ControlInput: "control:input", // viewer → streamer: { ev: ControlInputEvent }
  ControlInputIn: "control:input-in",
  ControlStop: "control:stop", // either side ends it: { reason? }
  ControlStopped: "control:stopped",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
