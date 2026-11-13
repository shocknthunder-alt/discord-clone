import { useEffect, useState } from "react";
import { useVoiceStore } from "../store/voiceStore";

const CHECK_EVERY_MS = 60_000;

/**
 * Tells people a new version has been deployed. Polls /version.json (cheap, never cached) and
 * compares it with the id baked into this bundle. A person who isn't in a voice channel and has
 * the tab in the background is refreshed silently; everyone else gets a banner, because a reload
 * drops you out of voice and shouldn't happen mid-conversation.
 */
export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const inVoice = useVoiceStore((s) => !!s.activeVoiceChannelId);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!cancelled && id && id !== __BUILD_ID__) setUpdateReady(true);
      } catch {
        // offline or mid-deploy — try again next time
      }
    }

    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Quietly pick the new version up when it can't disturb anyone (browser only: the desktop app
  // restarts itself on "Обнови", which would pop its window up).
  useEffect(() => {
    if (!updateReady || inVoice || window.shmirkaDesktop) return;
    if (document.hidden) {
      window.location.reload();
      return;
    }
    const onHidden = () => {
      if (document.hidden && !useVoiceStore.getState().activeVoiceChannelId) window.location.reload();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [updateReady, inVoice]);

  if (!updateReady || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <span>✨ Има нова версия на ШмиркаТа{inVoice ? " (презареждането ще те изключи от войс канала)" : ""}.</span>
      <button
        className="update-now"
        onClick={() => {
          // Desktop app: restart the whole app (a page reload left it broken); older shells reload.
          if (window.shmirkaDesktop?.relaunch) window.shmirkaDesktop.relaunch();
          else window.location.reload();
        }}
      >
        Обнови
      </button>
      <button className="update-later" onClick={() => setDismissed(true)} aria-label="По-късно">
        ✕
      </button>
    </div>
  );
}
