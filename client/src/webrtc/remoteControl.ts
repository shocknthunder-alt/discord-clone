import { SocketEvents, type ControlInputEvent } from "@discord-clone/shared";
import type { Socket } from "socket.io-client";
import { create } from "zustand";
import { getSocket } from "../socket/socket";
import { useVoiceStore } from "../store/voiceStore";

/**
 * Remote control of a streamer's PC (ticket 001).
 *  viewer:   "🖱 Поискай контрол" → the streamer is asked → if allowed, the viewer's mouse/keys over
 *            that stream are sent to them.
 *  streamer: answers the prompt; their desktop app (1.7.0+) moves the mouse/presses the keys and
 *            shows a red "X управлява · Спри" bar (Ctrl+Alt+Esc, or moving your own mouse, stops it).
 * Everything goes through the main server, only between two people in the same voice channel.
 */

interface ControlState {
  /** Viewer: asked this streamer (userId), waiting for the answer. */
  requesting: string | null;
  /** Viewer: currently controlling this streamer (userId). */
  controlling: string | null;
  /** Streamer: someone asking right now. */
  incoming: { userId: string; username: string } | null;
  /** Streamer: who controls this PC now. */
  controlledBy: { userId: string; username: string } | null;
  notice: string | null;
}

export const useControlStore = create<ControlState>(() => ({
  requesting: null,
  controlling: null,
  incoming: null,
  controlledBy: null,
  notice: null,
}));

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function notice(text: string | null) {
  useControlStore.setState({ notice: text });
  if (noticeTimer) clearTimeout(noticeTimer);
  if (text) noticeTimer = setTimeout(() => useControlStore.setState({ notice: null }), 7000);
}

const REASONS: Record<string, string> = {
  denied: "отказа контрола.",
  timeout: "не отговори.",
  unsupported: "не може да бъде управляван — трябва да стриймва от десктоп приложението (1.7.0+).",
  "not-sharing": "вече не стриймва.",
  busy: "вече е управляван от някой друг.",
};

/** Whether THIS app can be controlled (desktop 1.7.0+). */
export function canBeControlled(): boolean {
  return !!window.shmirkaDesktop?.remoteControl;
}

// ─────────────── viewer side ───────────────
let requestTimer: ReturnType<typeof setTimeout> | null = null;

export function requestControl(streamerUserId: string) {
  const s = useControlStore.getState();
  if (s.requesting || s.controlling) return;
  useControlStore.setState({ requesting: streamerUserId });
  notice("Изчакваме стриймъра да разреши…");
  getSocket()?.emit(SocketEvents.ControlRequest, { toUserId: streamerUserId });
  if (requestTimer) clearTimeout(requestTimer);
  // Older apps / browser streamers never answer at all.
  requestTimer = setTimeout(() => {
    if (useControlStore.getState().requesting !== streamerUserId) return;
    useControlStore.setState({ requesting: null });
    notice("Няма отговор — стриймърът трябва да е в десктоп приложението (1.7.0+) и да натисне „Разреши“.");
  }, 40_000);
}

export function cancelControl() {
  const { requesting, controlling } = useControlStore.getState();
  const to = controlling ?? requesting;
  if (to) getSocket()?.emit(SocketEvents.ControlStop, { toUserId: to, reason: "viewer" });
  useControlStore.setState({ requesting: null, controlling: null });
  notice(null);
}

let lastMoveAt = 0;
let pendingMove: ControlInputEvent | null = null;
let moveTimer: ReturnType<typeof setTimeout> | null = null;
/** Viewer: one input to the streamer we control (mouse moves are capped at ~40 per second). */
export function sendControlInput(ev: ControlInputEvent) {
  const to = useControlStore.getState().controlling;
  const socket = getSocket();
  if (!to || !socket) return;
  if (ev.t === "move") {
    const wait = 25 - (Date.now() - lastMoveAt);
    if (wait > 0) {
      pendingMove = ev;
      moveTimer ??= setTimeout(() => {
        moveTimer = null;
        if (pendingMove) sendControlInput(pendingMove);
        pendingMove = null;
      }, wait);
      return;
    }
    lastMoveAt = Date.now();
  }
  socket.emit(SocketEvents.ControlInput, { toUserId: to, ev });
}

// ─────────────── streamer side ───────────────
let incomingTimer: ReturnType<typeof setTimeout> | null = null;
let stoppedUnsub: (() => void) | null = null;

function answer(toUserId: string, granted: boolean, reason?: string) {
  getSocket()?.emit(SocketEvents.ControlResponse, { toUserId, granted, ...(reason ? { reason } : {}) });
}

export async function allowControl() {
  const s = useControlStore.getState();
  const who = s.incoming;
  const rc = window.shmirkaDesktop?.remoteControl;
  if (!who) return;
  if (incomingTimer) clearTimeout(incomingTimer);
  useControlStore.setState({ incoming: null });
  if (!rc || !useVoiceStore.getState().isScreenSharing) {
    answer(who.userId, false, rc ? "not-sharing" : "unsupported");
    return;
  }
  try {
    await rc.start(who.username);
  } catch {
    answer(who.userId, false, "unsupported");
    return;
  }
  stoppedUnsub?.();
  stoppedUnsub = rc.onStopped(() => {
    // Ended here (Спри / Ctrl+Alt+Esc / own mouse / reload): tell the controller.
    const cur = useControlStore.getState().controlledBy;
    if (cur) getSocket()?.emit(SocketEvents.ControlStop, { toUserId: cur.userId, reason: "streamer" });
    useControlStore.setState({ controlledBy: null });
    stoppedUnsub?.();
    stoppedUnsub = null;
  });
  useControlStore.setState({ controlledBy: who });
  answer(who.userId, true);
}

export function denyControl() {
  const who = useControlStore.getState().incoming;
  if (incomingTimer) clearTimeout(incomingTimer);
  useControlStore.setState({ incoming: null });
  if (who) answer(who.userId, false, "denied");
}

/** Streamer: take control back. */
export function revokeControl() {
  const cur = useControlStore.getState().controlledBy;
  window.shmirkaDesktop?.remoteControl?.stop(); // → onStopped tells the controller
  if (cur && !window.shmirkaDesktop?.remoteControl) useControlStore.setState({ controlledBy: null });
}

/** Socket wiring — call once per (new) socket. */
export function registerRemoteControl(socket: Socket) {
  socket.on(SocketEvents.ControlRequested, ({ fromUserId, fromUsername }: { fromUserId: string; fromUsername: string }) => {
    const s = useControlStore.getState();
    if (!canBeControlled()) return answer(fromUserId, false, "unsupported");
    if (!useVoiceStore.getState().isScreenSharing) return answer(fromUserId, false, "not-sharing");
    if (s.controlledBy && s.controlledBy.userId !== fromUserId) return answer(fromUserId, false, "busy");
    if (s.incoming && s.incoming.userId !== fromUserId) return answer(fromUserId, false, "busy");
    useControlStore.setState({ incoming: { userId: fromUserId, username: fromUsername } });
    if (incomingTimer) clearTimeout(incomingTimer);
    incomingTimer = setTimeout(() => {
      const cur = useControlStore.getState().incoming;
      if (cur?.userId !== fromUserId) return;
      useControlStore.setState({ incoming: null });
      answer(fromUserId, false, "timeout");
    }, 30_000);
  });

  socket.on(
    SocketEvents.ControlAnswered,
    ({ fromUserId, fromUsername, granted, reason }: { fromUserId: string; fromUsername: string; granted: boolean; reason?: string }) => {
      if (useControlStore.getState().requesting !== fromUserId) return;
      if (requestTimer) clearTimeout(requestTimer);
      if (granted) {
        useControlStore.setState({ requesting: null, controlling: fromUserId });
        notice(`Управляваш компютъра на ${fromUsername}. Цъкни върху стрийма, за да пишеш с клавиатурата.`);
      } else {
        useControlStore.setState({ requesting: null });
        notice(`${fromUsername} ${REASONS[reason ?? "denied"] ?? REASONS.denied}`);
      }
    },
  );

  socket.on(SocketEvents.ControlInputIn, ({ fromUserId, ev }: { fromUserId: string; ev: ControlInputEvent }) => {
    // Only the one person the streamer allowed.
    if (useControlStore.getState().controlledBy?.userId !== fromUserId) return;
    window.shmirkaDesktop?.remoteControl?.input(ev);
  });

  socket.on(SocketEvents.ControlStopped, ({ fromUserId, fromUsername }: { fromUserId: string; fromUsername: string }) => {
    const s = useControlStore.getState();
    if (s.controlledBy?.userId === fromUserId) {
      window.shmirkaDesktop?.remoteControl?.stop();
      useControlStore.setState({ controlledBy: null });
    }
    if (s.incoming?.userId === fromUserId) useControlStore.setState({ incoming: null });
    if (s.controlling === fromUserId || s.requesting === fromUserId) {
      useControlStore.setState({ controlling: null, requesting: null });
      notice(`${fromUsername} спря контрола.`);
    }
  });
}

// Stream ended / left the call → control ends on both sides.
useVoiceStore.subscribe((v, prev) => {
  const s = useControlStore.getState();
  if (s.controlledBy && prev.isScreenSharing && !v.isScreenSharing) revokeControl();
  if (!v.activeVoiceChannelId && prev.activeVoiceChannelId) {
    if (s.controlledBy) revokeControl();
    if (s.controlling || s.requesting) cancelControl();
    if (s.incoming) denyControl();
    return;
  }
  // The person we control stopped streaming / left.
  if (s.controlling) {
    const still = Array.from(v.peers.values()).some((p) => p.userId === s.controlling && p.isScreenSharing);
    if (!still) cancelControl();
  }
});
