import { createPortal } from "react-dom";
import { allowControl, denyControl, revokeControl, useControlStore } from "../webrtc/remoteControl";
import { tr } from "../i18n";

/** Streamer: "X иска да управлява компютъра ти" + who controls it now. Viewer: short notices. */
export default function RemoteControlPrompt() {
  const incoming = useControlStore((s) => s.incoming);
  const controlledBy = useControlStore((s) => s.controlledBy);
  const notice = useControlStore((s) => s.notice);

  return createPortal(
    <>
      {incoming && (
        <div className="rc-prompt" role="alertdialog">
          <div className="rc-prompt-title">🖱 {incoming.username} {tr("иска да управлява компютъра ти", "wants to control your PC")}</div>
          <div className="rc-prompt-text">
            {tr(
              "Ще движи мишката и ще пише с клавиатурата в това, което стриймваш. Спираш го по всяко време с червената лента горе, с",
              "They'll move the mouse and type in what you're streaming. Stop it any time with the red bar at the top, with",
            )}{" "}
            <b>Ctrl+Alt+Esc</b> {tr("или като мръднеш своята мишка.", "or by moving your own mouse.")}
          </div>
          <div className="rc-prompt-actions">
            <button className="rc-deny" onClick={denyControl}>
              {tr("Откажи", "Deny")}
            </button>
            <button className="rc-allow" onClick={() => void allowControl()}>
              {tr("Разреши", "Allow")}
            </button>
          </div>
        </div>
      )}
      {controlledBy && (
        <div className="rc-active">
          🖱 {controlledBy.username} {tr("управлява компютъра ти", "is controlling your PC")}
          <button onClick={revokeControl}>{tr("Спри", "Stop")}</button>
        </div>
      )}
      {notice && <div className="rc-notice">{notice}</div>}
    </>,
    document.body,
  );
}
