import { useEffect, useRef, useState } from "react";
import { SocketEvents, type MentionPayload, type MessageDTO } from "@discord-clone/shared";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useVoiceStore, type RemotePeer } from "../store/voiceStore";
import { useAppPrefs } from "../utils/appPrefs";
import { attachmentLabel } from "../utils/attachments";
import { useSpeakingDetection } from "../webrtc/useSpeakingDetection";

/**
 * Desktop app 1.8.0+: feeds the in-game overlay (a click-through window over games) with who is
 * in our voice channel, who's talking, and new chat messages. The desktop shell only shows it
 * while our own window isn't focused. Off: Settings → Общи → Овърлей в игрите.
 */
export interface OverlayPerson {
  id: string;
  name: string;
  avatar: string | null;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  live: boolean;
}
export interface OverlayToast {
  id: string;
  author: string;
  avatar: string | null;
  text: string;
}

const TOAST_MS = 7000;

function SpeakProbe({ peer, report }: { peer: RemotePeer; report: (id: string, speaking: boolean) => void }) {
  const speaking = useSpeakingDetection(peer.audioStream, !peer.isMuted);
  useEffect(() => report(peer.socketId, speaking), [peer.socketId, speaking, report]);
  useEffect(() => () => report(peer.socketId, false), [peer.socketId, report]);
  return null;
}

export default function DesktopOverlayFeed() {
  const overlay = window.shmirkaDesktop?.overlay;
  if (!overlay) return null;
  return <Feed update={overlay.update} />;
}

function Feed({ update }: { update: (state: unknown) => void }) {
  const enabled = useAppPrefs((s) => s.gameOverlay);
  const corner = useAppPrefs((s) => s.overlayCorner);
  const withMessages = useAppPrefs((s) => s.overlayMessages);
  const me = useAuthStore((s) => s.user);
  const channelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const peers = useVoiceStore((s) => s.peers);
  const localStream = useVoiceStore((s) => s.localStream);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isSharing = useVoiceStore((s) => s.isScreenSharing);
  const selfSpeaking = useSpeakingDetection(localStream, !isMuted);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<OverlayToast[]>([]);
  const report = useRef((id: string, on: boolean) =>
    setSpeaking((s) => (!!s[id] === on ? s : { ...s, [id]: on })),
  ).current;

  // New messages (channels we have open + DMs) → short toasts.
  useEffect(() => {
    if (!enabled || !withMessages) return;
    const socket = getSocket();
    const push = (m: { id: string; authorId: string; authorUsername: string; authorAvatarUrl?: string | null; content: string; imageUrl?: string | null }) => {
      if (m.authorId === useAuthStore.getState().user?.id) return;
      const text = (m.content || attachmentLabel(m.imageUrl)).slice(0, 140);
      setToasts((t) => [...t.filter((x) => x.id !== m.id), { id: m.id, author: m.authorUsername, avatar: m.authorAvatarUrl ?? null, text }].slice(-4));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== m.id)), TOAST_MS);
    };
    const onMsg = (m: MessageDTO) => push(m);
    const onDm = (m: Parameters<typeof push>[0]) => push(m);
    // @mentions from any channel (MessageNew only covers the open one).
    const onMention = (p: MentionPayload) =>
      push({ id: p.messageId, authorId: p.authorId, authorUsername: `@ ${p.authorUsername} · #${p.channelName}`, authorAvatarUrl: p.authorAvatarUrl, content: p.content });
    socket?.on(SocketEvents.MentionNew, onMention);
    socket?.on(SocketEvents.MessageNew, onMsg);
    socket?.on(SocketEvents.DmNew, onDm);
    return () => {
      socket?.off(SocketEvents.MentionNew, onMention);
      socket?.off(SocketEvents.MessageNew, onMsg);
      socket?.off(SocketEvents.DmNew, onDm);
    };
  }, [enabled, withMessages]);

  // Send the picture (throttled a little — speaking flips often).
  const last = useRef("");
  useEffect(() => {
    const people: OverlayPerson[] = [];
    if (channelId && me) {
      people.push({ id: "me", name: me.username, avatar: me.avatarUrl ?? null, speaking: selfSpeaking, muted: isMuted, deafened: isDeafened, live: isSharing });
      for (const p of peers.values()) {
        people.push({
          id: p.socketId,
          name: p.username,
          avatar: p.avatarUrl,
          speaking: !!speaking[p.socketId],
          muted: p.isMuted,
          deafened: p.isDeafened,
          live: p.isScreenSharing,
        });
      }
    }
    const state = { enabled, corner, people, toasts };
    const json = JSON.stringify(state);
    if (json === last.current) return;
    const t = setTimeout(() => {
      last.current = json;
      update(state);
    }, 60);
    return () => clearTimeout(t);
  }, [enabled, corner, channelId, me, peers, speaking, selfSpeaking, isMuted, isDeafened, isSharing, toasts, update]);

  // Hide it when the page goes away (reload/close).
  useEffect(() => () => update({ enabled: false, corner, people: [], toasts: [] }), [update, corner]);

  return (
    <>
      {channelId && [...peers.values()].map((p) => <SpeakProbe key={p.socketId} peer={p} report={report} />)}
    </>
  );
}
