import { useRef, useState } from "react";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { setPersonalLook, type LookTarget } from "../utils/personalLooks";
import { tr } from "../i18n";

interface Row {
  key: string;
  label: string;
  target: LookTarget;
  /** What the server has (everyone sees it). */
  server: string | null;
  /** Mine: undefined = like the server, "" = hidden, URL = my picture. */
  own: string | undefined;
}

/**
 * Settings → Външен вид → "Моите картинки": the server's icon / banner / channel backgrounds as I want to
 * see them. Everyone else keeps seeing what the server has. Saved on my account right away.
 */
export default function MyLooksCard() {
  const looks = useAuthStore((s) => s.user?.personalLooks ?? null);
  const { servers, activeServerId, textChannels, voiceChannels } = useServerStore();
  const server = servers.find((s) => s.id === activeServerId) ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Row | null>(null);

  if (!server) {
    return (
      <section className="set-card">
        <h3 className="set-card-title">{tr("🖼️ Моите картинки", "🖼️ My pictures")}</h3>
        <p className="set-card-hint">{tr("Отвори сървър, за да смениш картинките му само за себе си.", "Open a server to change its pictures just for you.")}</p>
      </section>
    );
  }

  const own = looks?.servers?.[server.id];
  const rows: Row[] = [
    { key: "icon", label: tr("Икона на сървъра", "Server icon"), target: { kind: "icon", serverId: server.id }, server: server.iconUrl, own: own?.icon },
    { key: "banner", label: tr("Банер", "Banner"), target: { kind: "banner", serverId: server.id }, server: server.bannerUrl ?? null, own: own?.banner },
    ...textChannels
      .filter((c) => c.serverId === server.id)
      .map((c) => ({ key: c.id, label: `# ${c.name}`, target: { kind: "channel", channelId: c.id } as LookTarget, server: c.backgroundUrl, own: looks?.channels?.[c.id] })),
    ...voiceChannels
      .filter((c) => c.serverId === server.id)
      .map((c) => ({ key: c.id, label: `🔊 ${c.name}`, target: { kind: "channel", channelId: c.id } as LookTarget, server: c.backgroundUrl, own: looks?.channels?.[c.id] })),
  ];

  async function set(row: Row, value: string | undefined) {
    setBusy(row.key);
    setError(null);
    try {
      await setPersonalLook(row.target, value);
    } catch {
      setError(tr("Не успях да запазя — опитай пак.", "Couldn't save — try again."));
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const row = pending.current;
    if (!file || !row) return;
    setBusy(row.key);
    setError(null);
    try {
      const url = await uploadImageToCloudinary(file);
      await setPersonalLook(row.target, url);
    } catch {
      setError(tr("Качването не успя — опитай пак.", "The upload failed — try again."));
    } finally {
      setBusy(null);
    }
  }

  const canUpload = isCloudinaryConfigured();

  return (
    <section className="set-card my-looks-card">
      <h3 className="set-card-title">
        {tr("🖼️ Моите картинки", "🖼️ My pictures")} — {server.name}
      </h3>
      <p className="set-card-hint">
        {tr(
          "Всички виждат картинките, които е сложил сървърът. Тук можеш да си сложиш свои (или да скриеш някоя) — виждаш ги само ти, на всичките си устройства.",
          "Everyone sees the pictures the server has. Here you can put your own (or hide one) — only you see them, on all your devices.",
        )}
      </p>
      <div className="set-card-body">
        {error && <p className="set-hint warn">{error}</p>}
        <div className="my-looks-list">
          {rows.map((row) => {
            const shown = row.own === undefined ? row.server : row.own || null;
            const state = row.own === undefined ? "server" : row.own ? "mine" : "hidden";
            return (
              <div key={row.key} className={`my-looks-row ${state}`}>
                <span className={`my-looks-thumb ${row.key === "icon" ? "round" : ""}`}>
                  {shown ? <img src={shown} alt="" /> : <span>—</span>}
                </span>
                <span className="my-looks-text">
                  <span className="my-looks-label">{row.label}</span>
                  <span className="my-looks-state">
                    {state === "server"
                      ? row.server
                        ? tr("като на сървъра", "same as the server")
                        : tr("сървърът няма", "the server has none")
                      : state === "mine"
                        ? tr("✨ моя — виждам я само аз", "✨ mine — only I see it")
                        : tr("🚫 скрита при мен", "🚫 hidden for me")}
                  </span>
                </span>
                <span className="my-looks-buttons">
                  <button
                    type="button"
                    className="set-button"
                    disabled={!!busy || !canUpload}
                    onClick={() => {
                      pending.current = row;
                      fileRef.current?.click();
                    }}
                  >
                    {busy === row.key ? tr("Момент…", "One sec…") : tr("📤 Моя", "📤 Mine")}
                  </button>
                  {state !== "hidden" && (row.server || row.own) && (
                    <button type="button" className="set-button" disabled={!!busy} onClick={() => void set(row, "")}>
                      {tr("Скрий", "Hide")}
                    </button>
                  )}
                  {state !== "server" && (
                    <button type="button" className="set-button" disabled={!!busy} onClick={() => void set(row, undefined)}>
                      {tr("↺ Като на сървъра", "↺ Server's")}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
      </div>
    </section>
  );
}
