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

interface PeerHandle {
  socketId: string;
  userId: string;
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  remoteAudioStream: MediaStream;
  remoteScreenStream: MediaStream;
}

interface PeerConnectionManagerCallbacks {
  onAudioStream: (socketId: string, userId: string, stream: MediaStream) => void;
  onScreenStream: (socketId: string, stream: MediaStream | null) => void;
  onPeerClosed: (socketId: string) => void;
}

export class PeerConnectionManager {
  private peers = new Map<string, PeerHandle>();
  private localStream: MediaStream | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;

  constructor(
    private socket: Socket,
    private callbacks: PeerConnectionManagerCallbacks,
  ) {
    this.socket.on(SocketEvents.VoiceSignal, ({ fromSocketId, signal }: { fromSocketId: string; signal: WebRTCSignal }) => {
      void this.handleSignal(fromSocketId, signal);
    });
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

  /** Called when a new peer announces itself to us — we wait passively for their offer. */
  registerIncomingPeer(socketId: string, userId: string) {
    this.getOrCreatePeer(socketId, userId);
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
  }

  startScreenShare(screenStream: MediaStream) {
    const track = screenStream.getVideoTracks()[0];
    if (!track) return;
    this.localScreenTrack = track;
    for (const peer of this.peers.values()) {
      const sender = peer.connection.addTrack(track, screenStream);
      void applyHighQualityEncoding(sender);
    }
  }

  stopScreenShare() {
    if (!this.localScreenTrack) return;
    for (const peer of this.peers.values()) {
      const sender = peer.connection.getSenders().find((s) => s.track === this.localScreenTrack);
      if (sender) {
        peer.connection.removeTrack(sender);
      }
    }
    this.localScreenTrack.stop();
    this.localScreenTrack = null;
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
    };

    connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.sendSignal(socketId, { type: "candidate", data: candidate });
      }
    };

    connection.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await connection.setLocalDescription();
        this.sendSignal(socketId, { type: "offer", data: connection.localDescription });
      } catch (err) {
        console.error("negotiation error", err);
      } finally {
        peer.makingOffer = false;
      }
    };

    connection.ontrack = ({ track, streams }) => {
      if (track.kind === "audio") {
        peer.remoteAudioStream.addTrack(track);
        this.callbacks.onAudioStream(socketId, peer.userId, peer.remoteAudioStream);
      } else {
        const sourceStream = streams[0];
        peer.remoteScreenStream.addTrack(track);
        this.callbacks.onScreenStream(socketId, peer.remoteScreenStream);
        track.onended = () => {
          peer.remoteScreenStream.removeTrack(track);
          this.callbacks.onScreenStream(socketId, null);
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
        await connection.setLocalDescription();
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
