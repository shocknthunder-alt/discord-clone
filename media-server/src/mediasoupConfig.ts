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
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
  // H.264 lets browsers use the GPU's hardware encoder — screen shares of games run at full
  // frame rate without eating the CPU. Clients fall back to VP8 when this isn't offered.
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
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
