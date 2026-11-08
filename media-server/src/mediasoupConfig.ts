import type * as mediasoup from "mediasoup";

export const mediaCodecs: mediasoup.types.RouterRtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: {
      maxaveragebitrate: 128000,
      useinbandfec: 1,
      // DTX (discontinuous transmission, stop sending during silence) was carried over
      // from the old mesh tuning to save bandwidth, but it's a known source of audible
      // artifacts: with background noise sitting near the voice-activity threshold, the
      // encoder flickers between active/DTX state and produces exactly the clicking/static
      // residual noise reported (audible even while not speaking, gone only when fully
      // muted — not room noise, a codec artifact). Bandwidth isn't the constraint it used
      // to be post-SFU, so this isn't worth the quality cost.
    },
  },
  {
    // Listed before VP8 so it's preferred when both sides support it (Chrome does) — VP9
    // compresses meaningfully better than VP8 at the same quality, and its SVC mode lets a
    // single encoder produce layered output instead of SfuMediaManager running three
    // separate full encoder instances for simulcast (see startScreenShare), which is what
    // was pushing a 4K share to drop frames at the source regardless of any viewer's
    // network. VP8 stays below as the fallback for clients/codecs without VP9 support.
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

export const workerSettings: mediasoup.types.WorkerSettings = {
  logLevel: "warn",
  // Unused when every transport is created against a WebRtcServer (see createWebRtcServer
  // below), but mediasoup still requires a valid range to be configured on the worker.
  rtcMinPort: 44445,
  rtcMaxPort: 44445,
};

export function webRtcServerListenInfos(announcedIp: string, port: number): mediasoup.types.TransportListenInfo[] {
  return [
    { protocol: "udp", ip: "0.0.0.0", announcedAddress: announcedIp, port },
    { protocol: "tcp", ip: "0.0.0.0", announcedAddress: announcedIp, port },
  ];
}
