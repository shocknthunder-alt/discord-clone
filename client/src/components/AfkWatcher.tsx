import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tr } from "../i18n";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { useWatchStore } from "../store/watchStore";
import { useSpeakingDetection } from "../webrtc/useSpeakingDetection";

/**
 * AFK channel (Server Settings → Общи): someone in a voice channel who hasn't talked (or touched the
 * app) for the server's timeout is moved to its AFK channel, deafened. Anyone entering the AFK
 * channel is deafened too; leaving it (joining any other channel) un-deafens as usual.
 * Not moved while streaming, on camera or watching a stream. Runs in each person's own client.
 */
export default function AfkWatcher({
  join,
  leave,
  deafen,
}: {
  join: (voiceChannelId: string) => Promise<void>;
  leave: () => void;
  deafen: () => void;
}) {
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const localStream = useVoiceStore((s) => s.localStream);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const speaking = useSpeakingDetection(localStream, !isMuted);
  const lastActive = useRef(Date.now());
  // Server of the channel we're in — the store only lists the channels of the server on screen,
  // so remember it at the moment of joining.
  const serverOfChannel = useRef<{ channelId: string; serverId: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (activeVoiceChannelId && serverOfChannel.current?.channelId !== activeVoiceChannelId) {
    const vc = useServerStore.getState().voiceChannels.find((v) => v.id === activeVoiceChannelId);
    serverOfChannel.current = vc ? { channelId: vc.id, serverId: vc.serverId } : null;
  }

  // Joining a channel counts as activity.
  useEffect(() => {
    lastActive.current = Date.now();
  }, [activeVoiceChannelId]);

  useEffect(() => {
    if (speaking) lastActive.current = Date.now();
  }, [speaking]);

  // Keyboard/mouse in the app counts as being here.
  useEffect(() => {
    let last = 0;
    const bump = () => {
      const now = Date.now();
      if (now - last > 5000) {
        last = now;
        lastActive.current = now;
      }
    };
    const events = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    // Desktop app: keys pressed anywhere in Windows (e.g. in a game) count too — every shell
    // already forwards them for global push-to-talk.
    const offGlobal = window.shmirkaDesktop?.onGlobalKey?.(() => bump()) ?? null;
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      offGlobal?.();
    };
  }, []);

  // Entering the AFK channel (moved or by hand) → deafened.
  useEffect(() => {
    if (!activeVoiceChannelId) return;
    const sid = serverOfChannel.current?.serverId;
    const server = useServerStore.getState().servers.find((s) => s.id === sid);
    if (server?.afkChannelId && server.afkChannelId === activeVoiceChannelId) {
      // Give the join a moment to finish (the socket must know we're in the channel).
      const t = setTimeout(() => {
        const v = useVoiceStore.getState();
        if (v.activeVoiceChannelId === activeVoiceChannelId && !v.isDeafened) deafen();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [activeVoiceChannelId, deafen]);

  // The check itself, every 20 s.
  const joinRef = useRef(join);
  joinRef.current = join;
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    const id = setInterval(async () => {
      // Desktop 1.8.0+: mouse/keyboard anywhere in Windows (games included).
      const idle = window.shmirkaDesktop?.getSystemIdleSeconds;
      if (idle) {
        try {
          const lastInput = Date.now() - (await idle()) * 1000;
          if (lastInput > lastActive.current) lastActive.current = lastInput;
        } catch {
          /* older shell / IPC hiccup */
        }
      }
      const v = useVoiceStore.getState();
      const channelId = v.activeVoiceChannelId;
      if (!channelId || channelId.startsWith("dm:")) return;
      const sid = serverOfChannel.current?.serverId;
      const server = useServerStore.getState().servers.find((s) => s.id === sid);
      if (!server?.afkChannelId || server.afkChannelId === channelId) return;
      if (v.isScreenSharing || v.isCameraOn || useWatchStore.getState().watching.size > 0) {
        lastActive.current = Date.now();
        return;
      }
      const minutes = server.afkTimeoutMin ?? 20;
      if (Date.now() - lastActive.current < minutes * 60_000) return;
      const afkId = server.afkChannelId;
      lastActive.current = Date.now();
      leaveRef.current();
      void joinRef.current(afkId).then(() => {
        setNotice(
          tr(
            `💤 Преместен си в AFK канала — не си бил активен ${minutes} мин. Влез в друг канал, когато се върнеш.`,
            `💤 You were moved to the AFK channel — you were inactive for ${minutes} min. Join another channel when you're back.`,
          ),
        );
      });
    }, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 30_000);
    return () => clearTimeout(t);
  }, [notice]);

  return notice
    ? createPortal(
        <div className="rc-notice afk-notice" onClick={() => setNotice(null)}>
          {notice}
        </div>,
        document.body,
      )
    : null;
}
