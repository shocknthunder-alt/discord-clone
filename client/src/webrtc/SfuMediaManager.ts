import { Device, type types as MsTypes } from "mediasoup-client";
import type { Socket } from "socket.io-client";

export type ConnectionQuality = "good" | "medium" | "poor" | "unknown";

interface ProducerAppData {
  type: "mic" | "screen-video" | "screen-audio";
  userId?: string;
}

interface ProducerMeta {
  userId: string;
  isScreen: boolean;
}

interface NewProducerPayload {
  producerId: string;
  userId: string;
  kind: "audio" | "video";
  appData: ProducerAppData;
}

interface SfuMediaManagerCallbacks {
  onAudioStream: (userId: string, stream: MediaStream | null) => void;
  onScreenStream: (userId: string, stream: MediaStream | null) => void;
  onQualityChange?: (quality: ConnectionQuality) => void;
  onPeerQualityChange?: (userId: string, quality: ConnectionQuality, rttMs: number | null) => void;
}

const STATS_POLL_INTERVAL_MS = 2500;

function request<T>(socket: Socket, event: string, payload: object): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: (T & { error?: string }) | { error: string }) => {
      if (res && "error" in res && res.error) reject(new Error(res.error));
      else resolve(res as T);
    });
  });
}

export class SfuMediaManager {
  private device: Device | null = null;
  private sendTransport: MsTypes.Transport | null = null;
  private recvTransport: MsTypes.Transport | null = null;
  private roomId: string | null = null;

  private micProducer: MsTypes.Producer | null = null;
  private screenVideoProducer: MsTypes.Producer | null = null;
  private screenAudioProducer: MsTypes.Producer | null = null;

  private consumers = new Map<string, MsTypes.Consumer>(); // producerId -> consumer
  private producerMeta = new Map<string, ProducerMeta>(); // producerId -> meta
  private remoteAudioStreams = new Map<string, MediaStream>(); // userId -> stream
  private remoteScreenStreams = new Map<string, MediaStream>(); // userId -> stream

  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private knownUserIds = new Set<string>();

  constructor(
    private socket: Socket,
    private callbacks: SfuMediaManagerCallbacks,
  ) {
    this.socket.on("sfu:new-producer", this.handleNewProducer);
    this.socket.on("sfu:producer-closed", this.handleProducerClosed);
    this.socket.on("sfu:peer-left", this.handlePeerLeft);
  }

  private request<T>(event: string, payload: object = {}): Promise<T> {
    return request<T>(this.socket, event, { ...payload, roomId: this.roomId });
  }

  async join(roomId: string): Promise<void> {
    this.roomId = roomId;

    const { rtpCapabilities, producers } = await request<{
      rtpCapabilities: MsTypes.RtpCapabilities;
      producers: NewProducerPayload[];
    }>(this.socket, "sfu:join", { roomId });

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    await this.createSendTransport();
    await this.createRecvTransport();

    for (const producer of producers) {
      this.knownUserIds.add(producer.userId);
      await this.consume(producer.producerId, producer.userId, producer.appData);
    }

    this.statsInterval = setInterval(() => void this.pollStats(), STATS_POLL_INTERVAL_MS);
  }

  private async createSendTransport() {
    const params = await this.request<MsTypes.TransportOptions>("sfu:create-transport", { direction: "send" });
    const transport = this.device!.createSendTransport(params);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      this.request("sfu:connect-transport", { transportId: transport.id, dtlsParameters }).then(() => callback()).catch(errback);
    });

    transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
      this.request<{ id: string }>("sfu:produce", { transportId: transport.id, kind, rtpParameters, appData })
        .then(({ id }) => callback({ id }))
        .catch(errback);
    });

    this.sendTransport = transport;
  }

  private async createRecvTransport() {
    const params = await this.request<MsTypes.TransportOptions>("sfu:create-transport", { direction: "recv" });
    const transport = this.device!.createRecvTransport(params);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      this.request("sfu:connect-transport", { transportId: transport.id, dtlsParameters }).then(() => callback()).catch(errback);
    });

    this.recvTransport = transport;
  }

  private handleNewProducer = (payload: NewProducerPayload) => {
    this.knownUserIds.add(payload.userId);
    void this.consume(payload.producerId, payload.userId, payload.appData);
  };

  private async consume(producerId: string, userId: string, appData: ProducerAppData) {
    if (!this.device || !this.recvTransport) return;

    const { id, kind, rtpParameters } = await this.request<{
      id: string;
      kind: "audio" | "video";
      rtpParameters: MsTypes.RtpParameters;
    }>("sfu:consume", {
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume({ id, producerId, kind, rtpParameters });
    this.consumers.set(producerId, consumer);

    const isScreen = appData.type === "screen-video" || appData.type === "screen-audio";
    this.producerMeta.set(producerId, { userId, isScreen });

    await this.request("sfu:resume-consumer", { consumerId: consumer.id });

    if (isScreen) {
      const stream = this.remoteScreenStreams.get(userId) ?? new MediaStream();
      // Only one video / one screen-audio track should ever be live per user at once — drop
      // any stale same-kind track first (mirrors the old mesh manager's black-frame fix).
      for (const track of stream.getTracks()) {
        if (track.kind === consumer.track.kind) stream.removeTrack(track);
      }
      stream.addTrack(consumer.track);
      this.remoteScreenStreams.set(userId, stream);
      this.callbacks.onScreenStream(userId, stream);
    } else {
      const stream = this.remoteAudioStreams.get(userId) ?? new MediaStream();
      stream.addTrack(consumer.track);
      this.remoteAudioStreams.set(userId, stream);
      this.callbacks.onAudioStream(userId, stream);
    }
  }

  private handleProducerClosed = ({ producerId }: { producerId: string }) => {
    const consumer = this.consumers.get(producerId);
    const meta = this.producerMeta.get(producerId);
    if (!consumer || !meta) return;

    consumer.close();
    this.consumers.delete(producerId);
    this.producerMeta.delete(producerId);

    if (meta.isScreen) {
      const stream = this.remoteScreenStreams.get(meta.userId);
      stream?.removeTrack(consumer.track);
      const stillHasTracks = !!stream && stream.getTracks().length > 0;
      this.callbacks.onScreenStream(meta.userId, stillHasTracks ? stream! : null);
      if (!stillHasTracks) this.remoteScreenStreams.delete(meta.userId);
    } else {
      const stream = this.remoteAudioStreams.get(meta.userId);
      stream?.removeTrack(consumer.track);
      this.callbacks.onAudioStream(meta.userId, stream ?? null);
    }
  };

  private handlePeerLeft = ({ userId }: { userId: string }) => {
    this.knownUserIds.delete(userId);
    this.remoteAudioStreams.delete(userId);
    this.remoteScreenStreams.delete(userId);
  };

  async produceMic(track: MediaStreamTrack) {
    if (!this.sendTransport) return;
    this.micProducer = await this.sendTransport.produce({ track, appData: { type: "mic" } satisfies ProducerAppData });
  }

  setMicEnabled(enabled: boolean) {
    if (!this.micProducer) return;
    if (enabled) void this.micProducer.resume();
    else void this.micProducer.pause();
  }

  async startScreenShare(screenStream: MediaStream) {
    if (!this.sendTransport) return;

    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack) {
      this.screenVideoProducer = await this.sendTransport.produce({
        track: videoTrack,
        // 1080p is the capture resolution requested in useVoiceChannel.ts — this cap no
        // longer multiplies by viewer count the way the old mesh sender did, since the SFU
        // only ever receives ONE copy of this stream regardless of how many people watch.
        encodings: [{ maxBitrate: 4_000_000 }],
        appData: { type: "screen-video" } satisfies ProducerAppData,
      });
    }

    const audioTrack = screenStream.getAudioTracks()[0];
    if (audioTrack) {
      this.screenAudioProducer = await this.sendTransport.produce({
        track: audioTrack,
        appData: { type: "screen-audio" } satisfies ProducerAppData,
      });
    }
  }

  stopScreenShare() {
    for (const producer of [this.screenVideoProducer, this.screenAudioProducer]) {
      if (!producer) continue;
      this.socket.emit("sfu:close-producer", { roomId: this.roomId, producerId: producer.id });
      producer.close();
    }
    this.screenVideoProducer = null;
    this.screenAudioProducer = null;
  }

  private async pollStats() {
    if (!this.recvTransport) return;
    try {
      const report = await this.recvTransport.getStats();
      let rttMs: number | null = null;
      report.forEach((stat: any) => {
        if (stat.type === "candidate-pair" && stat.state === "succeeded" && typeof stat.currentRoundTripTime === "number") {
          rttMs = stat.currentRoundTripTime * 1000;
        }
      });

      // One shared link to the SFU, not one per peer — so every currently-consumed peer
      // reports the same number. Less granular than the old mesh's per-peer stats, but more
      // honest: in an SFU there genuinely is only one connection to reason about.
      let quality: ConnectionQuality = "unknown";
      if (rttMs !== null) {
        quality = rttMs > 300 ? "poor" : rttMs > 150 ? "medium" : "good";
      }

      for (const userId of this.knownUserIds) {
        this.callbacks.onPeerQualityChange?.(userId, quality, rttMs === null ? null : Math.round(rttMs));
      }
      this.callbacks.onQualityChange?.(quality);
    } catch (err) {
      console.error("Failed to read SFU connection stats", err);
    }
  }

  leave() {
    this.socket.emit("sfu:leave", { roomId: this.roomId });
    this.socket.off("sfu:new-producer", this.handleNewProducer);
    this.socket.off("sfu:producer-closed", this.handleProducerClosed);
    this.socket.off("sfu:peer-left", this.handlePeerLeft);

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
    this.device = null;
    this.micProducer = null;
    this.screenVideoProducer = null;
    this.screenAudioProducer = null;
    this.consumers.clear();
    this.producerMeta.clear();
    this.remoteAudioStreams.clear();
    this.remoteScreenStreams.clear();
    this.knownUserIds.clear();
    this.roomId = null;
  }
}
