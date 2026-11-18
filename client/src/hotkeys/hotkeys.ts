import { useEffect, useRef } from "react";
import { create } from "zustand";
import { tr } from "../i18n";

/*
 * Hotkeys (Settings → ⌨️ Клавиши). A combo is "Ctrl+Alt+Shift+Meta+<code>" (modifiers in that
 * order, only the ones held), <code> = KeyboardEvent.code ("KeyM", "ArrowUp", "F5") or a mouse
 * button ("Mouse3" = middle, "Mouse4" = back, "Mouse5" = forward).
 *
 * Keys come from the page itself (browser, or the desktop app while it has focus) and — desktop app
 * only — from the system-wide listener while a game has focus ("🌐 и в игри"). Global events are
 * ignored while our window has focus, so nothing runs twice.
 */

export type HotkeyGroup = "voice" | "music" | "nav";

export type HotkeyActionId =
  | "mute"
  | "deafen"
  | "camera"
  | "screenShare"
  | "clip"
  | "leaveVoice"
  | "voiceMessage"
  | "voiceMessageCancel"
  | "musicPlayPause"
  | "musicNext"
  | "musicBack"
  | "musicForward"
  | "musicVolumeUp"
  | "musicVolumeDown"
  | "musicMute"
  | "musicType"
  | "prevChannel"
  | "nextChannel"
  | "nextUnread"
  | "search"
  | "members"
  | "dms"
  | "settings";

export interface HotkeyActionDef {
  id: HotkeyActionId;
  group: HotkeyGroup;
  label: () => string;
  defaultCombo: string | null;
  /** May run while a game has focus (desktop app). */
  canBeGlobal: boolean;
}

export const HOTKEY_ACTIONS: HotkeyActionDef[] = [
  { id: "mute", group: "voice", label: () => tr("Заглуши / включи микрофона", "Mute / unmute the mic"), defaultCombo: "Ctrl+Shift+KeyM", canBeGlobal: true },
  { id: "deafen", group: "voice", label: () => tr("Заглуши всичко (deafen)", "Deafen"), defaultCombo: "Ctrl+Shift+KeyD", canBeGlobal: true },
  { id: "camera", group: "voice", label: () => tr("Камера вкл / изкл", "Camera on / off"), defaultCombo: null, canBeGlobal: true },
  { id: "screenShare", group: "voice", label: () => tr("Пусни / спри стрийм", "Start / stop streaming"), defaultCombo: null, canBeGlobal: false },
  { id: "clip", group: "voice", label: () => tr("✂️ Клип (последните 30 сек от стрийма)", "✂️ Clip (last 30 s of the stream)"), defaultCombo: "Alt+KeyC", canBeGlobal: true },
  { id: "leaveVoice", group: "voice", label: () => tr("Излез от гласовия канал", "Leave the voice channel"), defaultCombo: null, canBeGlobal: true },
  { id: "voiceMessage", group: "voice", label: () => tr("🎤 Гласово съобщение: запиши / прати", "🎤 Voice message: record / send"), defaultCombo: "Alt+KeyR", canBeGlobal: false },
  { id: "voiceMessageCancel", group: "voice", label: () => tr("🎤 Откажи гласовото съобщение", "🎤 Discard the voice message"), defaultCombo: null, canBeGlobal: false },
  { id: "musicPlayPause", group: "music", label: () => tr("Пусни / пауза", "Play / pause"), defaultCombo: "Ctrl+Shift+KeyP", canBeGlobal: true },
  { id: "musicNext", group: "music", label: () => tr("Следваща песен", "Next song"), defaultCombo: "Ctrl+Shift+ArrowRight", canBeGlobal: true },
  { id: "musicBack", group: "music", label: () => tr("10 секунди назад", "Back 10 seconds"), defaultCombo: "Ctrl+Shift+Comma", canBeGlobal: true },
  { id: "musicForward", group: "music", label: () => tr("10 секунди напред", "Forward 10 seconds"), defaultCombo: "Ctrl+Shift+Period", canBeGlobal: true },
  { id: "musicVolumeUp", group: "music", label: () => tr("Музиката по-силно", "Music louder"), defaultCombo: "Ctrl+Shift+ArrowUp", canBeGlobal: true },
  { id: "musicVolumeDown", group: "music", label: () => tr("Музиката по-тихо", "Music quieter"), defaultCombo: "Ctrl+Shift+ArrowDown", canBeGlobal: true },
  { id: "musicMute", group: "music", label: () => tr("Заглуши музиката (само за мен)", "Mute the music (only for me)"), defaultCombo: null, canBeGlobal: true },
  { id: "musicType", group: "music", label: () => tr("Напиши песен (отваря полето)", "Type a song (focuses the box)"), defaultCombo: null, canBeGlobal: false },
  { id: "prevChannel", group: "nav", label: () => tr("Предишен канал", "Previous channel"), defaultCombo: "Alt+ArrowUp", canBeGlobal: false },
  { id: "nextChannel", group: "nav", label: () => tr("Следващ канал", "Next channel"), defaultCombo: "Alt+ArrowDown", canBeGlobal: false },
  { id: "nextUnread", group: "nav", label: () => tr("Следващ непрочетен канал (първо със @)", "Next unread channel (@ first)"), defaultCombo: "Alt+Shift+ArrowDown", canBeGlobal: false },
  { id: "search", group: "nav", label: () => tr("Търсене в съобщенията", "Search messages"), defaultCombo: "Ctrl+KeyK", canBeGlobal: false },
  { id: "members", group: "nav", label: () => tr("Покажи / скрий членовете", "Show / hide members"), defaultCombo: null, canBeGlobal: false },
  { id: "dms", group: "nav", label: () => tr("Лични съобщения ↔ сървър", "Direct messages ↔ server"), defaultCombo: null, canBeGlobal: false },
  { id: "settings", group: "nav", label: () => tr("Настройки", "Settings"), defaultCombo: "Ctrl+Comma", canBeGlobal: false },
];

export function groupLabel(g: HotkeyGroup): string {
  return g === "voice" ? tr("🎙️ Глас", "🎙️ Voice") : g === "music" ? tr("🎵 Плейър", "🎵 Player") : tr("💬 Канали и навигация", "💬 Channels & navigation");
}

/** A key bound to one specific channel (opens it / joins it). */
export interface ChannelHotkey {
  key: string; // unique row id
  kind: "text" | "voice";
  serverId: string;
  channelId: string;
  name: string;
  combo: string | null;
  global: boolean;
}

interface Binding {
  combo: string | null;
  global: boolean;
}

interface HotkeyState {
  /** Only what differs from the defaults. */
  overrides: Partial<Record<HotkeyActionId, Partial<Binding>>>;
  channels: ChannelHotkey[];
  setCombo: (id: HotkeyActionId, combo: string | null) => void;
  setGlobal: (id: HotkeyActionId, on: boolean) => void;
  addChannel: (c: Omit<ChannelHotkey, "key">) => void;
  updateChannel: (key: string, patch: Partial<ChannelHotkey>) => void;
  removeChannel: (key: string) => void;
  resetAll: () => void;
}

const STORAGE_KEY = "hotkeysV1";

function load(): Pick<HotkeyState, "overrides" | "channels"> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<HotkeyState>;
    return { overrides: raw.overrides ?? {}, channels: Array.isArray(raw.channels) ? raw.channels : [] };
  } catch {
    return { overrides: {}, channels: [] };
  }
}

function save(s: Pick<HotkeyState, "overrides" | "channels">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ overrides: s.overrides, channels: s.channels }));
  } catch {
    // storage blocked — works until reload
  }
}

export const useHotkeyStore = create<HotkeyState>((set, get) => {
  const commit = (patch: Partial<Pick<HotkeyState, "overrides" | "channels">>) => {
    set(patch);
    save({ overrides: get().overrides, channels: get().channels });
  };
  return {
    ...load(),
    setCombo: (id, combo) => commit({ overrides: { ...get().overrides, [id]: { ...get().overrides[id], combo } } }),
    setGlobal: (id, on) => commit({ overrides: { ...get().overrides, [id]: { ...get().overrides[id], global: on } } }),
    addChannel: (c) => commit({ channels: [...get().channels, { ...c, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }] }),
    updateChannel: (key, patch) => commit({ channels: get().channels.map((c) => (c.key === key ? { ...c, ...patch } : c)) }),
    removeChannel: (key) => commit({ channels: get().channels.filter((c) => c.key !== key) }),
    resetAll: () => commit({ overrides: {}, channels: get().channels.map((c) => ({ ...c, combo: null })) }),
  };
});

export function bindingFor(state: Pick<HotkeyState, "overrides">, def: HotkeyActionDef): Binding {
  const o = state.overrides[def.id];
  return {
    combo: o && "combo" in o ? (o.combo ?? null) : def.defaultCombo,
    // Voice + player keys work in games by default; the rest only make sense in the app.
    global: def.canBeGlobal && (o?.global ?? true),
  };
}

/* ───────────── combos ───────────── */

const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

export interface Mods {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export function makeCombo(code: string, m: Mods): string {
  return [m.ctrl && "Ctrl", m.alt && "Alt", m.shift && "Shift", m.meta && "Meta", code].filter(Boolean).join("+");
}

function comboParts(combo: string): { mods: Mods; code: string } {
  const parts = combo.split("+");
  const code = parts[parts.length - 1] ?? "";
  const set = new Set(parts.slice(0, -1));
  return { code, mods: { ctrl: set.has("Ctrl"), alt: set.has("Alt"), shift: set.has("Shift"), meta: set.has("Meta") } };
}

/** Keys that are fine on their own (no Ctrl/Alt/Shift needed). */
export function standaloneOk(code: string): boolean {
  return /^(F\d{1,2}|Mouse\d|Numpad.*|Insert|Home|End|PageUp|PageDown|Pause|ScrollLock|MediaPlayPause|MediaTrack(Next|Previous)|AudioVolume(Up|Down|Mute))$/.test(code);
}

/** Can this combo be saved? (A plain letter would fire while typing / playing.) */
export function comboAllowed(combo: string): boolean {
  const { code, mods } = comboParts(combo);
  if (!code || isModifierCode(code)) return false;
  return mods.ctrl || mods.alt || mods.meta || (mods.shift && !/^(Key|Digit)/.test(code) && code !== "Space") || standaloneOk(code);
}

export function describeCode(code: string): string {
  const known: Record<string, string> = {
    Mouse3: tr("Среден бутон на мишката", "Middle mouse button"),
    Mouse4: tr("Мишка: бутон Назад", "Mouse: Back button"),
    Mouse5: tr("Мишка: бутон Напред", "Mouse: Forward button"),
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
    Space: tr("Интервал", "Space"),
    Escape: "Esc",
    Enter: "Enter",
    Backspace: "Backspace",
    MediaPlayPause: "⏯",
    MediaTrackNext: "⏭",
    MediaTrackPrevious: "⏮",
    ControlLeft: tr("Ляв Ctrl", "Left Ctrl"),
    ControlRight: tr("Десен Ctrl", "Right Ctrl"),
    AltLeft: tr("Ляв Alt", "Left Alt"),
    AltRight: tr("Десен Alt", "Right Alt"),
    ShiftLeft: tr("Ляв Shift", "Left Shift"),
    ShiftRight: tr("Десен Shift", "Right Shift"),
    CapsLock: "Caps Lock",
    Tab: "Tab",
  };
  if (known[code]) return known[code];
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
}

export function describeCombo(combo: string | null): string {
  if (!combo) return "—";
  const { code, mods } = comboParts(combo);
  return [mods.ctrl && "Ctrl", mods.alt && "Alt", mods.shift && "Shift", mods.meta && "Win", describeCode(code)].filter(Boolean).join(" + ");
}

/** e.button → our mouse code (only the extra buttons; left/right stay normal clicks). */
export function mouseCode(button: number): string | null {
  return button === 1 ? "Mouse3" : button === 3 ? "Mouse4" : button === 4 ? "Mouse5" : null;
}

/* ───────────── listening ───────────── */

export type HotkeyTarget = { kind: "action"; id: HotkeyActionId } | { kind: "channel"; channel: ChannelHotkey };

let capturing = false;
/** While the settings wait for a new combo, nothing runs. */
export function setHotkeyCapture(on: boolean) {
  capturing = on;
}

function find(combo: string, globalOnly: boolean): HotkeyTarget | null {
  const s = useHotkeyStore.getState();
  for (const def of HOTKEY_ACTIONS) {
    const b = bindingFor(s, def);
    if (b.combo === combo && (!globalOnly || b.global)) return { kind: "action", id: def.id };
  }
  for (const c of s.channels) {
    if (c.combo === combo && (!globalOnly || (c.kind === "voice" && c.global))) return { kind: "channel", channel: c };
  }
  return null;
}

/** Which action/channel already uses this combo (for the "taken by …" swap in the settings). */
export function findBinding(combo: string): HotkeyTarget | null {
  return find(combo, false);
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "range", "button", "submit", "color", "file"].includes(el.type);
  return el instanceof HTMLSelectElement;
}

/** Combos that would steal normal typing / text selection inside a text box. */
function typingCombo(code: string, m: Mods): boolean {
  if (m.ctrl || m.alt || m.meta) {
    // Ctrl+Shift+arrows select words, Ctrl+Backspace deletes one… — keep those for the text box.
    if (!m.alt && /^(Arrow|Home$|End$|Backspace$|Delete$|PageUp$|PageDown$)/.test(code)) return true;
    return false;
  }
  return !standaloneOk(code) || /^Numpad/.test(code);
}

/**
 * Starts listening; `run` gets whatever a pressed combo is bound to. Returns a stop function.
 */
export function startHotkeys(run: (t: HotkeyTarget, fromGame: boolean) => void): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (capturing || e.repeat || e.isComposing || isModifierCode(e.code) || !e.code) return;
    const m = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    if (isEditable(e.target) && typingCombo(e.code, m)) return;
    const target = find(makeCombo(e.code, m), false);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    run(target, false);
  };

  // Mouse back/forward would also navigate the page — swallowed when they're bound.
  const boundMouse = (e: MouseEvent) => {
    const code = mouseCode(e.button);
    return code ? find(makeCombo(code, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }), false) : null;
  };
  const onMouseDown = (e: MouseEvent) => {
    if (capturing) return;
    const target = boundMouse(e);
    if (!target) return;
    e.preventDefault();
    run(target, false);
  };
  const onMouseUp = (e: MouseEvent) => {
    if (!capturing && boundMouse(e)) e.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("mouseup", onMouseUp, true);
  window.addEventListener("auxclick", onMouseUp, true);

  // Desktop app: every key (and, from 1.10.0, the extra mouse buttons) anywhere in Windows.
  const held = new Set<string>();
  const offGlobal =
    window.shmirkaDesktop?.onGlobalKey((code, down) => {
      if (!down) {
        held.delete(code);
        return;
      }
      const repeat = held.has(code);
      held.add(code);
      if (repeat || capturing || isModifierCode(code) || document.hasFocus()) return;
      const m = {
        ctrl: held.has("ControlLeft") || held.has("ControlRight"),
        alt: held.has("AltLeft") || held.has("AltRight"),
        shift: held.has("ShiftLeft") || held.has("ShiftRight"),
        meta: held.has("MetaLeft") || held.has("MetaRight"),
      };
      const target = find(makeCombo(code, m), true);
      if (target) run(target, true);
    }) ?? null;
  // A key released while we weren't told (focus moved mid-press) must not stay "held".
  const clearHeld = () => held.clear();
  window.addEventListener("focus", clearHeld);

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("mousedown", onMouseDown, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("auxclick", onMouseUp, true);
    window.removeEventListener("focus", clearHeld);
    offGlobal?.();
  };
}

/* ───────────── targets owned by components ───────────── */

// Some actions belong to a component that's on screen (the voice recorder in the open chat, the
// music player's volume, a watched stream's clip buffer). They register here; the newest wins.
type TargetFn = (arg?: number) => void;
const targets = new Map<string, TargetFn[]>();

export function registerHotkeyTarget(name: string, fn: TargetFn): () => void {
  const list = targets.get(name) ?? [];
  list.push(fn);
  targets.set(name, list);
  return () => {
    const l = targets.get(name);
    if (!l) return;
    const i = l.lastIndexOf(fn);
    if (i >= 0) l.splice(i, 1);
  };
}

/** Registers `fn` for as long as the component is mounted (always calls the newest `fn`). */
export function useHotkeyTarget(name: string, fn: TargetFn, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    return registerHotkeyTarget(name, (arg) => ref.current(arg));
  }, [name, enabled]);
}

/** false = nothing on screen handles it right now. */
export function runHotkeyTarget(name: string, arg?: number): boolean {
  const list = targets.get(name);
  const fn = list?.[list.length - 1];
  if (!fn) return false;
  fn(arg);
  return true;
}
