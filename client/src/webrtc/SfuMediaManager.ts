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
      // One bad entry (previously: any rejection here, awaited in-loop with no catch,
      // aborted the whole join() — a single stale/invalid producer silently prevented
      // consuming every producer listed after it, including other peers' live audio) must
      // not block the rest.
      try {
        await this.consume(producer.producerId, producer.userId, producer.appData);
      } catch (err) {
        console.error(`[sfu] failed to consume initial ${producer.kind} producer from ${producer.userId}`, err);
      }
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
    // Was previously fire-and-forget (`void`) with no catch — any failure here (a rejected
    // ack, a canConsume() mismatch, a transport in a bad state) vanished as a silent
    // unhandled rejection, which is exactly indistinguishable from "it just didn't arrive"
    // from the outside. Logged now so a repeat is actually diagnosable.
    this.consume(payload.producerId, payload.userId, payload.appData).catch((err) => {
      console.error(`[sfu] failed to consume ${payload.kind} producer from ${payload.userId}`, err);
    });
  };

  private async consume(producerId: string, userId: string, appData: ProducerAppData) {
    if (!this.device || !this.recvTransport) {
      console.error("[sfu] consume() called before device/recvTransport were ready", {
        hasDevice: !!this.device,
        hasRecvTransport: !!this.recvTransport,
      });
      return;
    }

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
    console.log(`[sfu] consuming ${kind} from ${userId}${isScreen ? " (screen)" : ""}`);

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
    if (!this.sendTransport) {
      console.error("[sfu] produceMic called with no send transport — mic will not reach anyone");
      return;
    }
    this.micProducer = await this.sendTransport.produce({ track, appData: { type: "mic" } satisfies ProducerAppData });
    console.log(`[sfu] mic producer created: ${this.micProducer.id}`);
  }

  setMicEnabled(enabled: boolean) {
    if (!this.micProducer) return;
    if (enabled) void this.micProducer.resume();
    else void this.micProducer.pause();
  }

  async startScreenShare(screenStream: MediaStream, quality: "standard" | "high" = "standard") {
    if (!this.sendTransport) return;

    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack) {
      // Hints the encoder that this is screen/text content rather than a camera, so it
      // favors sharpness over smooth motion.
      try {
        videoTrack.contentHint = "detail";
      } catch {
        // contentHint isn't supported in every browser — fine to skip.
      }

      // Simulcast: send three quality layers instead of one. Without this, every viewer
      // gets the exact same stream regardless of their own downlink — someone on a weaker
      // connection (a VPN, in one reported case) just sees packet loss and choppy
      // playback, with no fallback available. With multiple layers, mediasoup picks
      // whichever one each viewer's connection can actually sustain, automatically and
      // per-viewer, and switches as conditions change.
      //
      // Bitrates track the "standard" (1080p, safe default) vs "high" (4K, opt-in in
      // Settings) capture resolution requested in useVoiceChannel.ts — top layer = capture
      // resolution. Encoding three layers at once is real sustained CPU work on the
      // sharer's machine; "high" is there for people whose hardware can take it, not the
      // default, since tuning this for a 4K top layer unconditionally was enough to drop
      // frames at the source regardless of any viewer's network.
      const encodings: MsTypes.RtpEncodingParameters[] =
        quality === "high"
          ? [
              { scaleResolutionDownBy: 4, maxBitrate: 400_000 },
              { scaleResolutionDownBy: 2, maxBitrate: 2_000_000 },
              { scaleResolutionDownBy: 1, maxBitrate: 8_000_000 },
            ]
          : [
              { scaleResolutionDownBy: 4, maxBitrate: 300_000 },
              { scaleResolutionDownBy: 2, maxBitrate: 1_000_000 },
              { scaleResolutionDownBy: 1, maxBitrate: 4_000_000 },
            ];

      this.screenVideoProducer = await this.sendTransport.produce({
        track: videoTrack,
        encodings,
        onRtpSender: (sender) => {
          const params = sender.getParameters();
          params.degradationPreference = "maintain-resolution";
          void sender.setParameters(params).catch((err) => console.error("Failed to set screen-share encoding params", err));
        },
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
      let fallbackRttMs: number | null = null;
      report.forEach((stat: any) => {
        if (stat.type !== "candidate-pair" || typeof stat.currentRoundTripTime !== "number") return;
        // Chrome marks the active pair with state "succeeded"; Firefox instead marks it
        // via "nominated" and doesn't reliably set state to "succeeded" — checking only the
        // former left Firefox viewers stuck with no RTT (and so no quality indicator) at
        // all. Fall back to any candidate-pair with a valid RTT if neither flag is set.
        if (stat.state === "succeeded" || stat.nominated) {
          rttMs = stat.currentRoundTripTime * 1000;
        } else if (fallbackRttMs === null) {
          fallbackRttMs = stat.currentRoundTripTime * 1000;
        }
      });
      if (rttMs === null) rttMs = fallbackRttMs;

      // RTT is genuinely shared — one real link to the SFU — but packet loss on a specific
      // person's inbound audio can differ even over that same link (e.g. the SFU struggling
      // to forward just their producer), so quality is computed per peer from their own mic
      // consumer's loss ratio rather than being the same canned value for everyone.
      const baseQuality: ConnectionQuality =
        rttMs === null ? "unknown" : rttMs > 300 ? "poor" : rttMs > 150 ? "medium" : "good";

      for (const [producerId, consumer] of this.consumers) {
        const meta = this.producerMeta.get(producerId);
        if (!meta || meta.isScreen) continue;

        let peerQuality = baseQuality;
        try {
          const consumerStats = await consumer.getStats();
          consumerStats.forEach((s: any) => {
            if (s.type !== "inbound-rtp" || typeof s.packetsLost !== "number" || typeof s.packetsReceived !== "number") return;
            const total = s.packetsLost + s.packetsReceived;
            const lossRatio = total > 0 ? s.packetsLost / total : 0;
            if (lossRatio > 0.05) peerQuality = "poor";
            else if (lossRatio > 0.02 && peerQuality === "good") peerQuality = "medium";
          });
        } catch {
          // Fall back to baseQuality for this peer.
        }

        this.callbacks.onPeerQualityChange?.(meta.userId, peerQuality, rttMs === null ? null : Math.round(rttMs));
      }

      this.callbacks.onQualityChange?.(baseQuality);
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
