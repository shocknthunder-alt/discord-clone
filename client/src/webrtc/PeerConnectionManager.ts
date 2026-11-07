import { SocketEvents, type WebRTCSignal } from "@discord-clone/shared";
import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

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
      peer.connection.addTrack(track, screenStream);
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
    if (existing) return existing;

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
