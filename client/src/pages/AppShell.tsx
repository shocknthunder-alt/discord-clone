import { SocketEvents, type ChannelActivityPayload, type SoundboardPlayedPayload, type VoicePeerInfo } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { fetchChannels } from "../api/channels.api";
import { fetchCustomEmojis, fetchServers } from "../api/servers.api";
import ChannelList from "../components/ChannelList";
import DmChatView from "../components/DmChatView";
import DmListPanel from "../components/DmListPanel";
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
import { notifyDesktop } from "../utils/appPrefs";
import { playSoundboardClip } from "../utils/soundboardPlayer";

export default function AppShell() {
  const token = useAuthStore((s) => s.token);
  const { activeServerId, activeTextChannelId, setServers, setChannels, setUserOnline } = useServerStore();
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const { view, activeConversationId, setIncomingRing } = useDmStore();
  const [viewMode, setViewMode] = useState<"text" | "voice">("text");

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
