import { useEffect, useState } from "react";
import { tr } from "../i18n";
import { useServerStore } from "../store/serverStore";
import {
  bindingFor,
  comboAllowed,
  describeCode,
  describeCombo,
  findBinding,
  groupLabel,
  HOTKEY_ACTIONS,
  isModifierCode,
  makeCombo,
  mouseCode,
  setHotkeyCapture,
  useHotkeyStore,
  type HotkeyGroup,
  type HotkeyTarget,
} from "./hotkeys";

const desktop = typeof window !== "undefined" && !!window.shmirkaDesktop;

function targetName(t: HotkeyTarget): string {
  if (t.kind === "channel") return `${t.channel.kind === "voice" ? "🔊" : "#"} ${t.channel.name}`;
  return HOTKEY_ACTIONS.find((a) => a.id === t.id)?.label() ?? "";
}

function clearTarget(t: HotkeyTarget) {
  const s = useHotkeyStore.getState();
  if (t.kind === "action") s.setCombo(t.id, null);
  else s.updateChannel(t.channel.key, { combo: null });
}

/**
 * Waits for the next key combo / extra mouse button. `plain` = any single key is fine (push-to-talk).
 * Esc cancels, Backspace/Delete = no key.
 */
function useCapture() {
  const [listening, setListening] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  function capture(id: string, plain: boolean, done: (combo: string | null) => void) {
    setListening(id);
    setMessage(null);
    setHotkeyCapture(true);
    const finish = (combo: string | null | undefined) => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("mouseup", swallow, true);
      window.removeEventListener("auxclick", swallow, true);
      setHotkeyCapture(false);
      setListening(null);
      if (combo !== undefined) done(combo);
    };
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (isModifierCode(e.code) && !plain) return; // wait for the actual key
      const m = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
      if (e.code === "Escape" && !m.ctrl && !m.alt && !m.shift) return finish(undefined);
      if ((e.code === "Backspace" || e.code === "Delete") && !m.ctrl && !m.alt && !m.shift) return finish(null);
      if (plain) return finish(e.code);
      const combo = makeCombo(e.code, m);
      if (!comboAllowed(combo)) {
        setMessage(tr("Добави Ctrl, Alt или Shift — иначе ще се задейства, докато пишеш или играеш.", "Add Ctrl, Alt or Shift — otherwise it fires while you type or play."));
        return;
      }
      finish(combo);
    }
    function onMouse(e: MouseEvent) {
      const code = mouseCode(e.button);
      if (!code) return;
      e.preventDefault();
      e.stopPropagation();
      finish(plain ? code : makeCombo(code, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }));
    }
    function swallow(e: MouseEvent) {
      if (mouseCode(e.button)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("mouseup", swallow, true);
    window.addEventListener("auxclick", swallow, true);
  }

  useEffect(() => () => setHotkeyCapture(false), []);
  return { listening, message, setMessage, capture };
}

export default function HotkeySettings({
  pttKey,
  pttActive,
  onPttKey,
}: {
  pttKey: string | null;
  pttActive: boolean;
  onPttKey: (code: string) => void;
}) {
  const store = useHotkeyStore();
  const { listening, message, setMessage, capture } = useCapture();
  const servers = useServerStore((s) => s.servers);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const textChannels = useServerStore((s) => s.textChannels);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const [picking, setPicking] = useState("");

  /** Saves a combo; whoever had it before loses it (and you're told). */
  function assign(combo: string | null, self: HotkeyTarget, save: () => void) {
    if (combo) {
      const other = findBinding(combo);
      const same =
        other && ((other.kind === "action" && self.kind === "action" && other.id === self.id) || (other.kind === "channel" && self.kind === "channel" && other.channel.key === self.channel.key));
      if (other && !same) {
        clearTarget(other);
        setMessage(tr(`${describeCombo(combo)} беше за „${targetName(other)}“ — махнах го оттам.`, `${describeCombo(combo)} was used by "${targetName(other)}" — removed it there.`));
      }
    }
    save();
  }

  function comboButton(id: string, combo: string | null, onCapture: () => void) {
    return (
      <button type="button" className={`hk-combo ${listening === id ? "listening" : ""} ${combo ? "" : "empty"}`} onClick={onCapture} disabled={!!listening && listening !== id}>
        {listening === id ? tr("Натисни комбинация…", "Press a combo…") : combo ? describeCombo(combo) : tr("няма", "none")}
      </button>
    );
  }

  const groups: HotkeyGroup[] = ["voice", "music", "nav"];
  const channelOptions = [
    ...textChannels.map((c) => ({ value: `text:${c.id}`, label: `# ${c.name}` })),
    ...voiceChannels.map((c) => ({ value: `voice:${c.id}`, label: `🔊 ${c.name}` })),
  ];
  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="hk-settings">
      <p className="set-hint">
        {tr(
          "Цъкни върху клавиша и натисни новата комбинация (или страничен бутон на мишката). Esc = откажи, Backspace = махни.",
          "Click a key and press the new combo (or a side mouse button). Esc = cancel, Backspace = remove.",
        )}
        {desktop
          ? " " + tr("🌐 = работи и докато играеш (друг прозорец е отпред).", "🌐 = also works while you play (another window in front).")
          : " " + tr("В браузъра клавишите работят само докато сайтът е отпред — в десктоп приложението и в игри.", "In the browser keys only work while the site is in front — in the desktop app also in games.")}
      </p>
      {desktop && !window.shmirkaDesktop?.mouseButtons && (
        <p className="set-hint hk-warn">
          {tr(
            "Страничните бутони на мишката в игри искат десктоп приложение 1.10.0 — обнови го (рестартирай, когато ти предложи). Докато Шмирката е отпред, работят и сега.",
            "Side mouse buttons in games need desktop app 1.10.0 — update it (restart when offered). While Shmirka is in front they already work.",
          )}
        </p>
      )}
      {message && <p className="hk-message">{message}</p>}

      {groups.map((g) => (
        <section className="set-card" key={g}>
          <h3 className="set-card-title">{groupLabel(g)}</h3>
          <div className="set-card-body hk-list">
            {g === "voice" && (
              <div className="hk-row">
                <span className="hk-label">
                  Push-to-talk
                  {!pttActive && <span className="hk-sub">{tr("Важи, когато в „Глас и видео“ е избрано Push-to-talk", "Applies when Push-to-talk is chosen in Voice & video")}</span>}
                </span>
                <button
                  type="button"
                  className={`hk-combo ${listening === "ptt" ? "listening" : ""} ${pttKey ? "" : "empty"}`}
                  disabled={!!listening && listening !== "ptt"}
                  onClick={() => capture("ptt", true, (code) => code && onPttKey(code))}
                >
                  {listening === "ptt" ? tr("Натисни клавиш…", "Press a key…") : pttKey ? describeCode(pttKey) : tr("няма", "none")}
                </button>
                {desktop && <span className="hk-global-spacer" />}
                <span className="hk-clear-spacer" />
              </div>
            )}
            {HOTKEY_ACTIONS.filter((a) => a.group === g).map((a) => {
              const b = bindingFor(store, a);
              const self: HotkeyTarget = { kind: "action", id: a.id };
              return (
                <div className="hk-row" key={a.id}>
                  <span className="hk-label">{a.label()}</span>
                  {comboButton(a.id, b.combo, () => capture(a.id, false, (combo) => assign(combo, self, () => store.setCombo(a.id, combo))))}
                  {desktop &&
                    (a.canBeGlobal ? (
                      <label className="hk-global" title={tr("Работи и докато играеш", "Also works while you play")}>
                        <input type="checkbox" checked={b.global} onChange={(e) => store.setGlobal(a.id, e.target.checked)} />🌐
                      </label>
                    ) : (
                      <span className="hk-global-spacer" />
                    ))}
                  <button type="button" className="hk-clear" onClick={() => store.setCombo(a.id, null)} disabled={!b.combo} title={tr("Махни", "Remove")}>
                    ✕
                  </button>
                </div>
              );
            })}

            {g === "nav" && (
              <>
                {store.channels.map((c) => {
                  const self: HotkeyTarget = { kind: "channel", channel: c };
                  return (
                    <div className="hk-row" key={c.key}>
                      <span className="hk-label">
                        {c.kind === "voice" ? tr("Влез в", "Join") + " 🔊 " : tr("Отвори", "Open") + " # "}
                        {c.name}
                        {servers.length > 1 && <span className="hk-sub">{serverName(c.serverId)}</span>}
                      </span>
                      {comboButton(c.key, c.combo, () => capture(c.key, false, (combo) => assign(combo, self, () => store.updateChannel(c.key, { combo }))))}
                      {desktop &&
                        (c.kind === "voice" ? (
                          <label className="hk-global" title={tr("Работи и докато играеш", "Also works while you play")}>
                            <input type="checkbox" checked={c.global} onChange={(e) => store.updateChannel(c.key, { global: e.target.checked })} />🌐
                          </label>
                        ) : (
                          <span className="hk-global-spacer" />
                        ))}
                      <button type="button" className="hk-clear" onClick={() => store.removeChannel(c.key)} title={tr("Махни реда", "Remove the row")}>
                        🗑
                      </button>
                    </div>
                  );
                })}
                {activeServerId && channelOptions.length > 0 && (
                  <div className="hk-row hk-add">
                    <select value={picking} onChange={(e) => setPicking(e.target.value)}>
                      <option value="">{tr("＋ Клавиш за конкретен канал…", "＋ Key for a specific channel…")}</option>
                      {channelOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="set-button"
                      disabled={!picking}
                      onClick={() => {
                        const [kind, channelId] = picking.split(":") as ["text" | "voice", string];
                        const name = (kind === "text" ? textChannels : voiceChannels).find((c) => c.id === channelId)?.name ?? "?";
                        store.addChannel({ kind, serverId: activeServerId, channelId, name, combo: null, global: kind === "voice" });
                        setPicking("");
                      }}
                    >
                      {tr("Добави", "Add")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      ))}

      <button
        type="button"
        className="set-button"
        onClick={() => {
          if (window.confirm(tr("Да върна всички клавиши както са по подразбиране?", "Reset all keys to the defaults?"))) store.resetAll();
        }}
      >
        ↺ {tr("Върни по подразбиране", "Reset to defaults")}
      </button>
    </div>
  );
}
