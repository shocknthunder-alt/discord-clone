import * as mediasoup from "mediasoup";
import { env } from "./env.js";
import { webRtcServerListenInfos, workerSettings } from "./mediasoupConfig.js";

interface WorkerHandle {
  worker: mediasoup.types.Worker;
  webRtcServer: mediasoup.types.WebRtcServer;
}

const workers: WorkerHandle[] = [];
let nextWorkerIndex = 0;

export async function initWorkerPool(): Promise<void> {
  // A single worker, deliberately: each worker's WebRtcServer needs its own UDP/TCP port
  // (mediasoup does NOT share one port across workers via SO_REUSEPORT the way per-worker
  // rtcMinPort/rtcMaxPort ranges can), and one open port is what the firewall is configured
  // for. An SFU that only forwards RTP (no transcoding) is light enough that one worker
  // comfortably handles a 10-person voice/video channel — this isn't the bottleneck to
  // reach for first. Bumping to N workers later means opening N ports instead of one.
  const count = 1;

  for (let i = 0; i < count; i++) {
    const worker = await mediasoup.createWorker(workerSettings);
    worker.on("died", () => {
      console.error(`mediasoup worker ${worker.pid} died — exiting so the process manager restarts us`);
      process.exit(1);
    });

    const webRtcServer = await worker.createWebRtcServer({
      listenInfos: webRtcServerListenInfos(env.ANNOUNCED_IP, env.MEDIA_PORT),
    });

    workers.push({ worker, webRtcServer });
  }

  console.log(`mediasoup: ${count} worker(s) ready, media port ${env.MEDIA_PORT}`);
}

export function getNextWorker(): WorkerHandle {
  const handle = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return handle;
}
