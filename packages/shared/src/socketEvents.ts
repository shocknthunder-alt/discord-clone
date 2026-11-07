export const SocketEvents = {
  // chat / presence
  ServerJoin: "server:join",
  ServerJoined: "server:joined",
  ChannelJoin: "channel:join",
  MessageSend: "message:send",
  MessageNew: "message:new",
  MessageEdit: "message:edit",
  MessageUpdated: "message:updated",
  MessageDelete: "message:delete",
  MessageDeleted: "message:deleted",
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
  VoiceChannelOccupants: "voice:channel-occupants",

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
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
