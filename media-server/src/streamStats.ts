import { allRooms } from "./room.js";

/**
 * Every 5 s while someone shares their screen, one log line per stream (journalctl -u
 * shmirka-media): what arrives from the sharer and what goes out to each viewer.
 *
 *   in   — Mbps received from the sharer, packets lost on the way IN (sharer's upload/route),
 *          NACKs (retransmit requests we sent), score 0-10 (10 = perfect)
 *   key  — key-frame requests (PLI/FIR) we forwarded to the sharer: each one makes the encoder
 *          send a huge frame, and the frames after it go mushy while the bitrate recovers
 *   out  — per viewer: Mbps sent, packets that viewer reports lost (their download/route),
 *          PLIs that viewer asked for, score
 *
 * Counters are cumulative in mediasoup; the log prints the change since the previous line.
 */
const INTERVAL_MS = 5000;

type Counters = { bytes: number; lost: number; nack: number; pli: number };
const previous = new Map<string, Counters>();

function delta(key: string, now: Counters): Counters {
  const prev = previous.get(key);
  previous.set(key, now);
  if (!prev) return { bytes: 0, lost: 0, nack: 0, pli: 0 };
  return {
    bytes: Math.max(0, now.bytes - prev.bytes),
    lost: Math.max(0, now.lost - prev.lost),
    nack: Math.max(0, now.nack - prev.nack),
    pli: Math.max(0, now.pli - prev.pli),
  };
}

const mbps = (bytes: number) => ((bytes * 8) / (INTERVAL_MS / 1000) / 1e6).toFixed(1);

async function logOnce() {
  const seen = new Set<string>();
  for (const room of allRooms()) {
    for (const sharer of room.peers.values()) {
      for (const producer of sharer.producers.values()) {
        if (producer.closed || producer.kind !== "video" || producer.appData.type !== "screen-video") continue;
        seen.add(producer.id);
        const stats = await producer.getStats().catch(() => []);
        let bytes = 0;
        let lost = 0;
        let nack = 0;
        let pli = 0;
        let score = 10;
        for (const s of stats) {
          bytes += s.byteCount ?? 0;
          lost += s.packetsLost ?? 0;
          nack += s.nackCount ?? 0;
          pli += (s.pliCount ?? 0) + (s.firCount ?? 0);
          score = Math.min(score, s.score ?? 10);
        }
        const d = delta(producer.id, { bytes, lost, nack, pli });
        const parts = [
          `[stream] room=${room.id.slice(-6)} sharer=${sharer.userId.slice(-6)}`,
          `in=${mbps(d.bytes)}Mbps lost=${d.lost} nack=${d.nack} score=${score}`,
          `key=${d.pli}`,
        ];

        for (const viewer of room.peers.values()) {
          for (const consumer of viewer.consumers.values()) {
            if (consumer.closed || consumer.producerId !== producer.id) continue;
            seen.add(consumer.id);
            const cstats = await consumer.getStats().catch(() => []);
            const out = cstats.find((s) => s.type === "outbound-rtp");
            const cd = delta(consumer.id, {
              bytes: out?.byteCount ?? 0,
              lost: out?.packetsLost ?? 0,
              nack: out?.nackCount ?? 0,
              pli: (out?.pliCount ?? 0) + (out?.firCount ?? 0),
            });
            parts.push(
              `| ${viewer.userId.slice(-6)} out=${mbps(cd.bytes)}Mbps lost=${cd.lost} nack=${cd.nack} pli=${cd.pli} score=${out?.score ?? "?"}${consumer.paused || consumer.producerPaused ? " PAUSED" : ""}`,
            );
          }
        }
        console.log(parts.join(" "));
      }
    }
  }
  for (const key of previous.keys()) if (!seen.has(key)) previous.delete(key);
}

export function startStreamStatsLogger() {
  setInterval(() => {
    logOnce().catch((err) => console.error("stream stats failed", err));
  }, INTERVAL_MS);
}
