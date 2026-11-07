export const SocketEvents = {
  // chat / presence
  ServerJoin: "server:join",
  ServerJoined: "server:joined",
  ChannelJoin: "channel:join",
  MessageSend: "message:send",
  MessageNew: "message:new",
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

  // screen share
  ScreenShareStart: "screenshare:start",
  ScreenShareStop: "screenshare:stop",
  ScreenShareStarted: "screenshare:started",
  ScreenShareStopped: "screenshare:stopped",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
