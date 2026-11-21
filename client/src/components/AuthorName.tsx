import { useIsOwner, useMemberColor } from "../store/membersStore";
import { tr } from "../i18n";

/**
 * A person's name in the chat / lists: the rank colour — or, for the server's owner, a look of their
 * own (gold shimmer + 👑) that no rank colour can be mistaken for.
 */
export default function AuthorName({
  userId,
  name,
  className = "author",
  onClick,
  crown = true,
}: {
  userId: string | null | undefined;
  name: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Show the 👑 in front (lists that already show one elsewhere turn it off). */
  crown?: boolean;
}) {
  const color = useMemberColor(userId ?? "");
  const owner = useIsOwner(userId);
  if (owner) {
    return (
      <span className={`${className} owner-name`} onClick={onClick} title={tr("Собственик на сървъра", "Server owner")}>
        {crown && <span className="owner-crown" aria-hidden>👑</span>}
        <span className="owner-name-text">{name}</span>
        {className === "author" && <span className="owner-tag">{tr("собственик", "owner")}</span>}
      </span>
    );
  }
  return (
    <span className={className} style={color ? { color } : undefined} onClick={onClick}>
      {name}
    </span>
  );
}
