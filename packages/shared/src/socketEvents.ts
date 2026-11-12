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
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
