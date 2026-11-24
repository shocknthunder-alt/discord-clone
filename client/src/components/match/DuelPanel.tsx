import { memo } from "react";
import type { DuelAttackKind, DuelLobbyDTO, DuelPlayerDTO } from "@discord-clone/shared";
import { tr } from "../../i18n";
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

export function DuelLobby({
  lobby,
  meId,
  onSeek,
  onCancel,
  gameName = "Шмиксер",
}: {
  lobby: DuelLobbyDTO | null;
  meId: string | undefined;
  onSeek: (withId?: string) => void;
  onCancel: () => void;
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
      {!!lobby?.playing.length && (
        <div className="mx-lobby-list">
          {lobby.playing.map((d) => (
            <div key={d.a.userId + d.b.userId} className="mx-lobby-row live">
              ⚔️ {d.a.username} <b>{fmt(d.scoreA)}</b> : <b>{fmt(d.scoreB)}</b> {d.b.username}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
