import type * as mediasoup from "mediasoup";
import { mediaCodecs } from "./mediasoupConfig.js";
import { getNextWorker } from "./workerPool.js";

export interface PeerProducerInfo {
  producerId: string;
  userId: string;
  kind: "audio" | "video";
  appData: Record<string, unknown>;
}

export class Peer {
  transports = new Map<string, mediasoup.types.WebRtcTransport>();
  producers = new Map<string, mediasoup.types.Producer>();
  consumers = new Map<string, mediasoup.types.Consumer>();

  constructor(
    public userId: string,
    public socketId: string,
  ) {}

  close() {
    // Closing a transport cascades to close every Producer/Consumer built on it
    // (mediasoup's own behavior) — clearing the maps after is just bookkeeping.
    for (const transport of this.transports.values()) transport.close();
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}

export class Room {
  peers = new Map<string, Peer>(); // keyed by userId

  private constructor(
    public id: string,
    public router: mediasoup.types.Router,
    private webRtcServer: mediasoup.types.WebRtcServer,
  ) {}

  static async create(id: string): Promise<Room> {
    const { worker, webRtcServer } = getNextWorker();
    const router = await worker.createRouter({ mediaCodecs });
    return new Room(id, router, webRtcServer);
  }

  getOrCreatePeer(userId: string, socketId: string): Peer {
    const existing = this.peers.get(userId);
    if (existing) {
      if (existing.socketId !== socketId) {
        // Reconnect (refresh, dropped connection, rejoin) — the previous connection's
        // transports/producers are now orphaned. Previously these were left in place and
        // just got a new socketId stamped on top, so a stale dead producer from the old
        // connection stayed in peer.producers alongside the live one. listProducers() would
        // hand both to anyone joining after that point, and since the client consumes the
        // initial producer list sequentially, consuming the stale one failing aborted the
        // loop before it ever reached the real, live producer — silently breaking this
        // peer's audio for every subsequent joiner while everyone else worked fine. Close
        // the old state out and start this peer fresh instead of merging onto it.
        existing.close();
        const peer = new Peer(userId, socketId);
        this.peers.set(userId, peer);
        return peer;
      }
      return existing;
    }
    const peer = new Peer(userId, socketId);
    this.peers.set(userId, peer);
    return peer;
  }

  listProducers(excludingUserId?: string): PeerProducerInfo[] {
    const result: PeerProducerInfo[] = [];
    for (const peer of this.peers.values()) {
      if (peer.userId === excludingUserId) continue;
      for (const producer of peer.producers.values()) {
        result.push({
          producerId: producer.id,
          userId: peer.userId,
          kind: producer.kind,
          appData: producer.appData as Record<string, unknown>,
        });
      }
    }
    return result;
  }

  async createWebRtcTransport(peer: Peer): Promise<mediasoup.types.WebRtcTransport> {
    const transport = await this.router.createWebRtcTransport({
      webRtcServer: this.webRtcServer,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      // Starting point for congestion control's bandwidth estimate, not a hard cap — it
      // ramps up or down from here based on real network conditions. Set higher than the
      // mesh-era default so a fresh screen share (targeting up to 8 Mbps, see
      // SfuMediaManager.startScreenShare) reaches full quality in seconds rather than
      // slowly climbing from a tiny estimate.
      initialAvailableOutgoingBitrate: 2_500_000,
    });
    peer.transports.set(transport.id, transport);
    transport.on("dtlsstatechange", (state) => {
      if (state === "closed" || state === "failed") transport.close();
    });
    return transport;
  }

  /**
   * socketId, when given, guards against a delayed/stale disconnect from an OLD connection
   * clobbering a peer that has since reconnected with a NEW socket — e.g. a dropped
   * connection whose server-side "disconnect" takes a few seconds to fire, by which point
   * the client already reconnected and getOrCreatePeer replaced this peer's state. Without
   * this guard, that late disconnect would tear down the newer, currently-active peer.
   */
  closePeer(userId: string, socketId?: string): string[] | undefined {
    const peer = this.peers.get(userId);
    if (!peer) return;
    if (socketId && peer.socketId !== socketId) return;
    const closedProducerIds = Array.from(peer.producers.keys());
    peer.close();
    this.peers.delete(userId);
    return closedProducerIds;
  }

  isEmpty(): boolean {
    return this.peers.size === 0;
  }

  close() {
    this.router.close();
  }
}

const rooms = new Map<string, Room>();

export async function getOrCreateRoom(roomId: string): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const room = await Room.create(roomId);
  rooms.set(roomId, room);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function removeRoomIfEmpty(roomId: string) {
  const room = rooms.get(roomId);
  if (room && room.isEmpty()) {
    room.close();
    rooms.delete(roomId);
  }
}
