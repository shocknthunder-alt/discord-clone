import { tr } from "../i18n";
import { useDmStore } from "../store/dmStore";
import { useMembersStore } from "../store/membersStore";
import { useMentionStore } from "../store/mentionStore";
import { useMusicStore } from "../store/musicStore";
import { useMobileStore } from "../store/mobileStore";
import { useSearchStore } from "../store/searchStore";
import { useServerStore } from "../store/serverStore";
import { isChannelUnread, useUnreadStore } from "../store/unreadStore";
import { useVoiceStore } from "../store/voiceStore";
import { isMutedHere, useMuteStore } from "../store/muteStore";
import { showHotkeyToast } from "./HotkeyToast";
import { runHotkeyTarget, type ChannelHotkey, type HotkeyActionId, type HotkeyTarget } from "./hotkeys";

export interface HotkeyContext {
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void> | void;
  toggleScreenShare: () => Promise<void> | void;
  leaveVoiceChannel: () => void;
  joinVoiceChannel: (id: string) => Promise<void>;
  playMusic: () => void;
  pauseMusic: () => void;
  skipMusic: () => void;
  seekMusic: (positionSeconds: number) => void;
  /** Show the text chat (true) or the voice channel view (false). */
  setViewMode: (mode: "text" | "voice") => void;
}

const notInVoice = () => showHotkeyToast(tr("Не си в гласов канал", "You're not in a voice channel"));

function musicPosition(): number | null {
  const s = useMusicStore.getState().state;
  if (!s || s.currentIndex >= s.queue.length) return null;
  return s.isPlaying ? s.positionSeconds + (Date.now() - s.updatedAt) / 1000 : s.positionSeconds;
}

function openTextChannel(ctx: HotkeyContext, serverId: string, channelId: string) {
  useDmStore.getState().setView("servers");
  const servers = useServerStore.getState();
  const open = () => {
    useServerStore.getState().setActiveTextChannel(channelId);
    ctx.setViewMode("text");
    useMobileStore.getState().showContent();
  };
  if (servers.activeServerId === serverId) {
    open();
    return;
  }
  servers.setActiveServer(serverId);
  // The other server's channel list loads first; then the channel opens.
  let tries = 0;
  const wait = setInterval(() => {
    tries += 1;
    if (useServerStore.getState().textChannels.some((c) => c.id === channelId) || tries > 40) {
      clearInterval(wait);
      if (useServerStore.getState().activeServerId === serverId) open();
    }
  }, 100);
}

async function joinVoice(ctx: HotkeyContext, c: ChannelHotkey) {
  const voice = useVoiceStore.getState();
  if (voice.activeVoiceChannelId === c.channelId) {
    showHotkeyToast(`🔊 ${tr("Вече си в", "Already in")} ${c.name}`);
    return;
  }
  useDmStore.getState().setView("servers");
  if (useServerStore.getState().activeServerId !== c.serverId) useServerStore.getState().setActiveServer(c.serverId);
  if (voice.activeVoiceChannelId) ctx.leaveVoiceChannel();
  showHotkeyToast(`🔊 ${c.name}`);
  await ctx.joinVoiceChannel(c.channelId);
  ctx.setViewMode("voice");
}

function stepChannel(ctx: HotkeyContext, delta: number) {
  const { textChannels, activeTextChannelId, activeServerId } = useServerStore.getState();
  if (!activeServerId || textChannels.length === 0) return;
  const i = textChannels.findIndex((c) => c.id === activeTextChannelId);
  const next = textChannels[(i + delta + textChannels.length) % textChannels.length];
  if (next) openTextChannel(ctx, activeServerId, next.id);
}

function nextUnread(ctx: HotkeyContext) {
  // @mentions first (any server), then unread channels of this server after the current one.
  const mentions = useMentionStore.getState();
  const withMention = Object.entries(mentions.counts).find(([, n]) => n > 0);
  if (withMention) {
    const [channelId] = withMention;
    const serverId = mentions.serverOf[channelId];
    if (serverId) {
      openTextChannel(ctx, serverId, channelId);
      return;
    }
  }
  const { textChannels, activeTextChannelId, activeServerId } = useServerStore.getState();
  if (!activeServerId) return;
  const unread = useUnreadStore.getState();
  const mutes = useMuteStore.getState();
  const start = textChannels.findIndex((c) => c.id === activeTextChannelId);
  for (let k = 1; k <= textChannels.length; k++) {
    const c = textChannels[(start + k + textChannels.length) % textChannels.length];
    if (c && c.id !== activeTextChannelId && isChannelUnread(unread, c.id) && !isMutedHere(mutes, activeServerId, c.id)) {
      openTextChannel(ctx, activeServerId, c.id);
      return;
    }
  }
  showHotkeyToast(tr("✓ Всичко е прочетено", "✓ Nothing unread"));
}

function runAction(ctx: HotkeyContext, id: HotkeyActionId) {
  const voice = useVoiceStore.getState();
  const inVoice = !!voice.activeVoiceChannelId;
  switch (id) {
    case "mute":
      if (!inVoice) return notInVoice();
      ctx.toggleMute();
      showHotkeyToast(useVoiceStore.getState().isMuted ? tr("🔇 Микрофонът е заглушен", "🔇 Mic muted") : tr("🎙️ Микрофонът е включен", "🎙️ Mic on"));
      return;
    case "deafen":
      if (!inVoice) return notInVoice();
      ctx.toggleDeafen();
      showHotkeyToast(useVoiceStore.getState().isDeafened ? tr("🔕 Не чуваш никого", "🔕 Deafened") : tr("🔊 Пак чуваш всички", "🔊 Undeafened"));
      return;
    case "camera":
      if (!inVoice) return notInVoice();
      showHotkeyToast(voice.isCameraOn ? tr("📷 Камерата се спира", "📷 Camera off") : tr("📷 Камерата се пуска…", "📷 Camera on…"));
      void ctx.toggleCamera();
      return;
    case "screenShare":
      if (!inVoice) return notInVoice();
      void ctx.toggleScreenShare();
      return;
    case "clip":
      if (!runHotkeyTarget("clip")) showHotkeyToast(tr("✂️ Клип става само докато гледаш чужд стрийм", "✂️ Clips only work while watching someone's stream"));
      else showHotkeyToast(tr("✂️ Правя клип…", "✂️ Making a clip…"));
      return;
    case "leaveVoice":
      if (!inVoice) return notInVoice();
      ctx.leaveVoiceChannel();
      showHotkeyToast(tr("📞 Излезе от гласовия канал", "📞 Left the voice channel"));
      return;
    case "voiceMessage":
      if (!runHotkeyTarget("voice-message")) showHotkeyToast(tr("🎤 Отвори чат, за да запишеш гласово съобщение", "🎤 Open a chat to record a voice message"));
      return;
    case "voiceMessageCancel":
      runHotkeyTarget("voice-message-cancel");
      return;
    case "musicPlayPause": {
      if (!inVoice) return notInVoice();
      const s = useMusicStore.getState().state;
      if (!s || s.currentIndex >= s.queue.length) return showHotkeyToast(tr("🎵 Няма пусната музика", "🎵 No music queued"));
      if (s.isPlaying) ctx.pauseMusic();
      else ctx.playMusic();
      showHotkeyToast(s.isPlaying ? "⏸ " + tr("Пауза", "Paused") : "▶ " + (s.queue[s.currentIndex]?.title ?? ""));
      return;
    }
    case "musicNext": {
      if (!inVoice) return notInVoice();
      const s = useMusicStore.getState().state;
      if (!s || s.currentIndex >= s.queue.length) return;
      ctx.skipMusic();
      const next = s.queue[s.currentIndex + 1];
      showHotkeyToast(next ? `⏭ ${next.title}` : tr("⏭ Списъкът свърши", "⏭ End of the list"));
      return;
    }
    case "musicBack":
    case "musicForward": {
      if (!inVoice) return notInVoice();
      const pos = musicPosition();
      if (pos === null) return;
      const delta = id === "musicBack" ? -10 : 10;
      ctx.seekMusic(Math.max(0, pos + delta));
      showHotkeyToast(delta < 0 ? "⏪ −10 s" : "⏩ +10 s");
      return;
    }
    case "musicVolumeUp":
    case "musicVolumeDown":
      runHotkeyTarget("music-volume", id === "musicVolumeUp" ? 5 : -5);
      return;
    case "musicMute":
      runHotkeyTarget("music-mute");
      return;
    case "musicType":
      if (!inVoice) return notInVoice();
      runHotkeyTarget("music-type");
      return;
    case "prevChannel":
      return stepChannel(ctx, -1);
    case "nextChannel":
      return stepChannel(ctx, 1);
    case "nextUnread":
      return nextUnread(ctx);
    case "search":
      useSearchStore.getState().setOpen(true);
      return;
    case "members":
      useMembersStore.getState().togglePanel();
      return;
    case "dms": {
      const dm = useDmStore.getState();
      dm.setView(dm.view === "dms" ? "servers" : "dms");
      return;
    }
    case "settings":
      runHotkeyTarget("open-settings");
      return;
  }
}

export function runHotkey(ctx: HotkeyContext, t: HotkeyTarget) {
  if (t.kind === "action") {
    runAction(ctx, t.id);
    return;
  }
  const c = t.channel;
  if (c.kind === "voice") void joinVoice(ctx, c);
  else openTextChannel(ctx, c.serverId, c.channelId);
}
