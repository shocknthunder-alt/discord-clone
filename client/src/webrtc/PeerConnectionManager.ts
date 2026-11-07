import { SocketEvents, type WebRTCSignal } from "@discord-clone/shared";
import type { Socket } from "socket.io-client";

// STUN alone fails whenever both peers sit behind restrictive/symmetric NAT (e.g. two
// different home networks), leaving the connection stuck in "connecting" forever with no
// audio. The TURN relay below (Open Relay Project, metered.ca) is a free public fallback
// for exactly that case. Fine for personal use; swap for a dedicated TURN server if this
// app grows beyond a handful of concurrent users.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// WebRTC's default bandwidth estimate (~2 Mbps) looks blurry at 2K/4K regardless of the
// captured resolution; raise the sender's target bitrate so screen-share text/UI stays
// sharp. 8 Mbps is a reasonable ceiling for 4K30 screen content over a decent connection —
// the encoder still backs off under real congestion, this only raises the cap.
async function applyHighQualityEncoding(sender: RTCRtpSender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 8_000_000;
    await sender.setParameters(params);
  } catch (err) {
    console.error("Failed to raise screen-share bitrate", err);
  }
}

// RTCRtpSender.setParameters' maxBitrate is unreliable for audio across browsers; the
// Opus bitrate is more consistently controlled by munging the fmtp line in the SDP itself.
// Browsers default Opus to ~32-40 Kbps (speech-tuned) — 128 Kbps plus inband FEC (forward
// error correction, lets the decoder reconstruct audio lost to dropped packets) gets much
// closer to what Opus is actually capable of for voice/music.
function boostOpusAudio(sdp: string, maxAverageBitrateBps = 128_000): string {
  const lines = sdp.split("\r\n");
  const opusLine = lines.find((line) => /^a=rtpmap:\d+ opus\/48000/i.test(line));
  const payloadType = opusLine?.match(/^a=rtpmap:(\d+)/)?.[1];
  if (!payloadType) return sdp;

  return lines
    .map((line) => {
      if (!line.startsWith(`a=fmtp:${payloadType} `)) return line;
      if (line.includes("maxaveragebitrate")) return line;
      return `${line};maxaveragebitrate=${maxAverageBitrateBps};useinbandfec=1`;
    })
    .join("\r\n");
}

interface PeerHandle {
  socketId: string;
  userId: string;
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  remoteAudioStream: MediaStream;
  remoteScreenStream: MediaStream;
  // The mic audio track is always added first (at join time); any audio track that
  // arrives after that one has already been seen must be the screen-share's tab/system
  // audio, since nothing else ever adds a second audio track to this connection.
  hasMicAudio: boolean;
}

export type ConnectionQuality = "good" | "medium" | "poor" | "unknown";

interface PeerConnectionManagerCallbacks {
  onAudioStream: (socketId: string, userId: string, stream: MediaStream) => void;
  onScreenStream: (socketId: string, stream: MediaStream | null) => void;
  onPeerClosed: (socketId: string) => void;
  onQualityChange?: (quality: ConnectionQuality) => void;
  onPeerQualityChange?: (socketId: string, quality: ConnectionQuality, rttMs: number | null) => void;
}

const STATS_POLL_INTERVAL_MS = 2500;

export class PeerConnectionManager {
  private peers = new Map<string, PeerHandle>();
  private localStream: MediaStream | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;
  private localScreenAudioTrack: MediaStreamTrack | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private socket: Socket,
    private callbacks: PeerConnectionManagerCallbacks,
  ) {
    this.socket.on(SocketEvents.VoiceSignal, ({ fromSocketId, signal }: { fromSocketId: string; signal: WebRTCSignal }) => {
      void this.handleSignal(fromSocketId, signal);
    });

    this.statsInterval = setInterval(() => void this.pollStats(), STATS_POLL_INTERVAL_MS);
  }

  /**
   * Classifies call quality from each peer connection's RTCStatsReport. Reported both
   * per-peer (onPeerQualityChange, with the actual RTT in ms for display) since quality
   * to each person in a mesh call is genuinely independent — great to one peer doesn't
   * mean great to another — and as a single worst-of-all indicator (onQualityChange) for
   * a simple overall status. Thresholds are rule-of-thumb values for voice: round-trip
   * time under ~150ms and under 2% packet loss reads as unnoticeable; beyond ~300ms/5%
   * loss is where choppiness becomes obvious.
   */
  private async pollStats() {
    if (this.peers.size === 0) {
      this.callbacks.onQualityChange?.("unknown");
      return;
    }

    let worst: ConnectionQuality = "good";
    const rank: Record<ConnectionQuality, number> = { good: 0, medium: 1, poor: 2, unknown: 0 };

    for (const [socketId, peer] of this.peers.entries()) {
      try {
        const report = await peer.connection.getStats();
        let rttMs: number | null = null;
        let packetsLost = 0;
        let packetsReceived = 0;

        report.forEach((stat) => {
          if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated) {
            if (typeof stat.currentRoundTripTime === "number") {
              rttMs = stat.currentRoundTripTime * 1000;
            }
          }
          if (stat.type === "inbound-rtp" && stat.kind === "audio") {
            packetsLost += stat.packetsLost ?? 0;
            packetsReceived += stat.packetsReceived ?? 0;
          }
        });

        const lossRatio = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;

        let peerQuality: ConnectionQuality = "good";
        if (rttMs === null) {
          peerQuality = "unknown";
        } else if (rttMs > 300 || lossRatio > 0.05) {
          peerQuality = "poor";
        } else if (rttMs > 150 || lossRatio > 0.02) {
          peerQuality = "medium";
        }

        this.callbacks.onPeerQualityChange?.(socketId, peerQuality, rttMs === null ? null : Math.round(rttMs));

        if (rank[peerQuality] > rank[worst]) worst = peerQuality;
      } catch (err) {
        console.error("Failed to read connection stats", err);
      }
    }

    this.callbacks.onQualityChange?.(worst);
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream;
  }

  /** Called when we discover an existing peer in the channel — we always initiate toward them. */
  addPeerAndInitiate(socketId: string, userId: string) {
    const peer = this.getOrCreatePeer(socketId, userId);
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      peer.connection.addTrack(track, this.localStream!);
    }
  }

  /**
   * Called when a new peer announces itself to us — we don't send the first offer (that's
   * the joiner's job, see addPeerAndInitiate, which avoids both sides racing to offer at
   * once), but we still need to add our own audio track to THIS connection, or our side
   * of the call stays receive-only forever: we'd hear the joiner fine (their offer carries
   * their track), but they'd never hear us, since nothing ever added our track to send.
   * Adding it here triggers our own onnegotiationneeded, which perfect-negotiation's
   * polite/impolite handling in handleSignal resolves safely against the joiner's offer.
   */
  registerIncomingPeer(socketId: string, userId: string) {
    const peer = this.getOrCreatePeer(socketId, userId);
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      peer.connection.addTrack(track, this.localStream!);
    }
  }

  removePeer(socketId: string) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    peer.connection.close();
    this.peers.delete(socketId);
    this.callbacks.onPeerClosed(socketId);
  }

  closeAll() {
    for (const socketId of Array.from(this.peers.keys())) {
      this.removePeer(socketId);
    }
    this.localScreenTrack = null;
    this.localScreenAudioTrack = null;
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  startScreenShare(screenStream: MediaStream) {
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;
    this.localScreenTrack = videoTrack;

    // The shared tab/system audio (e.g. a YouTube clip) — optional, since "Entire Screen"
    // capture doesn't always offer audio and some browsers omit it even when requested.
    const audioTrack = screenStream.getAudioTracks()[0] ?? null;
    this.localScreenAudioTrack = audioTrack;

    for (const peer of this.peers.values()) {
      const sender = peer.connection.addTrack(videoTrack, screenStream);
      void applyHighQualityEncoding(sender);
      if (audioTrack) {
        peer.connection.addTrack(audioTrack, screenStream);
      }
    }
  }

  stopScreenShare() {
    if (!this.localScreenTrack) return;
    for (const peer of this.peers.values()) {
      for (const sender of peer.connection.getSenders()) {
        if (sender.track === this.localScreenTrack || sender.track === this.localScreenAudioTrack) {
          peer.connection.removeTrack(sender);
        }
      }
    }
    this.localScreenTrack.stop();
    this.localScreenTrack = null;
    this.localScreenAudioTrack?.stop();
    this.localScreenAudioTrack = null;
  }

  private getOrCreatePeer(socketId: string, userId: string): PeerHandle {
    const existing = this.peers.get(socketId);
    if (existing) {
      // A signal can race the roster event and create the peer before we know its userId
      // (see handleSignal's fallback below) — backfill it once the real id is known.
      if (userId && !existing.userId) existing.userId = userId;
      return existing;
    }

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // Deterministic tie-breaker for renegotiation glare (MDN "perfect negotiation" pattern).
    const polite = socketId < this.socket.id!;

    const peer: PeerHandle = {
      socketId,
      userId,
      connection,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      remoteAudioStream: new MediaStream(),
      remoteScreenStream: new MediaStream(),
      hasMicAudio: false,
    };

    connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.sendSignal(socketId, { type: "candidate", data: candidate });
      }
    };

    connection.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        const offer = await connection.createOffer();
        if (offer.sdp) offer.sdp = boostOpusAudio(offer.sdp);
        await connection.setLocalDescription(offer);
        this.sendSignal(socketId, { type: "offer", data: connection.localDescription });
      } catch (err) {
        console.error("negotiation error", err);
      } finally {
        peer.makingOffer = false;
      }
    };

    connection.ontrack = ({ track, streams }) => {
      if (track.kind === "audio" && !peer.hasMicAudio) {
        peer.hasMicAudio = true;
        peer.remoteAudioStream.addTrack(track);
        this.callbacks.onAudioStream(socketId, peer.userId, peer.remoteAudioStream);
      } else {
        // Screen-share video, or screen-share audio (any audio track beyond the first).
        const sourceStream = streams[0];
        peer.remoteScreenStream.addTrack(track);
        this.callbacks.onScreenStream(socketId, peer.remoteScreenStream);
        track.onended = () => {
          peer.remoteScreenStream.removeTrack(track);
          this.callbacks.onScreenStream(socketId, peer.remoteScreenStream.getTracks().length > 0 ? peer.remoteScreenStream : null);
        };
        void sourceStream;
      }
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        this.removePeer(socketId);
      }
    };

    this.peers.set(socketId, peer);
    return peer;
  }

  private sendSignal(targetSocketId: string, signal: WebRTCSignal) {
    this.socket.emit(SocketEvents.VoiceSignal, { targetSocketId, signal });
  }

  private async handleSignal(fromSocketId: string, signal: WebRTCSignal) {
    const peer = this.peers.get(fromSocketId) ?? this.getOrCreatePeer(fromSocketId, "");
    const { connection } = peer;

    if (signal.type === "offer" || signal.type === "answer") {
      const description = signal.data as RTCSessionDescriptionInit;
      const offerCollision = description.type === "offer" && (peer.makingOffer || connection.signalingState !== "stable");

      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;

      await connection.setRemoteDescription(description);
      if (description.type === "offer") {
        const answer = await connection.createAnswer();
        if (answer.sdp) answer.sdp = boostOpusAudio(answer.sdp);
        await connection.setLocalDescription(answer);
        this.sendSignal(fromSocketId, { type: "answer", data: connection.localDescription });
      }
    } else if (signal.type === "candidate") {
      try {
        await connection.addIceCandidate(signal.data as RTCIceCandidateInit);
      } catch (err) {
        if (!peer.ignoreOffer) {
          console.error("Failed to add ICE candidate", err);
        }
      }
    }
  }
}
