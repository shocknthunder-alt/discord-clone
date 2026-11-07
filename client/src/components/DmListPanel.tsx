import { useEffect } from "react";
import { fetchConversations } from "../api/dm.api";
import { useDmStore } from "../store/dmStore";
import UserBar from "./UserBar";
import VoiceStatusBar from "./VoiceStatusBar";

export default function DmListPanel() {
  const { conversations, activeConversationId, setConversations, setActiveConversation, setView } = useDmStore();

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error);
  }, [setConversations]);

  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar-scroll">
        <div className="channel-sidebar-header">
          <button className="server-settings-button" onClick={() => setView("servers")} title="Back to servers">
            ←
          </button>
          <h2>Direct Messages</h2>
        </div>

        {conversations.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: "#949ba4" }}>
            No conversations yet. Right-click someone in a voice channel to message or call them.
          </div>
        )}

        {conversations.map((conversation) => (
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
            {conversation.otherUser.username}
          </div>
        ))}
      </div>

      <VoiceStatusBar />
      <UserBar />
    </div>
  );
}
