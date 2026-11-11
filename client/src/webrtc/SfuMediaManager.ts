import { Device, type types as MsTypes } from "mediasoup-client";
import type { Socket } from "socket.io-client";

export type ConnectionQuality = "good" | "medium" | "poor" | "unknown";

interface ProducerAppData {
  type: "mic" | "screen-video" | "screen-audio" | "camera";
  userId?: string;
}

interface ProducerMeta {
  userId: string;
  isScreen: boolean;
  isCamera: boolean;
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
  onCameraStream: (userId: string, stream: MediaStream | null) => void;
  onQualityChange?: (quality: ConnectionQuality) => void;
  /** Quality of what this peer sends us, judged by packet loss only. Their ping comes from their own report. */
  onPeerQualityChange?: (userId: string, lossQuality: ConnectionQuality) => void;
  /** This client's own round-trip time to the SFU. */
  onLocalRtt?: (rttMs: number | null) => void;
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
  private cameraProducer: MsTypes.Producer | null = null;

  private consumers = new Map<string, MsTypes.Consumer>(); // producerId -> consumer
  private producerMeta = new Map<string, ProducerMeta>(); // producerId -> meta
  private remoteAudioStreams = new Map<string, MediaStream>(); // userId -> stream
  private remoteScreenStreams = new Map<string, MediaStream>(); // userId -> stream
  private remoteCameraStreams = new Map<string, MediaStream>(); // userId -> stream

  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private knownUserIds = new Set<string>();
  private screenAdaptTimer: ReturnType<typeof setInterval> | null = null;

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
    const isCamera = appData.type === "camera";
    this.producerMeta.set(producerId, { userId, isScreen, isCamera });

    await this.request("sfu:resume-consumer", { consumerId: consumer.id });
    console.log(`[sfu] consuming ${kind} from ${userId}${isScreen ? " (screen)" : ""}`);

    if (isCamera) {
      // A fresh stream per camera start: reusing one would keep a dead track around after a
      // quick off/on, and the <video> would show a frozen last frame.
      const stream = new MediaStream([consumer.track]);
      this.remoteCameraStreams.set(userId, stream);
      this.callbacks.onCameraStream(userId, stream);
    } else if (isScreen) {
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

    if (meta.isCamera) {
      this.remoteCameraStreams.delete(meta.userId);
      this.callbacks.onCameraStream(meta.userId, null);
    } else if (meta.isScreen) {
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
    this.remoteCameraStreams.delete(userId);
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

  async startScreenShare(
    screenStream: MediaStream,
    quality: "low" | "standard" | "high" = "standard",
    mode: "smooth" | "sharp" = "smooth",
    simulcast = false,
  ) {
    if (!this.sendTransport) return;

    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack) {
      const smooth = mode === "smooth";
      // The content hint decides which encoder mode Chrome uses. "detail" switches it to
      // *screencast* mode, which caps the frame rate hard and sits on whatever it can sharpen —
      // great for slides, awful for a game or a clip (that was the low-FPS, smeary picture).
      // "motion" keeps the normal video pipeline: full frame rate, sharpness traded for speed.
      try {
        videoTrack.contentHint = smooth ? "motion" : "detail";
      } catch {
        // contentHint isn't supported in every browser — fine to skip.
      }

      // ONE layer, not three. The old three-layer simulcast meant the sharer's machine encoded
      // 1080p three times per frame — with a game already eating the CPU/GPU that is exactly
      // what dropped the frame rate at the source. A friend-group call doesn't need per-viewer
      // layers, it needs one good stream.
      const maxBitrate =
        quality === "high"
          ? smooth ? 32_000_000 : 25_000_000
          : quality === "low"
            ? smooth ? 4_500_000 : 3_000_000
            : smooth ? 8_000_000 : 5_000_000;
      const maxFramerate = smooth ? 60 : 30;

      // H.264 gets hardware-encoded by the GPU (NVENC / Quick Sync / AMF), so 1080p60 costs almost
      // no CPU — but only if the SFU's router offers it (media-server mediaCodecs). Otherwise VP8.
      const h264 = smooth
        ? this.device?.rtpCapabilities.codecs?.find((c) => c.mimeType.toLowerCase() === "video/h264")
        : undefined;

      this.screenVideoProducer = await this.sendTransport.produce({
        track: videoTrack,
        // Opt-in simulcast: a half-size, much lighter copy first (lowest layer first), so a viewer
        // on a weak link degrades to it instead of stuttering. Costs the sharer extra encoding.
        encodings: simulcast
          ? [
              { scaleResolutionDownBy: 2, maxBitrate: Math.round(maxBitrate / 5), maxFramerate },
              { scaleResolutionDownBy: 1, maxBitrate, maxFramerate },
            ]
          : [{ maxBitrate, maxFramerate }],
        ...(h264 ? { codec: h264 } : {}),
        // Start near the target instead of ramping from a trickle (the blurry first seconds).
        codecOptions: { videoGoogleStartBitrate: Math.round(maxBitrate / 2000) },
        onRtpSender: (sender) => {
          const params = sender.getParameters();
          // Smooth: when the machine or the link is short on something, shed resolution, not
          // frames. Sharp: the opposite.
          params.degradationPreference = smooth ? "maintain-framerate" : "maintain-resolution";
          void sender.setParameters(params).catch((err) => console.error("Failed to set screen-share encoding params", err));
        },
        appData: { type: "screen-video" } satisfies ProducerAppData,
      });
    }

    this.startScreenBitrateAdaptation();

    const audioTrack = screenStream.getAudioTracks()[0];
    if (audioTrack) {
      this.screenAudioProducer = await this.sendTransport.produce({
        track: audioTrack,
        appData: { type: "screen-audio" } satisfies ProducerAppData,
      });
    }
  }

  /**
   * Keeps the stream from outrunning the sharer's real upload. A fixed 32 Mbps cap on a link that
   * can only carry 20 just fills the router's queue — and the voice, which shares that link, starts
   * to stutter. Every few seconds the cap follows ~85% of the browser's own bandwidth estimate
   * (never below 30% of the chosen maximum), and creeps back up when there is room.
   */
  private startScreenBitrateAdaptation() {
    this.stopScreenBitrateAdaptation();
    const producer = this.screenVideoProducer;
    const sender = producer?.rtpSender;
    if (!producer || !sender) return;
    const baseParams = sender.getParameters();
    const baseRates = (baseParams.encodings ?? []).map((e) => e.maxBitrate ?? 0);
    const topRate = Math.max(0, ...baseRates);
    if (topRate <= 0) return;
    const floor = topRate * 0.3;
    let cap = topRate;
    let lowStreak = 0;
    const startedAt = Date.now();

    this.screenAdaptTimer = setInterval(() => {
      void (async () => {
        if (producer.closed || !this.sendTransport || Date.now() - startedAt < 12_000) return; // let the estimate warm up
        let available: number | null = null;
        const report = await this.sendTransport.getStats();
        report.forEach((stat: any) => {
          if (stat.type !== "candidate-pair" || !(stat.state === "succeeded" || stat.nominated)) return;
          if (typeof stat.availableOutgoingBitrate === "number") available = stat.availableOutgoingBitrate;
        });
        if (available === null) return;
        const target = available * 0.85;
        let next = cap;
        if (target < cap * 0.9) {
          lowStreak++;
          if (lowStreak >= 2) next = Math.max(floor, target); // two readings in a row, not a blip
        } else {
          lowStreak = 0;
          if (target > cap * 1.25 && cap < topRate) next = Math.min(topRate, cap * 1.25);
        }
        if (Math.abs(next - cap) < cap * 0.05) return;
        cap = next;
        const params = sender.getParameters();
        params.encodings?.forEach((enc, i) => {
          enc.maxBitrate = Math.round(((baseRates[i] ?? topRate) * cap) / topRate);
        });
        await sender.setParameters(params).catch((err) => console.warn("screen bitrate adapt failed", err));
      })().catch(() => {});
    }, 3000);
  }

  private stopScreenBitrateAdaptation() {
    if (this.screenAdaptTimer) clearInterval(this.screenAdaptTimer);
    this.screenAdaptTimer = null;
  }

  private lastScreenStats: { at: number; bytes: number } | null = null;

  /** What the browser is actually doing with the outgoing screen share (fps, size, bitrate, codec, limit). */
  async getScreenStats(): Promise<ScreenShareStats | null> {
    const producer = this.screenVideoProducer;
    if (!producer || producer.closed) {
      this.lastScreenStats = null;
      return null;
    }
    const report = await producer.getStats();
    let outbound: Record<string, unknown> | null = null;
    const codecs = new Map<string, string>();
    report.forEach((stat: Record<string, unknown>) => {
      if (stat.type === "codec" && typeof stat.id === "string") codecs.set(stat.id, String(stat.mimeType ?? ""));
      if (stat.type === "outbound-rtp" && stat.kind === "video") {
        // With simulcast there are several; report the biggest.
        if (!outbound || Number(stat.frameWidth ?? 0) >= Number(outbound.frameWidth ?? 0)) outbound = stat;
      }
    });
    if (!outbound) return null;
    const o = outbound as Record<string, unknown>;
    // Bitrate = bytes sent since the previous poll (all layers).
    let totalBytes = 0;
    report.forEach((stat: Record<string, unknown>) => {
      if (stat.type === "outbound-rtp" && stat.kind === "video") totalBytes += Number(stat.bytesSent ?? 0);
    });
    const now = performance.now();
    const prev = this.lastScreenStats;
    this.lastScreenStats = { at: now, bytes: totalBytes };
    const kbps = prev && now > prev.at ? ((totalBytes - prev.bytes) * 8) / (now - prev.at) : 0;
    const encoder = String(o.encoderImplementation ?? "");
    return {
      fps: Math.round(Number(o.framesPerSecond ?? 0)),
      width: Number(o.frameWidth ?? 0),
      height: Number(o.frameHeight ?? 0),
      kbps: Math.round(kbps),
      codec: (codecs.get(String(o.codecId ?? "")) ?? "").replace("video/", ""),
      encoder,
      hardware: o.powerEfficientEncoder === true || /nvenc|mediafoundation|mft|videotoolbox|vaapi|hardware|externalencoder/i.test(encoder),
      limitation: String(o.qualityLimitationReason ?? "none") as ScreenShareStats["limitation"],
      audio: !!this.screenAudioProducer && !this.screenAudioProducer.closed && this.screenAudioProducer.track?.readyState === "live",
    };
  }

  async startCamera(track: MediaStreamTrack) {
    if (!this.sendTransport || this.cameraProducer) return;
    try {
      // Motion matters more than sharpness for a face.
      track.contentHint = "motion";
    } catch {
      // not supported everywhere
    }
    this.cameraProducer = await this.sendTransport.produce({
      track,
      encodings: [
        { scaleResolutionDownBy: 2, maxBitrate: 250_000 },
        { scaleResolutionDownBy: 1, maxBitrate: 1_200_000 },
      ],
      appData: { type: "camera" } satisfies ProducerAppData,
    });
  }

  stopCamera() {
    const producer = this.cameraProducer;
    if (!producer) return;
    this.socket.emit("sfu:close-producer", { roomId: this.roomId, producerId: producer.id });
    producer.close();
    this.cameraProducer = null;
  }

  stopScreenShare() {
    this.stopScreenBitrateAdaptation();
    for (const producer of [this.screenVideoProducer, this.screenAudioProducer]) {
      if (!producer) continue;
      this.socket.emit("sfu:close-producer", { roomId: this.roomId, producerId: producer.id });
      producer.close();
    }
    this.screenVideoProducer = null;
    this.screenAudioProducer = null;
  }

  private async pollStats() {
    if (!this.recvTransport && !this.sendTransport) return;
    try {
      let rttMs: number | null = null;
      let fallbackRttMs: number | null = null;
      // Ask the receive transport first, then the send transport: alone in a channel nothing is
      // being received, so the receive side may have no RTT yet while the send side (our mic) does.
      for (const transport of [this.recvTransport, this.sendTransport]) {
        if (!transport || rttMs !== null) continue;
        const report = await transport.getStats();
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
      }

      // The RTT measured here is OUR link to the SFU — it says nothing about anyone else's, so it
      // is only reported as our own (onLocalRtt). Each peer's ping arrives in their own report.
      // Per peer, only packet loss on their inbound audio is judged from here.
      const baseQuality: ConnectionQuality =
        rttMs === null ? "unknown" : rttMs > 300 ? "poor" : rttMs > 150 ? "medium" : "good";

      for (const [producerId, consumer] of this.consumers) {
        const meta = this.producerMeta.get(producerId);
        if (!meta || meta.isScreen || meta.isCamera) continue;

        let peerQuality: ConnectionQuality = "good";
        try {
          const consumerStats = await consumer.getStats();
          consumerStats.forEach((s: any) => {
            if (s.type !== "inbound-rtp" || typeof s.packetsLost !== "number" || typeof s.packetsReceived !== "number") return;
            const total = s.packetsLost + s.packetsReceived;
            const lossRatio = total > 0 ? s.packetsLost / total : 0;
            if (lossRatio > 0.05) peerQuality = "poor";
            else if (lossRatio > 0.02) peerQuality = "medium";
          });
        } catch {
          // Fall back to baseQuality for this peer.
        }

        this.callbacks.onPeerQualityChange?.(meta.userId, peerQuality);
      }

      this.callbacks.onQualityChange?.(baseQuality);
      this.callbacks.onLocalRtt?.(rttMs === null ? null : Math.round(rttMs));
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

    this.stopScreenBitrateAdaptation();
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

export interface ScreenShareStats {
  fps: number;
  width: number;
  height: number;
  kbps: number;
  codec: string;
  encoder: string;
  hardware: boolean;
  /** Why the browser is lowering quality: "cpu" = the PC can't keep up, "bandwidth" = upload too slow. */
  limitation: "none" | "cpu" | "bandwidth" | "other";
  /** Whether the stream is carrying a live audio track. */
  audio: boolean;
}
