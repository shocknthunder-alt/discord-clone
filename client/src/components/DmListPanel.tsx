import { useEffect } from "react";
import { fetchConversations } from "../api/dm.api";
import { useDmStore } from "../store/dmStore";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { useVoiceStore } from "../store/voiceStore";
import { resetAllPositions } from "../utils/floatingPositions";
import MusicMiniPlayer from "./MusicMiniPlayer";
import UserBar from "./UserBar";
import VoiceStatusBar from "./VoiceStatusBar";
import { tr } from "../i18n";

export default function DmListPanel() {
  const { conversations, activeConversationId, unreadCounts, setConversations, setActiveConversation, setView } =
    useDmStore();
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const { locked, toggleLocked } = useLayoutLockStore();

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error);
  }, [setConversations]);

  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar-scroll">
        <div className="channel-sidebar-header">
          <button className="server-settings-button" onClick={() => setView("servers")} title={tr("Обратно към сървърите", "Back to servers")}>
            ←
          </button>
          <h2>{tr("Лични съобщения", "Direct Messages")}</h2>
          <button
            className="server-settings-button"
            onClick={toggleLocked}
            title={locked ? tr("Отключи (позволи местене с влачене)", "Unlock layout (allow drag-reordering)") : tr("Заключи (без местене)", "Lock layout (prevent drag-reordering)")}
          >
            {locked ? "🔒" : "🔓"}
          </button>
          {!locked && (
            <button
              className="server-settings-button"
              onClick={() => {
                if (window.confirm(tr("Да върна ли всички преместени икони и бутони на местата им?", "Reset all moved icons/buttons back to their default positions?"))) {
                  resetAllPositions();
                  window.location.reload();
                }
              }}
              title={tr("Върни иконите на местата им", "Reset icon positions")}
            >
              ↺
            </button>
          )}
        </div>

        {conversations.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: "var(--t-3)" }}>
            {tr("Още няма разговори. Цъкни с десен бутон на някого в гласов канал, за да му пишеш или да му се обадиш.", "No conversations yet. Right-click someone in a voice channel to message or call them.")}
          </div>
        )}

        {conversations.map((conversation) => {
          const unread = unreadCounts[conversation.id] ?? 0;
          return (
            <div
              key={conversation.id}
              className={`channel-item ${conversation.id === activeConversationId ? "active" : ""}`}
              onClick={() => setActiveConversation(conversation.id)}
            >
              {conversation.otherUser.avatarUrl ? (
                <img className="dm-list-avatar" src={conversation.otherUser.avatarUrl} alt="" />
              ) : (
                <span className="dm-list-avatar placeholder">
                  {conversation.otherUser.username.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span style={{ flex: 1 }}>{conversation.otherUser.username}</span>
              {unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
            </div>
          );
        })}
      </div>

      <VoiceStatusBar />
      <MusicMiniPlayer />
      {!activeVoiceChannelId && <UserBar />}
    </div>
  );
}
