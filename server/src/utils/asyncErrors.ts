import { createRequire } from "node:module";

// Express 4 ignores the promise an async route handler returns: if it rejects (a Prisma error, a race
// on a unique key, …) nothing answers the request and Node treats it as an unhandled rejection — which
// by default ends the whole process. On Render that is a restart: every socket, call and game drops.
// Found by the e2e tests (two "join by invite" requests at once → P2002 → server gone).
//
// 1) Route handlers: a rejected promise goes to `next(err)` like a thrown error does, so the error
//    handler answers 500 and the request doesn't hang. (Express 5 does this itself.)
// 2) Anything else (socket handlers, timers): logged, the server keeps running.
export function installAsyncErrorHandling() {
  const require = createRequire(import.meta.url);
  const Layer = require("express/lib/router/layer.js") as {
    prototype: { handle: (...args: unknown[]) => unknown; handle_request: (req: unknown, res: unknown, next: (err?: unknown) => void) => void };
  };
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // error-handling middleware: not for this pass
    try {
      const out = fn(req, res, next) as { catch?: (cb: (err: unknown) => void) => void } | undefined;
      if (out && typeof out.catch === "function") out.catch((err) => next(err ?? new Error("Rejected without a reason")));
    } catch (err) {
      next(err);
    }
  };

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection (server kept running):", reason);
  });
}
