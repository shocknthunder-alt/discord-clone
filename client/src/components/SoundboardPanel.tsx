import { BUILTIN_SOUNDS, Perm, SocketEvents, hasPerm, type SoundboardSoundDTO } from "@discord-clone/shared";
import { useMembersStore } from "../store/membersStore";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isCloudinaryConfigured, uploadAudioToCloudinary } from "../api/cloudinary";
import { createSound, deleteSound, fetchSounds, updateSound } from "../api/soundboard.api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { useAppPrefs } from "../utils/appPrefs";
import { playSoundboardClip } from "../utils/soundboardPlayer";
import "./soundboard.css";
import WaveformTrimmer, { encodeSelectionWav } from "./WaveformTrimmer";
import { tr } from "../i18n";

const MAX_SEC = 10;
/** The source file may be long — you cut a ≤10 s part out of it. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_SEC = 180;
const QUICK_EMOJIS = ["🔊", "😂", "🎺", "🥁", "💥", "👏", "😱", "🐐", "💀", "🔥", "🤡", "🎉"];

/** Decodes a local audio file so it can be drawn and cut. */
async function decodeFile(file: File): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(tr("Файлът не е аудио, което може да се отвори (пробвай mp3, ogg или wav).", "The file isn't audio that can be opened (try mp3, ogg or wav)."));
  } finally {
    void ctx.close();
  }
}

interface Editing {
  id: string | null; // null = new sound
  name: string;
  emoji: string;
  volume: number;
  file: File | null;
  buffer: AudioBuffer | null;
  /** The part to keep, seconds. */
  start: number;
  end: number;
}

const EMPTY: Editing = { id: null, name: "", emoji: "🔊", volume: 80, file: null, buffer: null, start: 0, end: 0 };

/** The 🔊 panel: click a tile to play it for everyone in the voice channel. */
export default function SoundboardPanel({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  // In a DM call there is no server: only the built-in clips.
  const inDmCall = useVoiceStore((s) => s.activeVoiceChannelId?.startsWith("dm:") ?? false);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const serverId = inDmCall ? null : activeServerId;
  const server = useServerStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const me = useAuthStore((s) => s.user?.id);
  const prefs = useAppPrefs();
  const [sounds, setSounds] = useState<SoundboardSoundDTO[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!serverId) return;
    const load = () => fetchSounds(serverId).then(setSounds).catch(() => {});
    load();
    const socket = getSocket();
    const onChanged = ({ serverId: changed }: { serverId: string }) => {
      if (changed === serverId) load();
    };
    socket?.on(SocketEvents.SoundboardChanged, onChanged);
    return () => {
      socket?.off(SocketEvents.SoundboardChanged, onChanged);
    };
  }, [serverId]);

  function play(sound: SoundboardSoundDTO) {
    getSocket()?.emit(SocketEvents.SoundboardPlay, { soundId: sound.id });
    setLastPlayed(sound.id);
    setTimeout(() => setLastPlayed((id) => (id === sound.id ? null : id)), 400);
  }

  const canManageAll = useMembersStore((st) => st.serverId === serverId && hasPerm(st.myPermissions, Perm.MANAGE_SOUNDBOARD));
  const canEdit = (s: SoundboardSoundDTO) => !!s.uploaderId && (s.uploaderId === me || canManageAll || server?.ownerId === me);

  async function pickFile(file: File | undefined) {
    if (!file || !editing) return;
    setError(null);
    if (file.size > MAX_SOURCE_BYTES) return setError(tr("Файлът е над 25 MB.", "The file is over 25 MB."));
    try {
      const buffer = await decodeFile(file);
      if (buffer.duration > MAX_SOURCE_SEC) return setError(tr("Файлът е над 3 минути — избери по-кратък.", "The file is over 3 minutes — pick a shorter one."));
      setEditing({
        ...editing,
        file,
        buffer,
        start: 0,
        end: Math.min(buffer.duration, MAX_SEC),
        name: editing.name || file.name.replace(/\.[^.]+$/, "").slice(0, 32),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Не може да се прочете файлът.", "The file can't be read."));
    }
  }

  async function save() {
    if (!editing || !serverId) return;
    if (!editing.name.trim()) return setError(tr("Дай име на звука.", "Give the sound a name."));
    setBusy(true);
    setError(null);
    try {
      if (editing.id) {
        await updateSound(serverId, editing.id, { name: editing.name, emoji: editing.emoji, volume: editing.volume });
      } else {
        if (!editing.buffer) throw new Error(tr("Избери аудио файл.", "Pick an audio file."));
        // Only the chosen part is uploaded (mono WAV); Cloudinary serves it back as mp3.
        const clip = encodeSelectionWav(editing.buffer, editing.start, editing.end);
        const { url } = await uploadAudioToCloudinary(clip);
        await createSound(serverId, {
          name: editing.name,
          emoji: editing.emoji,
          url: url.replace(/\.wav$/i, ".mp3"),
          durationMs: Math.round((editing.end - editing.start) * 1000),
          volume: editing.volume,
        });
      }
      setSounds(await fetchSounds(serverId));
      setEditing(null);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? (err instanceof Error ? err.message : tr("Не се запази.", "It wasn't saved.")));
    } finally {
      setBusy(false);
    }
  }

  async function remove(sound: SoundboardSoundDTO) {
    if (!serverId || !window.confirm(tr(`Да изтрия ли „${sound.name}“?`, `Delete "${sound.name}"?`))) return;
    await deleteSound(serverId, sound.id).catch(() => {});
    setSounds(await fetchSounds(serverId));
  }

  const all = [...BUILTIN_SOUNDS, ...sounds];

  return createPortal(
    <div className={`sb-panel ${editing && !editing.id ? "wide" : ""}`} role="dialog" aria-label="Soundboard">
      <header className="sb-head">
        <span>🔊 Soundboard</span>
        <button className="sb-x" onClick={onClose} title={tr("Затвори (Esc)", "Close (Esc)")}>
          ✕
        </button>
      </header>

      <div className="sb-volume">
        <button
          className="sb-mute"
          onClick={() => prefs.set({ soundboardEnabled: !prefs.soundboardEnabled })}
          title={prefs.soundboardEnabled ? tr("Заглуши soundboard (само за теб)", "Mute the soundboard (only for you)") : tr("Включи soundboard", "Unmute the soundboard")}
        >
          {prefs.soundboardEnabled ? "🔊" : "🔇"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.soundboardVolume}
          onChange={(e) => prefs.set({ soundboardVolume: Number(e.target.value), soundboardEnabled: true })}
          aria-label={tr("Твоята сила на soundboard", "Your soundboard volume")}
        />
        <span className="sb-volume-value">{prefs.soundboardVolume}%</span>
      </div>

      <div className="sb-grid">
        {all.map((s) => (
          <div key={s.id} className={`sb-tile ${lastPlayed === s.id ? "pressed" : ""}`}>
            <button className="sb-play" onClick={() => play(s)} title={`${s.name} — ${tr("пусни за всички", "play for everyone")}`}>
              <span className="sb-emoji">{s.emoji}</span>
              <span className="sb-name">{s.name}</span>
            </button>
            <div className="sb-tools">
              <button title={tr("Чуй само ти", "Preview (only you)")} onClick={() => playSoundboardClip(s.url, s.volume, { force: true })}>
                👂
              </button>
              {canEdit(s) && (
                <>
                  <button
                    title={tr("Редактирай", "Edit")}
                    onClick={() => setEditing({ ...EMPTY, id: s.id, name: s.name, emoji: s.emoji, volume: s.volume })}
                  >
                    ✎
                  </button>
                  <button title={tr("Изтрий", "Delete")} onClick={() => void remove(s)}>
                    🗑
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {serverId && isCloudinaryConfigured() && (
          <button
            className="sb-tile sb-add"
            onClick={() => {
              setError(null);
              setEditing({ ...EMPTY });
            }}
          >
            <span className="sb-emoji">＋</span>
            <span className="sb-name">{tr("Добави звук", "Add sound")}</span>
          </button>
        )}
      </div>

      {editing && (
        <div className="sb-form">
          <div className="sb-form-title">
            {editing.id ? tr("Редактирай звук", "Edit sound") : tr("Нов звук — избери файл и изрежи до 10 сек", "New sound — pick a file and trim it to 10 s")}
          </div>
          {!editing.id && (
            <div className="sb-row">
              <button className="sb-btn" onClick={() => fileRef.current?.click()}>
                {editing.file ? tr("Друг файл…", "Another file…") : tr("Избери файл…", "Pick a file…")}
              </button>
              <span className="sb-file">
                {editing.file && editing.buffer
                  ? `${editing.file.name} · ${editing.buffer.duration.toFixed(1)} ${tr("сек", "s")}`
                  : tr("mp3 / ogg / wav, до 3 мин", "mp3 / ogg / wav, up to 3 min")}
              </span>
              <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
            </div>
          )}
          {!editing.id && editing.buffer && (
            <WaveformTrimmer
              key={editing.file?.name + String(editing.buffer.length)}
              buffer={editing.buffer}
              start={editing.start}
              end={editing.end}
              maxLength={MAX_SEC}
              volume={editing.volume}
              onChange={(start, end) => setEditing((ed) => (ed ? { ...ed, start, end } : ed))}
            />
          )}
          <div className="sb-row">
            <input
              className="sb-input"
              placeholder={tr("Име", "Name")}
              maxLength={32}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className="sb-input sb-emoji-input"
              value={editing.emoji}
              maxLength={8}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
              title={tr("Емоджи", "Emoji")}
            />
          </div>
          <div className="sb-quick">
            {QUICK_EMOJIS.map((e) => (
              <button key={e} className={editing.emoji === e ? "on" : ""} onClick={() => setEditing({ ...editing, emoji: e })}>
                {e}
              </button>
            ))}
          </div>
          <div className="sb-row">
            <span className="sb-label">{tr("Сила на звука", "Volume")}</span>
            <input
              type="range"
              min={5}
              max={100}
              value={editing.volume}
              onChange={(e) => setEditing({ ...editing, volume: Number(e.target.value) })}
            />
            <span className="sb-volume-value">{editing.volume}%</span>
            {editing.id && (
              <button
                className="sb-btn"
                onClick={() => {
                  const url = all.find((s) => s.id === editing.id)?.url;
                  if (url) playSoundboardClip(url, editing.volume, { force: true, raw: true });
                }}
              >
                ▶ {tr("Чуй", "Play")}
              </button>
            )}
          </div>
          {error && <div className="sb-error">{error}</div>}
          <div className="sb-row sb-actions">
            <button className="sb-btn" onClick={() => setEditing(null)} disabled={busy}>
              {tr("Откажи", "Cancel")}
            </button>
            <button className="sb-btn primary" onClick={() => void save()} disabled={busy || (!editing.id && !editing.buffer)}>
              {busy ? tr("Качване…", "Uploading…") : editing.id ? tr("Запази", "Save") : tr("Качи", "Upload")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
