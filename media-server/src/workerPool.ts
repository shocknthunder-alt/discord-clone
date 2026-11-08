import os from "node:os";
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
  // One worker per CPU core — matches the 4 OCPUs on the VM. Each worker's WebRtcServer
  // binds the SAME announced port via SO_REUSEPORT (mediasoup's standard pattern for this),
  // so the firewall only ever needs that one port open regardless of worker count.
  const count = Math.max(1, os.cpus().length);

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
