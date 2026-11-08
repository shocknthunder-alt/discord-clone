import { useEffect, useRef } from "react";
import { useIgnoredUsersStore } from "../store/ignoredUsersStore";

interface Props {
  userId: string;
  username: string;
  x: number;
  y: number;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
}

export default function UserContextMenu({ userId, username, x, y, onClose, onMessage, onCall }: Props) {
  const isIgnored = useIgnoredUsersStore((s) => s.isIgnored(userId));
  const toggleIgnore = useIgnoredUsersStore((s) => s.toggleIgnore);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div className="context-menu" ref={ref} style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
      <div className="context-menu-header">{username}</div>

      <button
        className="context-menu-item"
        onClick={() => {
          toggleIgnore(userId);
          onClose();
        }}
      >
        {isIgnored ? "Unignore" : "Ignore"} {username}
      </button>

      <button
        className="context-menu-item"
        onClick={() => {
          onMessage(userId);
          onClose();
        }}
      >
        Message {username}
      </button>

      <button
        className="context-menu-item"
        onClick={() => {
          onCall(userId);
          onClose();
        }}
      >
        Call {username}
      </button>
    </div>
  );
}
