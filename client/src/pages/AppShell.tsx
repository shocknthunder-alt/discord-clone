import { SocketEvents } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { fetchChannels } from "../api/channels.api";
import { fetchServers } from "../api/servers.api";
import ChannelList from "../components/ChannelList";
import DmChatView from "../components/DmChatView";
import DmListPanel from "../components/DmListPanel";
import FloatingVoiceHud from "../components/FloatingVoiceHud";
import IncomingCallToast from "../components/IncomingCallToast";
import ServerSidebar from "../components/ServerSidebar";
import TextChatView from "../components/TextChatView";
import VoiceAudioBridge from "../components/VoiceAudioBridge";
import VoiceChannelPanel from "../components/VoiceChannelPanel";
import { connectSocket, getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import type { IncomingRing } from "../store/dmStore";
import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";

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

    socket.on(SocketEvents.DmRing, (ring: IncomingRing) => {
      setIncomingRing(ring);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, setUserOnline, setIncomingRing]);

  useEffect(() => {
    fetchServers().then(setServers).catch(console.error);
  }, [setServers]);

  useEffect(() => {
    if (!activeServerId) return;
    fetchChannels(activeServerId)
      .then(({ textChannels, voiceChannels }) => setChannels(textChannels, voiceChannels))
      .catch(console.error);

    const socket = getSocket();
    socket?.emit(SocketEvents.ServerJoin, { serverId: activeServerId });
  }, [activeServerId, setChannels]);

  return (
    <div className="app-shell">
      <VoiceAudioBridge />
      <FloatingVoiceHud />
      <IncomingCallToast />
      <ServerSidebar />
      {view === "dms" ? (
        <>
          <DmListPanel />
          {activeConversationId ? <DmChatView conversationId={activeConversationId} /> : <div className="main-content" />}
        </>
      ) : (
        <>
          <ChannelList onSelectVoice={() => setViewMode("voice")} onSelectText={() => setViewMode("text")} />
          {viewMode === "voice" && activeVoiceChannelId ? (
            <VoiceChannelPanel />
          ) : activeTextChannelId ? (
            <TextChatView channelId={activeTextChannelId} />
          ) : (
            <div className="main-content" />
          )}
        </>
      )}
    </div>
  );
}
