import { useDmStore } from "../store/dmStore";
import { CallIcon } from "./HudIcons";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { tr } from "../i18n";

export default function IncomingCallToast() {
  const { incomingRing, setIncomingRing, setView, setActiveConversation } = useDmStore();
  const { joinVoiceChannel } = useVoiceChannel();

  if (!incomingRing) return null;

  async function handleJoin() {
    if (!incomingRing) return;
    setView("dms");
    setActiveConversation(incomingRing.conversationId);
    await joinVoiceChannel(incomingRing.voiceRoomId);
    setIncomingRing(null);
  }

  return (
    <div className="incoming-call-toast">
      <div>
        <CallIcon size={16} /> {incomingRing.callerUsername} {tr("те търси…", "is calling…")}</div>
      <div className="incoming-call-toast-actions">
        <button className="modal-create-button" onClick={handleJoin}>
          {tr("Влез", "Join")}
        </button>
        <button onClick={() => setIncomingRing(null)}>{tr("Отказ", "Dismiss")}</button>
      </div>
    </div>
  );
}
