import type { MemberDTO } from "@discord-clone/shared";
import { useVoiceStore } from "../store/voiceStore";
import { useMembersStore } from "../store/membersStore";
import ProfileCard from "./ProfileCard";

interface Props {
  socketId: string;
  x: number;
  y: number;
  onClose: () => void;
  onCall: (userId: string, username: string) => void;
  onJoinVoice?: (voiceChannelId: string) => void;
}

/** Clicking someone in a voice channel / call: their profile card plus volume & mute-for-me. */
export default function VoicePeerContextMenu({ socketId, x, y, onClose, onCall, onJoinVoice }: Props) {
  const peer = useVoiceStore((s) => s.peers.get(socketId));
  const member = useMembersStore((s) => (peer ? s.members.find((m) => m.userId === peer.userId) : undefined));
  if (!peer) return null;

  // Not in this server's member list (e.g. a private call): a minimal profile from the call itself.
  const shown: MemberDTO = member ?? {
    userId: peer.userId,
    username: peer.username,
    avatarUrl: peer.avatarUrl,
    roleId: null,
    isOwner: false,
    online: true,
    joinedAt: "",
  };

  return (
    <ProfileCard
      key={peer.userId}
      member={shown}
      x={x}
      y={y}
      onClose={onClose}
      peerSocketId={socketId}
      onCall={(userId) => onCall(userId, peer.username)}
      onJoinVoice={onJoinVoice}
    />
  );
}
