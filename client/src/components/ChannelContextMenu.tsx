import { useEffect, useRef } from "react";

interface Props {
  type: "text" | "voice";
  x: number;
  y: number;
  onClose: () => void;
  onCreate: (type: "text" | "voice") => void;
}

export default function ChannelContextMenu({ type, x, y, onClose, onCreate }: Props) {
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
      <button
        className="context-menu-item"
        onClick={() => {
          onCreate(type);
          onClose();
        }}
      >
        {type === "text" ? "Create Text Channel" : "Create Voice Channel"}
      </button>
    </div>
  );
}
