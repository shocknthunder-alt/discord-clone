import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  SocketEvents,
  type DuelAttackKind,
  type DuelLobbyDTO,
  type DuelPlayerDTO,
  type DuelSpectateDTO,
  type DuelSpectateEventDTO,
  type DuelSpectateOverDTO,
  type DuelSpectateUpdateDTO,
} from "@discord-clone/shared";
import { tr } from "../../i18n";
import { getSocket } from "../../socket/socket";
import { GEM_COLORS } from "./Gems";

/** ⚔️ Duel bits: the opponent's card with a tiny picture of their board, and the lobby (Шмиксер; the lobby also Шметрис). */

export const ATTACK_ICON: Record<DuelAttackKind, string> = { ice: "🧊", stone: "🪨", fog: "🌫️", scramble: "🌀", garbage: "🧱" };
export function attackName(k: DuelAttackKind) {
  return k === "ice" ? tr("Лед", "Ice") : k === "stone" ? tr("Камъни", "Stones") : k === "fog" ? tr("Мъгла", "Fog") : k === "garbage" ? tr("Боклук", "Garbage") : tr("Разбъркване", "Scramble");
}

const fmt = (n: number) => n.toLocaleString("bg-BG");

function Avatar({ p }: { p: DuelPlayerDTO }) {
  return p.avatarUrl ? <img className="mx-duel-ava" src={p.avatarUrl} alt="" /> : <span className="mx-duel-ava">{p.username[0]?.toUpperCase()}</span>;
}

/** Codes from MatchBoard.codes(): 0..5 colour, 6 prism, 7 stone; +10 special, +20 ice. */
export const MiniBoard = memo(function MiniBoard({ codes }: { codes: number[] | null }) {
  return (
    <div className="mx-mini">
      {(codes ?? Array(64).fill(-1)).map((v, i) => {
        if (v < 0) return <i key={i} />;
        const ice = v >= 20;
        const base = v % 20;
        const special = base >= 10;
        const k = base % 10;
        const bg = k === 7 ? "#6b6672" : k === 6 ? "conic-gradient(#ff4d6d, #ffc53d, #33d17a, #3d9bff, #b06bff, #ff4d6d)" : GEM_COLORS[k];
        return <i key={i} className={`${special ? "sp" : ""} ${ice ? "ice" : ""} ${k === 7 ? "stone" : ""}`} style={{ background: bg }} />;
      })}
    </div>
  );
});

export function OpponentCard({ opp, score, board, myScore, combo }: { opp: DuelPlayerDTO; score: number; board: number[] | null; myScore: number; combo: number }) {
  const lead = myScore - score;
  return (
    <div className="blk-box mx-opp">
      <div className="blk-label">⚔️ {tr("Противник", "Opponent")}</div>
      <div className="mx-opp-head">
        <Avatar p={opp} />
        <b>{opp.username}</b>
      </div>
      <div className="mx-opp-score">{fmt(score)}</div>
      {combo >= 3 && (
        <div className="mx-opp-combo" key={combo}>
          {tr("комбо", "combo")} ×{combo}
        </div>
      )}
      <MiniBoard codes={board} />
      <div className={`mx-opp-lead ${lead > 0 ? "up" : lead < 0 ? "down" : ""}`}>
        {lead > 0 ? `▲ ${tr("водиш с", "you lead by")} ${fmt(lead)}` : lead < 0 ? `▼ ${tr("изоставаш с", "behind by")} ${fmt(-lead)}` : tr("равенство", "tied")}
      </div>
    </div>
  );
}

/** What attacks the combos send (shown in the lobby and the help box). */
export function AttackHelp() {
  return (
    <div className="mx-duel-help">
      <div>
        🧊 <b>{tr("Лед", "Ice")}</b> — {tr("комбо ×4+ или светулка: камъчета замръзват (не се местят)", "combo ×4+ or a firefly: gems freeze (can't be moved)")}
      </div>
      <div>
        🌫️ <b>{tr("Мъгла", "Fog")}</b> — {tr("ракета: полето му се скрива за няколко секунди", "a rocket: their board is hidden for a few seconds")}
      </div>
      <div>
        🪨 <b>{tr("Камъни", "Stones")}</b> — {tr("бомба: камъни горе (чупят се с ход до тях или взрив)", "a bomb: stones on top (a match next to them or a blast breaks them)")}
      </div>
      <div>
        🌀 <b>{tr("Разбъркване", "Scramble")}</b> — {tr("призма: цветовете му се разбъркват", "a prism: their colours get mixed")}
      </div>
      <div>
        🛡 {tr("Идва атака? Направи силен ход, докато трепти — блокираш я!", "An attack is coming? Make a strong move while it flashes — you block it!")}
      </div>
      <div>🔥 {tr("С огнен множител ×2+ атаките са по-силни.", "With a ×2+ fever attacks are stronger.")}</div>
    </div>
  );
}

/** Running duels of the channel with 👁 Гледай (not your own). */
export function LiveDuels({ lobby, meId, onSpectate }: { lobby: DuelLobbyDTO | null; meId: string | undefined; onSpectate: (duelId: string) => void }) {
  if (!lobby?.playing.length) return null;
  return (
    <div className="mx-lobby-list">
      {lobby.playing.map((d) => {
        const mine = d.a.userId === meId || d.b.userId === meId;
        return (
          <div key={d.a.userId + d.b.userId} className="mx-lobby-row live">
            <span className="mx-live-names">
              ⚔️ {d.a.username} <b>{fmt(d.scoreA)}</b> : <b>{fmt(d.scoreB)}</b> {d.b.username}
            </span>
            {!!d.spectators && <span className="mx-live-eyes" title={tr("гледат", "watching")}>👁 {d.spectators}</span>}
            {d.duelId && !mine && (
              <button className="mx-spectate-btn" onClick={() => onSpectate(d.duelId!)}>
                👁 {tr("Гледай", "Watch")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * 👁 Watching someone else's duel: both boards side by side, scores, the clock, attacks as they fly,
 * the result. Boards are drawn by the game (`renderBoard`: Шмиксер MiniBoard / Шметрис MiniWell).
 */
export function DuelSpectator({
  channelId,
  duelId,
  gameName,
  linesLabel = false,
  renderBoard,
  onClose,
}: {
  channelId: string;
  duelId: string;
  gameName: string;
  /** Шметрис: the "combo" field carries the cleared lines */
  linesLabel?: boolean;
  renderBoard: (codes: number[] | null) => ReactNode;
  onClose: () => void;
}) {
  const [st, setSt] = useState<DuelSpectateDTO | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [boards, setBoards] = useState<Record<string, number[] | null>>({});
  const [combos, setCombos] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, { text: string; at: number; hit?: boolean }>>({});
  const [over, setOver] = useState<DuelSpectateOverDTO | null>(null);
  const [gone, setGone] = useState(false);
  const offset = useRef(0);
  const stRef = useRef<DuelSpectateDTO | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const ask = () => setTimeout(() => socket.emit(SocketEvents.MatchSpectate, { channelId, duelId }), 150);
    const onState = (s: DuelSpectateDTO) => {
      if (s.duelId !== duelId) return;
      offset.current = Date.now() - s.serverNow;
      stRef.current = s;
      setSt(s);
      setScores({ [s.a.userId]: s.scoreA, [s.b.userId]: s.scoreB });
      setBoards({ [s.a.userId]: s.boardA ?? null, [s.b.userId]: s.boardB ?? null });
    };
    const onUpdate = (u: DuelSpectateUpdateDTO) => {
      if (u.duelId !== duelId) return;
      setScores((m) => ({ ...m, [u.userId]: u.score }));
      if (u.board) setBoards((m) => ({ ...m, [u.userId]: u.board! }));
      if (u.combo !== undefined) setCombos((m) => ({ ...m, [u.userId]: u.combo! }));
    };
    const onEvent = (e: DuelSpectateEventDTO) => {
      if (e.duelId !== duelId) return;
      const cur = stRef.current;
      if (!cur) return;
      const target = e.from === cur.a.userId ? cur.b.userId : cur.a.userId;
      const now = Date.now();
      if (e.type === "block") setFlash((f) => ({ ...f, [e.from]: { text: `🛡 ${tr("Блокира!", "Blocked!")}`, at: now } }));
      else if (e.kind) {
        const what = e.kind === "garbage" ? `🧱 +${e.power ?? 1} ${tr("реда", "rows")}` : `${ATTACK_ICON[e.kind]} ${attackName(e.kind)}`;
        setFlash((f) => ({ ...f, [e.from]: { text: `⚔️ ${what} →`, at: now }, [target]: { text: `⚠️ ${what}`, at: now, hit: true } }));
      }
    };
    const onOver = (o: DuelSpectateOverDTO) => {
      if (o.duelId !== duelId) return;
      setOver(o);
    };
    ask();
    socket.on("connect", ask);
    socket.on(SocketEvents.MatchSpectateState, onState);
    socket.on(SocketEvents.MatchSpectateUpdate, onUpdate);
    socket.on(SocketEvents.MatchSpectateEvent, onEvent);
    socket.on(SocketEvents.MatchSpectateOver, onOver);
    // nothing came back: the duel is over already
    const missing = setTimeout(() => setGone(true), 4000);
    const clock = setInterval(() => tick((n) => n + 1), 250);
    return () => {
      socket.emit(SocketEvents.MatchSpectateStop, { duelId });
      socket.off("connect", ask);
      socket.off(SocketEvents.MatchSpectateState, onState);
      socket.off(SocketEvents.MatchSpectateUpdate, onUpdate);
      socket.off(SocketEvents.MatchSpectateEvent, onEvent);
      socket.off(SocketEvents.MatchSpectateOver, onOver);
      clearTimeout(missing);
      clearInterval(clock);
    };
  }, [channelId, duelId]);

  const now = Date.now();
  const startsIn = st ? st.startsAt + offset.current - now : 0;
  const left = st ? st.endsAt + offset.current - now : 0;
  const reasonText = (o: DuelSpectateOverDTO, loser: string) =>
    o.reason === "out"
      ? tr(`${loser} се препълни`, `${loser} topped out`)
      : o.reason === "forfeit"
        ? tr(`${loser} се предаде`, `${loser} gave up`)
        : o.reason === "left"
          ? tr(`${loser} излезе`, `${loser} left`)
          : tr("времето свърши", "time is up");

  const side = (p: DuelPlayerDTO, other: DuelPlayerDTO) => {
    const score = scores[p.userId] ?? 0;
    const lead = score - (scores[other.userId] ?? 0);
    const f = flash[p.userId];
    const fresh = f && now - f.at < 2200;
    const combo = combos[p.userId] ?? 0;
    const won = over?.winnerId === p.userId;
    return (
      <div className={`mx-spec-side ${won ? "won" : ""} ${over && over.winnerId && !won ? "lost" : ""}`}>
        <div className="mx-opp-head">
          <Avatar p={p} />
          <b>{p.username}</b>
          {won && <span>🏆</span>}
        </div>
        <div className={`mx-spec-score ${lead > 0 ? "lead" : ""}`}>{fmt(score)}</div>
        <div className="mx-spec-sub">
          {linesLabel ? `${combo} ${tr("реда", "lines")}` : combo >= 3 ? `${tr("комбо", "combo")} ×${combo}` : " "}
        </div>
        <div className={`mx-spec-board ${fresh && f.hit ? "hit" : ""}`}>
          {renderBoard(boards[p.userId] ?? null)}
          {fresh && (
            <div key={f.at} className={`mx-spec-flash ${f.hit ? "hit" : ""}`}>
              {f.text}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-spec">
      <div className="mx-spec-head">
        <span>
          👁 {tr("Гледаш дуел", "Watching a duel")} · {gameName}
        </span>
        <span className="mx-spec-clock">{st && !over ? (startsIn > 0 ? `${tr("започва след", "starts in")} ${Math.ceil(startsIn / 1000)}` : `⏱ ${mmss(left)}`) : ""}</span>
        <button className="blk-quit" onClick={onClose}>
          ✕ {tr("Затвори", "Close")}
        </button>
      </div>
      {st ? (
        <div className="mx-spec-arena">
          {side(st.a, st.b)}
          <div className="mx-spec-vs">VS</div>
          {side(st.b, st.a)}
        </div>
      ) : (
        <div className="mx-spec-wait">{gone ? tr("Този дуел вече свърши.", "This duel is already over.") : tr("Свързване…", "Connecting…")}</div>
      )}
      {over && st && (
        <div className="mx-spec-over">
          <div className="mx-duel-verdict win">
            {over.winnerId
              ? `🏆 ${(over.winnerId === st.a.userId ? st.a : st.b).username} ${tr("печели!", "wins!")}`
              : tr("Равенство", "Draw")}
          </div>
          <div className="mx-duel-score">
            {fmt(over.scoreA)} : {fmt(over.scoreB)}
          </div>
          {over.winnerId && <div>{reasonText(over, (over.winnerId === st.a.userId ? st.b : st.a).username)}</div>}
          <button className="blk-start" onClick={onClose}>
            {tr("Затвори", "Close")}
          </button>
        </div>
      )}
    </div>
  );
}

export function DuelLobby({
  lobby,
  meId,
  onSeek,
  onCancel,
  onSpectate,
  gameName = "Шмиксер",
}: {
  lobby: DuelLobbyDTO | null;
  meId: string | undefined;
  onSeek: (withId?: string) => void;
  onCancel: () => void;
  onSpectate: (duelId: string) => void;
  /** shown in "ask a friend to open … → ⚔️ Дуел" */
  gameName?: string;
}) {
  const waitingMe = !!lobby?.waiting.some((p) => p.userId === meId);
  const others = lobby?.waiting.filter((p) => p.userId !== meId) ?? [];
  return (
    <div className="mx-lobby">
      {waitingMe ? (
        <>
          <div className="mx-waiting">⏳ {tr("Чакаш противник…", "Waiting for an opponent…")}</div>
          <div className="blk-muted">{tr(`Кажи на приятел да отвори ${gameName} → ⚔️ Дуел.`, `Ask a friend to open ${gameName} → ⚔️ Duel.`)}</div>
          <button className="blk-quit" onClick={onCancel}>
            {tr("Откажи", "Cancel")}
          </button>
        </>
      ) : (
        <button className="blk-start" onClick={() => onSeek()}>
          ⚔️ {others.length ? tr("Играй срещу", "Play against") + " " + others[0]!.username : tr("Търси противник", "Find an opponent")}
        </button>
      )}
      {others.length > (waitingMe ? 0 : 1) && (
        <div className="mx-lobby-list">
          {others.slice(waitingMe ? 0 : 1).map((p) => (
            <div key={p.userId} className="mx-lobby-row">
              <Avatar p={p} />
              <span>
                {p.username} {tr("чака", "is waiting")}
              </span>
              <button onClick={() => onSeek(p.userId)}>{tr("Приеми", "Accept")}</button>
            </div>
          ))}
        </div>
      )}
      <LiveDuels lobby={lobby} meId={meId} onSpectate={onSpectate} />
    </div>
  );
}
