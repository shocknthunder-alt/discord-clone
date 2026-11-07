import { SocketEvents } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { fetchChannels } from "../api/channels.api";
import { fetchServers } from "../api/servers.api";
import ChannelList from "../components/ChannelList";
import ServerSidebar from "../components/ServerSidebar";
import TextChatView from "../components/TextChatView";
import VoiceAudioBridge from "../components/VoiceAudioBridge";
import VoiceChannelPanel from "../components/VoiceChannelPanel";
import { connectSocket, getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";

export default function AppShell() {
  const token = useAuthStore((s) => s.token);
  const { activeServerId, activeTextChannelId, setServers, setChannels, setUserOnline } = useServerStore();
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const [viewMode, setViewMode] = useState<"text" | "voice">("text");

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    socket.on(SocketEvents.PresenceUpdate, ({ userId, status }: { userId: string; status: string }) => {
      setUserOnline(userId, status === "online");
    });

    return () => {
      socket.disconnect();
    };
  }, [token, setUserOnline]);

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
      <ServerSidebar />
      <ChannelList onSelectVoice={() => setViewMode("voice")} onSelectText={() => setViewMode("text")} />
      {viewMode === "voice" && activeVoiceChannelId ? (
        <VoiceChannelPanel />
      ) : activeTextChannelId ? (
        <TextChatView channelId={activeTextChannelId} />
      ) : (
        <div className="main-content" />
      )}
    </div>
  );
}
