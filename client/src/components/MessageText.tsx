import { useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { useMembersStore } from "../store/membersStore";
import { renderMessage } from "../utils/markdown";
import { LinkedImages } from "./ChatImage";
import LinkPreviews from "./LinkPreviews";

/** Usernames of the open server's members (for @mentions). */
export function useMemberNames(): string[] {
  const members = useMembersStore((s) => s.members);
  return useMemo(() => members.map((m) => m.username), [members]);
}

/**
 * A message's text with formatting, links and @mentions, followed by inline pictures for image
 * links and preview cards for the other links.
 */
export default function MessageText({
  text,
  className = "message-text",
  dm = false,
  onMentionClick,
}: {
  text: string;
  className?: string;
  /** In DMs there are no server members to @mention. */
  dm?: boolean;
  onMentionClick?: (name: string, e: React.MouseEvent) => void;
}) {
  const names = useMemberNames();
  const myName = useAuthStore((s) => s.user?.username);
  const nodes = useMemo(
    () => renderMessage(text, { names: dm ? [] : names, myName: dm ? null : myName, onMentionClick }),
    [text, names, myName, dm, onMentionClick],
  );
  return (
    <>
      <div className={className}>{nodes}</div>
      <LinkedImages text={text} />
      <LinkPreviews text={text} />
    </>
  );
}
