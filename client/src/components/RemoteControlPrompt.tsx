import { createPortal } from "react-dom";
import { allowControl, denyControl, revokeControl, useControlStore } from "../webrtc/remoteControl";

/** Streamer: "X иска да управлява компютъра ти" + who controls it now. Viewer: short notices. */
export default function RemoteControlPrompt() {
  const incoming = useControlStore((s) => s.incoming);
  const controlledBy = useControlStore((s) => s.controlledBy);
  const notice = useControlStore((s) => s.notice);

  return createPortal(
    <>
      {incoming && (
        <div className="rc-prompt" role="alertdialog">
          <div className="rc-prompt-title">🖱 {incoming.username} иска да управлява компютъра ти</div>
          <div className="rc-prompt-text">
            Ще движи мишката и ще пише с клавиатурата в това, което стриймваш. Спираш го по всяко време с червената лента горе,
            с <b>Ctrl+Alt+Esc</b> или като мръднеш своята мишка.
          </div>
          <div className="rc-prompt-actions">
            <button className="rc-deny" onClick={denyControl}>
              Откажи
            </button>
            <button className="rc-allow" onClick={() => void allowControl()}>
              Разреши
            </button>
          </div>
        </div>
      )}
      {controlledBy && (
        <div className="rc-active">
          🖱 {controlledBy.username} управлява компютъра ти
          <button onClick={revokeControl}>Спри</button>
        </div>
      )}
      {notice && <div className="rc-notice">{notice}</div>}
    </>,
    document.body,
  );
}
