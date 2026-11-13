import { useEffect } from "react";
import { eventEndMs, type ServerEventDTO } from "@discord-clone/shared";
import { useAuthStore } from "../store/authStore";
import { useEventsStore } from "../store/eventsStore";
import { getAppPrefs, notifyDesktop } from "../utils/appPrefs";

/**
 * Personal reminders for events you signed up for (✅ / 🤔): N minutes before (your setting) and
 * when it starts. Runs in the app, so if you open it while an event is already going you still
 * get the "it started" toast once. What was already shown is remembered per device.
 */
const KEY = "eventRemindersShown";

function loadShown(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveShown(shown: Record<string, number>) {
  // Forget entries older than a week, so this never grows without limit.
  const cutoff = Date.now() - 7 * 24 * 3600_000;
  const kept = Object.fromEntries(Object.entries(shown).filter(([, t]) => t > cutoff));
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // not fatal
  }
}

/** Short two-note chime (no file needed). */
export function playEventChime() {
  try {
    const ctx = new AudioContext();
    const t0 = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const at = t0 + i * 0.16;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.65);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // audio blocked until the user interacts — the toast is still shown
  }
}

function placeOf(e: ServerEventDTO) {
  return e.location ? ` · 📍 ${e.location}` : "";
}

function check() {
  const prefs = getAppPrefs();
  if (!prefs.eventReminders) return;
  const me = useAuthStore.getState().user?.id;
  if (!me) return;
  const { events, pushToast } = useEventsStore.getState();
  const now = Date.now();
  const shown = loadShown();
  let changed = false;

  for (const e of events) {
    const mine = e.rsvps.find((r) => r.userId === me);
    if (!mine || mine.status === "no") continue;
    const start = Date.parse(e.startsAt);
    const end = eventEndMs(e);
    const lead = prefs.eventReminderMinutes * 60_000;
    const preKey = `${e.id}@${e.startsAt}:pre`;
    const startKey = `${e.id}@${e.startsAt}:start`;
    const time = new Date(start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: !prefs.clock24h });

    if (now >= start && now < end) {
      if (!shown[startKey]) {
        shown[startKey] = shown[preKey] = now;
        changed = true;
        const late = now - start > 5 * 60_000;
        const text = late ? `Започна в ${time}${placeOf(e)}` : `Започва сега!${placeOf(e)}`;
        pushToast({ kind: "started", eventId: e.id, title: e.title, text, imageUrl: e.imageUrl, voiceChannelId: e.voiceChannelId, serverId: e.serverId });
        notifyDesktop(`🔴 ${e.title}`, text, e.imageUrl);
        playEventChime();
      }
    } else if (now >= start - lead && now < start && !shown[preKey]) {
      shown[preKey] = now;
      changed = true;
      const mins = Math.max(1, Math.round((start - now) / 60_000));
      const text = `Започва след ${mins} мин (${time})${placeOf(e)}`;
      pushToast({ kind: "reminder", eventId: e.id, title: e.title, text, imageUrl: e.imageUrl, voiceChannelId: e.voiceChannelId, serverId: e.serverId });
      notifyDesktop(`⏰ ${e.title}`, text, e.imageUrl);
      playEventChime();
    }
  }
  if (changed) saveShown(shown);
}

export function useEventReminders() {
  useEffect(() => {
    const id = setInterval(check, 15_000);
    // Also right after the events arrive / change.
    const unsub = useEventsStore.subscribe((s, prev) => {
      if (s.events !== prev.events) check();
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);
}
