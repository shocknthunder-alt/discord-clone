import type * as mediasoup from "mediasoup";

export const mediaCodecs: mediasoup.types.RouterRtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: {
      // Matches the bitrate/FEC/DTX tuning the old mesh client used — keeps voice quality
      // consistent across the migration rather than falling back to Opus defaults.
      maxaveragebitrate: 128000,
      useinbandfec: 1,
      usedtx: 1,
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
