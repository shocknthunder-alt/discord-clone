import { SocketEvents, hasMention, type MentionPayload, type UserActivity, type ServerDTO, type ChannelActivityPayload, type EventCreatedPayload, type VoiceMovedPayload, type SoundboardPlayedPayload, type VoicePeerInfo } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { fetchChannels } from "../api/channels.api";
import { fetchCustomEmojis, fetchServers } from "../api/servers.api";
import ChannelList from "../components/ChannelList";
import AfkWatcher from "../components/AfkWatcher";
import MusicVideoWindow from "../components/MusicVideoWindow";
import DesktopOverlayFeed from "../components/DesktopOverlayFeed";
import DmChatView from "../components/DmChatView";
import DmListPanel from "../components/DmListPanel";
import EventBoardModal from "../components/EventBoardModal";
import EventToasts from "../components/EventToasts";
import MemberListPanel from "../components/MemberListPanel";
import { useMembersStore } from "../store/membersStore";
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
import { useMentionStore } from "../store/mentionStore";
import { useStickerStore } from "../store/stickerStore";
import { isMutedHere, useMuteStore } from "../store/muteStore";
import { useChatStore } from "../store/chatStore";
import ActivityReporter from "../components/ActivityReporter";
import { getAppPrefs } from "../utils/appPrefs";
import { playMentionSound } from "../utils/voiceSounds";
import { scheduleEventsReload, useEventsStore } from "../store/eventsStore";
import { useEventReminders } from "../hooks/useEventReminders";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { rememberVoiceForRestart, takeVoiceResume } from "../webrtc/voiceResume";
import { registerRemoteControl } from "../webrtc/remoteControl";
import RemoteControlPrompt from "../components/RemoteControlPrompt";
import { hasSavedPosition } from "../utils/floatingPositions";
import { useLayoutLockStore } from "../store/layoutLockStore";

const HUD_RAIL_IDS = ["hud-network", "hud-mute", "hud-deafen", "hud-camera", "hud-screenshare", "hud-soundboard", "hud-settings", "hud-disconnect"];
import { notifyDesktop } from "../utils/appPrefs";
import { playSoundboardClip } from "../utils/soundboardPlayer";
import { tr } from "../i18n";
import MobileVoiceBar from "../components/MobileVoiceBar";
import { useIsMobile, useMobileStore } from "../store/mobileStore";
import { listenForPushTaps, reportVisibility, syncPush } from "../native/push";
import { appPlugin, nativePlugin } from "../native/native";
import { startHotkeys } from "../hotkeys/hotkeys";
import { runHotkey, type HotkeyContext } from "../hotkeys/hotkeyActions";
import HotkeyToast, { showHotkeyToast } from "../hotkeys/HotkeyToast";
import { joinPendingInvite } from "../utils/invite";

export default function AppShell() {
  const token = useAuthStore((s) => s.token);
  const { activeServerId, activeTextChannelId, setServers, setChannels, setUserOnline } = useServerStore();
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const { view, activeConversationId, setIncomingRing } = useDmStore();
  const [viewMode, setViewMode] = useState<"text" | "voice">("text");
  const voiceControls = useVoiceChannel();
  const { joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen } = voiceControls;

  // ⌨️ Hotkeys (Settings → Клавиши). The ref always holds the current functions.
  const hotkeyCtx = useRef<HotkeyContext | null>(null);
  hotkeyCtx.current = {
    toggleMute: voiceControls.toggleMute,
    toggleDeafen: voiceControls.toggleDeafen,
    toggleCamera: voiceControls.toggleCamera,
    toggleScreenShare: voiceControls.toggleScreenShare,
    leaveVoiceChannel: voiceControls.leaveVoiceChannel,
    joinVoiceChannel: voiceControls.joinVoiceChannel,
    playMusic: voiceControls.playMusic,
    pauseMusic: voiceControls.pauseMusic,
    skipMusic: voiceControls.skipMusic,
    seekMusic: voiceControls.seekMusic,
    setViewMode: (m) => setViewMode(m),
  };
  useEffect(
    () =>
      startHotkeys((t) => {
        if (hotkeyCtx.current) runHotkey(hotkeyCtx.current, t);
      }),
    [],
  );

  useEventReminders();
  // The text channel on screen (socket handlers read it to skip mentions you're looking at).
  const viewingRef = useRef<string | null>(null);

  // Socket handlers are registered once; these refs always point at the current functions.
  const leaveRef = useRef(leaveVoiceChannel);
  leaveRef.current = leaveVoiceChannel;
  const moveMeRef = useRef(async (p: VoiceMovedPayload) => {
    void p;
  });
  moveMeRef.current = async (p: VoiceMovedPayload) => {
    if (!useVoiceStore.getState().activeVoiceChannelId) return;
    leaveVoiceChannel();
    if (p.voiceChannelId) {
      await joinVoiceChannel(p.voiceChannelId);
      setViewMode("voice");
    }
  };

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

    registerRemoteControl(socket);
    const stopVisibility = reportVisibility(socket);

    socket.on(SocketEvents.PresenceUpdate, ({ userId, status }: { userId: string; status: string }) => {
      setUserOnline(userId, status === "online");
      useMembersStore.getState().setOnline(userId, status === "online");
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

    // @mentions: red number on the channel/server until I open it, plus a ding + notification.
    socket.on(SocketEvents.MentionNew, (p: MentionPayload) => {
      const viewing = viewingRef.current === p.textChannelId && document.hasFocus();
      if (viewing) return;
      // @everyone/@here in a muted channel/server stays quiet; a direct @mention still comes through.
      const direct = hasMention(p.content, useAuthStore.getState().user?.username ?? "");
      if (!direct && isMutedHere(useMuteStore.getState(), p.serverId, p.textChannelId)) return;
      useMentionStore.getState().add(p.serverId, p.textChannelId);
      playMentionSound();
      if (getAppPrefs().mentionAlerts) {
        notifyDesktop(`@ ${p.authorUsername} в #${p.channelName}`, p.content, p.authorAvatarUrl, () => {
          useDmStore.getState().setView("servers");
          if (useServerStore.getState().activeServerId !== p.serverId) useServerStore.getState().setActiveServer(p.serverId);
          useServerStore.getState().setActiveTextChannel(p.textChannelId);
          setViewMode("text");
          useChatStore.getState().setJumpTarget({ channelId: p.textChannelId, messageId: p.messageId, rootId: p.rootId });
        });
      }
    });

    socket.on(SocketEvents.StickersChanged, ({ serverId }: { serverId: string }) => {
      if (useServerStore.getState().activeServerId === serverId) void useStickerStore.getState().load(serverId);
    });

    // 🎮 What someone is playing changed.
    socket.on(SocketEvents.PresenceActivityUpdated, ({ userId, activity }: { userId: string; activity: UserActivity | null }) => {
      useMembersStore.getState().setActivity(userId, activity);
    });

    // Soundboard: someone in my voice channel pressed a clip — play it (stops the previous one).
    socket.on(SocketEvents.SoundboardPlayed, (p: SoundboardPlayedPayload) => {
      if (p.voiceChannelId !== useVoiceStore.getState().activeVoiceChannelId) return;
      playSoundboardClip(p.url, p.volume);
    });

    // Members / ranks of the open server changed.
    socket.on(SocketEvents.MembersChanged, ({ serverId }: { serverId: string }) => {
      if (useServerStore.getState().activeServerId === serverId) void useMembersStore.getState().load(serverId).catch(console.error);
    });

    // Someone with "move members" dragged me to another voice channel (or disconnected me).
    socket.on(SocketEvents.VoiceMoved, (p: VoiceMovedPayload) => {
      void moveMeRef.current(p);
    });

    // Name/icon/AFK settings of a server changed.
    socket.on(SocketEvents.ServerUpdated, ({ server }: { server: ServerDTO }) => {
      useServerStore.getState().updateServerInList(server);
    });

    // I was removed from a server.
    socket.on(SocketEvents.ServerKicked, ({ serverId }: { serverId: string }) => {
      const st = useServerStore.getState();
      if (st.activeServerId === serverId) {
        if (st.voiceChannels.some((v) => v.id === useVoiceStore.getState().activeVoiceChannelId)) leaveRef.current();
        st.setActiveServer(null);
      }
      st.setServers(st.servers.filter((s) => s.id !== serverId));
      window.alert(tr("Беше премахнат от един сървър.", "You were removed from a server."));
    });

    // 📅 Events: refetch on any change; a toast (+ desktop notification) for new ones.
    socket.on(SocketEvents.EventsChanged, () => scheduleEventsReload());
    socket.on(SocketEvents.EventCreated, (p: EventCreatedPayload) => {
      if (p.creatorId === useAuthStore.getState().user?.id) return;
      const text = `${p.creatorUsername} · ${fmtDay(p.startsAt)} ${tr("в", "at")} ${fmtTime(p.startsAt)}`;
      useEventsStore.getState().pushToast({
        kind: "new",
        eventId: p.eventId,
        title: p.title,
        text,
        imageUrl: null,
        voiceChannelId: null,
        serverId: p.serverId,
      });
      notifyDesktop(`📅 ${tr("Ново събитие", "New event")}: ${p.title}`, text);
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
      if (!isActivelyViewing || !document.hasFocus()) notifyDesktop("ШмиркаТа", tr("Ново лично съобщение", "New direct message"));
    });

    socket.on(
      SocketEvents.VoiceChannelOccupants,
      ({ voiceChannelId, peers }: { voiceChannelId: string; peers: VoicePeerInfo[] }) => {
        useVoiceStore.getState().setChannelOccupants(voiceChannelId, peers);
      },
    );

    return () => {
      // The app is going away while still logged in (e.g. Back onto another page) but this socket
      // carries our place in the voice channel: leave properly — instead of the others losing us
      // while our audio keeps playing — and note the channel so the next mount walks back in.
      if (useAuthStore.getState().token && useVoiceStore.getState().activeVoiceChannelId) {
        rememberVoiceForRestart();
        leaveRef.current();
      }
      stopVisibility();
      socket.disconnect();
    };
  }, [token, setUserOnline, setIncomingRing]);

  // 📱 Push: keep this device signed up, and open whatever a tapped notification points at.
  useEffect(() => {
    if (!token) return;
    void syncPush();
    return listenForPushTaps((go) => {
      const [kind, ...rest] = go.split(":");
      if (kind === "dm" && rest[0]) {
        useDmStore.getState().setView("dms");
        useDmStore.getState().setActiveConversation(rest[0]);
        useMobileStore.getState().showContent();
      } else if (kind === "ch" && rest[0] && rest[1]) {
        const [serverId, channelId, messageId, rootId] = rest;
        useDmStore.getState().setView("servers");
        if (useServerStore.getState().activeServerId !== serverId) useServerStore.getState().setActiveServer(serverId);
        useServerStore.getState().setActiveTextChannel(channelId);
        setViewMode("text");
        useMobileStore.getState().showContent();
        if (messageId) useChatStore.getState().setJumpTarget({ channelId, messageId, rootId: rootId || null });
      }
    });
  }, [token]);

  // 📱 Android app: a foreground service keeps the call alive with the screen off / app in the background.
  const voiceChannelName = useServerStore((s) => s.voiceChannels.find((v) => v.id === activeVoiceChannelId)?.name);
  useEffect(() => {
    const native = nativePlugin();
    if (!native) return;
    if (!activeVoiceChannelId) {
      void native.stopCall().catch(() => {});
      return;
    }
    const start = () => void native.startCall({ title: "ШмиркаТа", text: `🔊 ${voiceChannelName ?? tr("В гласов канал", "In a voice channel")}` }).catch(() => {});
    start();
    // The mic permission prompt may still have been open the first time (no service without it).
    const retry = window.setTimeout(start, 8000);
    return () => window.clearTimeout(retry);
  }, [activeVoiceChannelId, voiceChannelName]);
  useEffect(() => () => void nativePlugin()?.stopCall().catch(() => {}), []);

  // 📱 Android Back button: chat → channel list → (in a call: to the background, the call keeps going) → exit.
  useEffect(() => {
    const app = appPlugin();
    if (!app) return;
    const l = app.addListener("backButton", () => {
      if (useMobileStore.getState().pane === "content" && isMobileLayoutNow()) {
        useMobileStore.getState().showNav();
        return;
      }
      if (useVoiceStore.getState().activeVoiceChannelId && app.minimizeApp) void app.minimizeApp();
      else void app.exitApp();
    });
    return () => void l.then((x) => x.remove());
  }, []);

  // Restarted for an update while in a call → straight back into the same channel (same
  // mute/deafen), instead of everyone having to click it again. Declared AFTER the socket effect
  // on purpose: effects run in order, and joining needs the socket — placed above it, the join
  // found no socket and silently did nothing.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!token || resumedRef.current) return;
    resumedRef.current = true;
    const resume = takeVoiceResume();
    if (!resume) return;
    void (async () => {
      try {
        for (let i = 0; i < 50 && !getSocket(); i++) await new Promise((r) => setTimeout(r, 100));
        await joinEventVoice(resume.serverId, resume.voiceChannelId);
        if (resume.deafened && !useVoiceStore.getState().isDeafened) toggleDeafen();
        if (resume.muted && !useVoiceStore.getState().isMuted) toggleMute();
      } catch (err) {
        console.warn("rejoining voice after the restart failed", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    fetchServers()
      .then(setServers)
      .catch(console.error)
      // Came in through an invite link: join that server and open it.
      .then(() => joinPendingInvite())
      .then((name) => name && showHotkeyToast(`🎉 ${tr("Влезе в", "Joined")} ${name}`))
      .catch(() => window.alert(tr("Линкът за покана не е валиден — помоли за нов.", "That invite link isn't valid — ask for a new one.")));
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
  viewingRef.current = viewingChannelId;
  const viewingLatest = useUnreadStore((s) => (viewingChannelId ? s.latest[viewingChannelId] : undefined));
  useEffect(() => {
    if (viewingChannelId) {
      useUnreadStore.getState().markRead(viewingChannelId);
      useMentionStore.getState().clear(viewingChannelId);
    }
  }, [viewingChannelId, viewingLatest]);

  useEffect(() => {
    if (!activeServerId) return;
    fetchChannels(activeServerId)
      .then(({ textChannels, voiceChannels }) => setChannels(textChannels, voiceChannels))
      .catch(console.error);

    fetchCustomEmojis(activeServerId).then(useServerStore.getState().setCustomEmojis).catch(console.error);

    void useMembersStore.getState().load(activeServerId).catch(console.error);
    void useStickerStore.getState().load(activeServerId);

    const socket = getSocket();
    socket?.emit(SocketEvents.ServerJoin, { serverId: activeServerId });
  }, [activeServerId, setChannels]);


  // The voice buttons' own column (FloatingVoiceHud places them over it) — while in a call and at
  // least one button still sits in it (everything dragged elsewhere → no empty column).
  useLayoutLockStore((s) => s.locked); // re-check after someone moved buttons (they unlock/lock to do it)
  const mobile = useIsMobile();
  const pane = useMobileStore((s) => s.pane);
  const showContent = useMobileStore((s) => s.showContent);
  const railShown = !mobile && !!activeVoiceChannelId && HUD_RAIL_IDS.some((id) => !hasSavedPosition(id));

  // Phones: opening a conversation goes to its screen.
  const prevConversation = useRef(activeConversationId);
  useEffect(() => {
    if (activeConversationId && activeConversationId !== prevConversation.current) showContent();
    prevConversation.current = activeConversationId;
  }, [activeConversationId, showContent]);

  return (
    <div className={`app-shell ${mobile ? `mobile pane-${pane}${activeVoiceChannelId ? " in-voice" : ""}` : ""}`}>
      <VoiceAudioBridge />
      <HotkeyToast />
      {mobile ? (
        <MobileVoiceBar
          onOpenVoice={() => {
            useDmStore.getState().setView("servers");
            setViewMode("voice");
            showContent();
          }}
        />
      ) : (
        <FloatingVoiceHud />
      )}
      <IncomingCallToast />
      <EventToasts onJoinVoice={(s, v) => void joinEventVoice(s, v)} />
      <RemoteControlPrompt />
      <AfkWatcher join={joinVoiceChannel} leave={leaveVoiceChannel} deafen={toggleDeafen} />
      <MusicVideoWindow />
      <DesktopOverlayFeed />
      <ActivityReporter />
      <EventBoardModal onJoinVoice={(s, v) => void joinEventVoice(s, v)} />
      <SearchModal />
      <LiveBanner />
      <StreamStatsPanel />
      <ServerSidebar />
      {view === "dms" ? (
        <>
          <DmListPanel />
          {railShown && <div className="voice-rail" />}
          {activeConversationId ? <DmChatView conversationId={activeConversationId} /> : <WelcomeScreen />}
        </>
      ) : (
        <>
          <ChannelList
            onSelectVoice={() => {
              setViewMode("voice");
              showContent();
            }}
            onSelectText={() => {
              setViewMode("text");
              showContent();
            }}
          />
          {railShown && <div className="voice-rail" />}
          {viewMode === "voice" && activeVoiceChannelId ? (
            <VoiceChannelPanel />
          ) : activeTextChannelId ? (
            <TextChatView channelId={activeTextChannelId} />
          ) : (
            <WelcomeScreen />
          )}
          {activeServerId && <MemberListPanel />}
        </>
      )}
    </div>
  );
}

function isMobileLayoutNow() {
  return window.matchMedia("(max-width: 760px)").matches;
}
