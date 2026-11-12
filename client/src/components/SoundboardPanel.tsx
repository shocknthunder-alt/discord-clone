import { BUILTIN_SOUNDS, SocketEvents, type SoundboardSoundDTO } from "@discord-clone/shared";
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

const MAX_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const QUICK_EMOJIS = ["🔊", "😂", "🎺", "🥁", "💥", "👏", "😱", "🐐", "💀", "🔥", "🤡", "🎉"];

/** Reads a local audio file's length (ms) before uploading it. */
function audioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(a.duration * 1000));
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Файлът не е аудио, което браузърът може да пусне."));
    };
    a.src = url;
  });
}

interface Editing {
  id: string | null; // null = new sound
  name: string;
  emoji: string;
  volume: number;
  file: File | null;
  previewUrl: string | null;
  durationMs: number;
}

const EMPTY: Editing = { id: null, name: "", emoji: "🔊", volume: 80, file: null, previewUrl: null, durationMs: 0 };

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

  useEffect(() => () => {
    if (editing?.previewUrl) URL.revokeObjectURL(editing.previewUrl);
  }, [editing?.previewUrl]);

  function play(sound: SoundboardSoundDTO) {
    getSocket()?.emit(SocketEvents.SoundboardPlay, { soundId: sound.id });
    setLastPlayed(sound.id);
    setTimeout(() => setLastPlayed((id) => (id === sound.id ? null : id)), 400);
  }

  const canEdit = (s: SoundboardSoundDTO) => !!s.uploaderId && (s.uploaderId === me || server?.ownerId === me);

  async function pickFile(file: File | undefined) {
    if (!file || !editing) return;
    setError(null);
    if (file.size > MAX_BYTES) return setError("Файлът е над 2 MB.");
    try {
      const ms = await audioDuration(file);
      if (ms > MAX_MS + 300) return setError(`Звукът е ${(ms / 1000).toFixed(1)} сек — максимумът е 10 сек.`);
      setEditing({
        ...editing,
        file,
        durationMs: ms,
        previewUrl: URL.createObjectURL(file),
        name: editing.name || file.name.replace(/\.[^.]+$/, "").slice(0, 32),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не може да се прочете файлът.");
    }
  }

  async function save() {
    if (!editing || !serverId) return;
    if (!editing.name.trim()) return setError("Дай име на звука.");
    setBusy(true);
    setError(null);
    try {
      if (editing.id) {
        await updateSound(serverId, editing.id, { name: editing.name, emoji: editing.emoji, volume: editing.volume });
      } else {
        if (!editing.file) throw new Error("Избери аудио файл.");
        const { url, durationMs } = await uploadAudioToCloudinary(editing.file);
        await createSound(serverId, {
          name: editing.name,
          emoji: editing.emoji,
          url,
          durationMs: durationMs || editing.durationMs,
          volume: editing.volume,
        });
      }
      setSounds(await fetchSounds(serverId));
      setEditing(null);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? (err instanceof Error ? err.message : "Не се запази."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(sound: SoundboardSoundDTO) {
    if (!serverId || !window.confirm(`Да изтрия ли „${sound.name}“?`)) return;
    await deleteSound(serverId, sound.id).catch(() => {});
    setSounds(await fetchSounds(serverId));
  }

  const all = [...BUILTIN_SOUNDS, ...sounds];

  return createPortal(
    <div className="sb-panel" role="dialog" aria-label="Soundboard">
      <header className="sb-head">
        <span>🔊 Soundboard</span>
        <button className="sb-x" onClick={onClose} title="Затвори (Esc)">
          ✕
        </button>
      </header>

      <div className="sb-volume">
        <button
          className="sb-mute"
          onClick={() => prefs.set({ soundboardEnabled: !prefs.soundboardEnabled })}
          title={prefs.soundboardEnabled ? "Заглуши soundboard (само за теб)" : "Включи soundboard"}
        >
          {prefs.soundboardEnabled ? "🔊" : "🔇"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.soundboardVolume}
          onChange={(e) => prefs.set({ soundboardVolume: Number(e.target.value), soundboardEnabled: true })}
          aria-label="Твоята сила на soundboard"
        />
        <span className="sb-volume-value">{prefs.soundboardVolume}%</span>
      </div>

      <div className="sb-grid">
        {all.map((s) => (
          <div key={s.id} className={`sb-tile ${lastPlayed === s.id ? "pressed" : ""}`}>
            <button className="sb-play" onClick={() => play(s)} title={`${s.name} — пусни за всички`}>
              <span className="sb-emoji">{s.emoji}</span>
              <span className="sb-name">{s.name}</span>
            </button>
            <div className="sb-tools">
              <button title="Чуй само ти" onClick={() => playSoundboardClip(s.url, s.volume, { force: true })}>
                👂
              </button>
              {canEdit(s) && (
                <>
                  <button
                    title="Редактирай"
                    onClick={() =>
                      setEditing({ id: s.id, name: s.name, emoji: s.emoji, volume: s.volume, file: null, previewUrl: null, durationMs: s.durationMs })
                    }
                  >
                    ✎
                  </button>
                  <button title="Изтрий" onClick={() => void remove(s)}>
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
            <span className="sb-name">Добави звук</span>
          </button>
        )}
      </div>

      {editing && (
        <div className="sb-form">
          <div className="sb-form-title">{editing.id ? "Редактирай звук" : "Нов звук (до 10 сек, mp3/ogg/wav, до 2 MB)"}</div>
          {!editing.id && (
            <div className="sb-row">
              <button className="sb-btn" onClick={() => fileRef.current?.click()}>
                {editing.file ? "Друг файл…" : "Избери файл…"}
              </button>
              <span className="sb-file">
                {editing.file ? `${editing.file.name} · ${(editing.durationMs / 1000).toFixed(1)} сек` : "няма избран"}
              </span>
              <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
            </div>
          )}
          <div className="sb-row">
            <input
              className="sb-input"
              placeholder="Име"
              maxLength={32}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className="sb-input sb-emoji-input"
              value={editing.emoji}
              maxLength={8}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
              title="Емоджи"
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
            <span className="sb-label">Сила на звука</span>
            <input
              type="range"
              min={5}
              max={100}
              value={editing.volume}
              onChange={(e) => setEditing({ ...editing, volume: Number(e.target.value) })}
            />
            <span className="sb-volume-value">{editing.volume}%</span>
            <button
              className="sb-btn"
              disabled={!editing.previewUrl && !editing.id}
              onClick={() => {
                const url = editing.previewUrl ?? all.find((s) => s.id === editing.id)?.url;
                if (url) playSoundboardClip(url, editing.volume, { force: true });
              }}
            >
              ▶ Чуй
            </button>
          </div>
          {error && <div className="sb-error">{error}</div>}
          <div className="sb-row sb-actions">
            <button className="sb-btn" onClick={() => setEditing(null)} disabled={busy}>
              Откажи
            </button>
            <button className="sb-btn primary" onClick={() => void save()} disabled={busy || (!editing.id && !editing.file)}>
              {busy ? "Качване…" : editing.id ? "Запази" : "Качи"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
