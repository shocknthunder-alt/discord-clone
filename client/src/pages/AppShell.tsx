import { SocketEvents, type ChannelActivityPayload, type EventCreatedPayload, type SoundboardPlayedPayload, type VoicePeerInfo } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { fetchChannels } from "../api/channels.api";
import { fetchCustomEmojis, fetchServers } from "../api/servers.api";
import ChannelList from "../components/ChannelList";
import DmChatView from "../components/DmChatView";
import DmListPanel from "../components/DmListPanel";
import EventBoardModal from "../components/EventBoardModal";
import EventToasts from "../components/EventToasts";
import { fmtDay, fmtTime } from "../components/eventUtils";
import FloatingVoiceHud from "../components/FloatingVoiceHud";
import IncomingCallToast from "../components/IncomingCallToast";
import LiveBanner from "../components/LiveBanner";
import StreamStatsPanel from "../components/StreamStatsPanel";
import SearchModal from "../components/SearchModal";
import ServerSidebar from "../components/ServerSidebar";
import TextChatView from "../components/TextChatView";
import VoiceAudioBridge from "../components/VoiceAudioBridge";
import VoiceChannelPanel from "../components/VoiceChannelPanel";
import WelcomeScreen from "../components/WelcomeScreen";
import { connectSocket, getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import type { IncomingRing } from "../store/dmStore";
import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { useUnreadStore } from "../store/unreadStore";
import { scheduleEventsReload, useEventsStore } from "../store/eventsStore";
import { useEventReminders } from "../hooks/useEventReminders";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { notifyDesktop } from "../utils/appPrefs";
import { playSoundboardClip } from "../utils/soundboardPlayer";

export default function AppShell() {
  const token = useAuthStore((s) => s.token);
  const { activeServerId, activeTextChannelId, setServers, setChannels, setUserOnline } = useServerStore();
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const { view, activeConversationId, setIncomingRing } = useDmStore();
  const [viewMode, setViewMode] = useState<"text" | "voice">("text");
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();

  useEventReminders();

  /** "Влез" on an event: open its server and join its voice channel. */
  async function joinEventVoice(serverId: string, voiceChannelId: string) {
    useDmStore.getState().setView("servers");
    if (useServerStore.getState().activeServerId !== serverId) useServerStore.getState().setActiveServer(serverId);
    if (useVoiceStore.getState().activeVoiceChannelId !== voiceChannelId) {
      if (useVoiceStore.getState().activeVoiceChannelId) leaveVoiceChannel();
      await joinVoiceChannel(voiceChannelId);
    }
    setViewMode("voice");
  }

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    socket.on(SocketEvents.PresenceUpdate, ({ userId, status }: { userId: string; status: string }) => {
      setUserOnline(userId, status === "online");
    });

    socket.on(SocketEvents.ChannelsChanged, ({ serverId }: { serverId: string }) => {
      if (useServerStore.getState().activeServerId !== serverId) return;
      fetchChannels(serverId)
        .then(({ textChannels, voiceChannels }) => useServerStore.getState().setChannels(textChannels, voiceChannels))
        .catch(console.error);
    });

    socket.on(SocketEvents.ChannelActivity, (p: ChannelActivityPayload) => {
      useUnreadStore.getState().activity(p.textChannelId, p.createdAt, p.authorId === useAuthStore.getState().user?.id);
    });

    // Soundboard: someone in my voice channel pressed a clip — play it (stops the previous one).
    socket.on(SocketEvents.SoundboardPlayed, (p: SoundboardPlayedPayload) => {
      if (p.voiceChannelId !== useVoiceStore.getState().activeVoiceChannelId) return;
      playSoundboardClip(p.url, p.volume);
    });

    // 📅 Events: refetch on any change; a toast (+ desktop notification) for new ones.
    socket.on(SocketEvents.EventsChanged, () => scheduleEventsReload());
    socket.on(SocketEvents.EventCreated, (p: EventCreatedPayload) => {
      if (p.creatorId === useAuthStore.getState().user?.id) return;
      const text = `${p.creatorUsername} · ${fmtDay(p.startsAt)} в ${fmtTime(p.startsAt)}`;
      useEventsStore.getState().pushToast({
        kind: "new",
        eventId: p.eventId,
        title: p.title,
        text,
        imageUrl: null,
        voiceChannelId: null,
        serverId: p.serverId,
      });
      notifyDesktop(`📅 Ново събитие: ${p.title}`, text);
    });
    // After a reconnect (e.g. the server restarted) the list may have changed while we were away.
    socket.on("connect", () => scheduleEventsReload());

    socket.on(SocketEvents.DmRing, (ring: IncomingRing) => {
      setIncomingRing(ring);
    });

    socket.on(SocketEvents.DmUnread, ({ conversationId }: { conversationId: string }) => {
      const dmState = useDmStore.getState();
      const isActivelyViewing = dmState.view === "dms" && dmState.activeConversationId === conversationId;
      if (!isActivelyViewing) dmState.incrementUnread(conversationId);
      if (!isActivelyViewing || !document.hasFocus()) notifyDesktop("ШмиркаТа", "Ново лично съобщение");
    });

    socket.on(
      SocketEvents.VoiceChannelOccupants,
      ({ voiceChannelId, peers }: { voiceChannelId: string; peers: VoicePeerInfo[] }) => {
        useVoiceStore.getState().setChannelOccupants(voiceChannelId, peers);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [token, setUserOnline, setIncomingRing]);

  useEffect(() => {
    fetchServers().then(setServers).catch(console.error);
    void useEventsStore.getState().reload().catch(console.error);
    // Safety net for missed pushes (and for repeating events moving to their next date).
    const id = setInterval(() => scheduleEventsReload(), 5 * 60_000);
    return () => clearInterval(id);
  }, [setServers]);

  // Unread markers: learn each channel's newest message from the channel list…
  const textChannels = useServerStore((s) => s.textChannels);
  useEffect(() => {
    useUnreadStore.getState().setFromChannels(textChannels);
  }, [textChannels]);

  // …and whatever channel is on screen counts as read (also as new messages land in it).
  const viewingChannelId = view !== "dms" && !(viewMode === "voice" && activeVoiceChannelId) ? activeTextChannelId : null;
  const viewingLatest = useUnreadStore((s) => (viewingChannelId ? s.latest[viewingChannelId] : undefined));
  useEffect(() => {
    if (viewingChannelId) useUnreadStore.getState().markRead(viewingChannelId);
  }, [viewingChannelId, viewingLatest]);

  useEffect(() => {
    if (!activeServerId) return;
    fetchChannels(activeServerId)
      .then(({ textChannels, voiceChannels }) => setChannels(textChannels, voiceChannels))
      .catch(console.error);

    fetchCustomEmojis(activeServerId).then(useServerStore.getState().setCustomEmojis).catch(console.error);

    const socket = getSocket();
    socket?.emit(SocketEvents.ServerJoin, { serverId: activeServerId });
  }, [activeServerId, setChannels]);

  return (
    <div className="app-shell">
      <VoiceAudioBridge />
      <FloatingVoiceHud />
      <IncomingCallToast />
      <EventToasts onJoinVoice={(s, v) => void joinEventVoice(s, v)} />
      <EventBoardModal onJoinVoice={(s, v) => void joinEventVoice(s, v)} />
      <SearchModal />
      <LiveBanner />
      <StreamStatsPanel />
      <ServerSidebar />
      {view === "dms" ? (
        <>
          <DmListPanel />
          {activeConversationId ? <DmChatView conversationId={activeConversationId} /> : <WelcomeScreen />}
        </>
      ) : (
        <>
          <ChannelList onSelectVoice={() => setViewMode("voice")} onSelectText={() => setViewMode("text")} />
          {viewMode === "voice" && activeVoiceChannelId ? (
            <VoiceChannelPanel />
          ) : activeTextChannelId ? (
            <TextChatView channelId={activeTextChannelId} />
          ) : (
            <WelcomeScreen />
          )}
        </>
      )}
    </div>
  );
}
