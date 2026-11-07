import { useDmStore } from "../store/dmStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

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
      <div>📞 {incomingRing.callerUsername} is calling…</div>
      <div className="incoming-call-toast-actions">
        <button className="modal-create-button" onClick={handleJoin}>
          Join
        </button>
        <button onClick={() => setIncomingRing(null)}>Dismiss</button>
      </div>
    </div>
  );
}
